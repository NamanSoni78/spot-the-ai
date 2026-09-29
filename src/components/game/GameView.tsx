"use client";

/**
 * The core play loop: HUD + timer + two cards + reveal panel.
 * Owns the runtime session; reports the final session via onFinish.
 *
 * In Live Forge mode (mode === "live" with a signed-in Pollinations
 * player) the upcoming round is generated on the fly before it is shown:
 * a "forging" overlay covers the table while the fake is being made,
 * and round N+2 is forged in the background while the player answers
 * round N. Every slot has a pre-baked static fallback, so a failed
 * generation never stalls the game.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GameSession,
  GameMode,
  PlayedRound,
  RoundDatum,
  ScoreBreakdown,
} from "@/lib/types";
import {
  MAX_HEARTS,
  ROUNDS_PER_GAME,
  STREAK_TITLES,
  scoreRound,
  timerSeconds,
  tierForRound,
} from "@/lib/game";
import { preloadRound, replacementRound } from "@/lib/rounds";
import { hashString, mulberry32 } from "@/lib/rng";
import { sfx, setMuted, isMuted, initMuted } from "@/lib/sound";
import { imageModelForRound, LIVE_IMAGE_MODELS, TEXT_MODEL, type LiveSession } from "@/lib/pollinations";
import { asLiveFallback, forgeLiveRound, isLiveTextRound, type ForgeStage } from "@/lib/live";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Flame,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Camera,
  ScrollText,
  Loader2,
  Flower2,
  Wand2,
  ImageDown,
  Check,
} from "lucide-react";
import RevealPanel from "./RevealPanel";

interface Props {
  mode: GameMode;
  initialRounds: RoundDatum[];
  /** present only in Live Forge mode (signed-in Pollinations player) */
  liveSession?: LiveSession | null;
  onFinish: (session: GameSession) => void;
  onQuit: () => void;
}

type Choice = "left" | "right";

interface RevealState {
  choice: Choice | null; // null = timed out
  correct: boolean;
  timedOut: boolean;
  points: number;
  breakdown: ScoreBreakdown | null;
  streakAfter: number;
}
export type { RevealState };

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Warm-up",
  2: "Tricky",
  3: "Expert",
};

/** What the forging overlay knows about the round being forged. */
interface ForgingState {
  round: number;
  label: string;
  kind: "image" | "text";
  /** position on the image-model ladder (null on text rounds) */
  modelIndex: number | null;
  stage: ForgeStage;
}

/** Describe the round about to be forged (round1 is 1-based). */
function forgingFor(round1: number): ForgingState {
  if (isLiveTextRound(round1)) {
    return {
      round: round1,
      label: TEXT_MODEL.label,
      kind: "text",
      modelIndex: null,
      stage: "briefing",
    };
  }
  const m = imageModelForRound(round1);
  return {
    round: round1,
    label: m.label,
    kind: "image",
    modelIndex: LIVE_IMAGE_MODELS.findIndex((x) => x.id === m.id),
    stage: "briefing",
  };
}

export default function GameView({
  mode,
  initialRounds,
  liveSession,
  onFinish,
  onQuit,
}: Props) {
  const [session, setSession] = useState<GameSession>(() => ({
    mode,
    rounds: initialRounds,
    played: [],
    score: 0,
    streak: 0,
    bestStreak: 0,
    hearts: MAX_HEARTS,
    startedAt: Date.now(),
  }));
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [msLeft, setMsLeft] = useState(0);
  // GameView never renders during SSR (it mounts only after a user click),
  // so reading localStorage in the lazy initializer is hydration-safe.
  const [muted, setMutedUi] = useState(() =>
    typeof window === "undefined" ? false : initMuted(),
  );

  const datum = session.rounds[idx];
  const isPractice = mode === "practice";
  const isLive = mode === "live" && liveSession !== null;
  const totalMs = useMemo(
    () => (datum ? timerSeconds(datum.difficulty, datum.kind) * 1000 : 0),
    [datum],
  );

  // ---------- live forge state ----------
  // (lazy init: in live mode the table starts covered until round 1 is forged)
  const [forging, setForging] = useState<ForgingState | null>(() =>
    isLive ? forgingFor(1) : null,
  );
  const liveCache = useRef<Map<number, RoundDatum>>(new Map());
  const usedKeys = useRef<Set<string>>(new Set());
  // static fallback plan — live picks must not duplicate these reals
  const reservedKeys = useRef<Set<string>>(
    new Set<string>([
    ...initialRounds
      .filter((d) => d.kind === "image")
      .map((d) => (d.round as { real: { url: string } }).real.url),
    ...initialRounds
      .filter((d) => d.kind === "text")
      .map((d) => (d.round as { real: { source: string } }).real.source),
  ]));
  const tokenRef = useRef<string | null>(liveSession?.token ?? null);

  // stable callback holders for the rAF loop + keyboard listener
  const answerRef = useRef<(c: Choice | null) => void>(() => undefined);
  const advanceRef = useRef<() => void>(() => undefined);
  const inRevealRef = useRef(false);
  // synchronous double-answer guard (reset when advancing)
  const answeredRef = useRef(false);
  const deadlineRef = useRef(0);
  const lastTickRef = useRef(-1);
  const revealBoxRef = useRef<HTMLDivElement | null>(null);

  const applyLiveRound = useCallback((i: number, d: RoundDatum) => {
    setSession((s) => {
      if (s.rounds[i] === d) return s; // already applied
      const rounds = [...s.rounds];
      rounds[i] = d;
      return { ...s, rounds };
    });
  }, []);

  const ensureLiveRound = useCallback(
    async (i: number, foreground = false): Promise<void> => {
      const token = tokenRef.current;
      if (!token) return;
      const cached = liveCache.current.get(i);
      if (cached) {
        applyLiveRound(i, cached);
        if (foreground) setForging(null);
        return;
      }
      const result = await forgeLiveRound({
        token,
        round1: i + 1,
        usedKeys: usedKeys.current,
        reservedKeys: reservedKeys.current,
        // only the foreground forge drives the overlay's stage indicator —
        // the background prefetch must never clobber it
        onStage: foreground
          ? (stage) =>
              setForging((f) =>
                f && f.round === i + 1 ? { ...f, stage } : f,
              )
          : undefined,
      });
      const d = result.ok ? result.datum : asLiveFallback(initialRounds[i]);
      liveCache.current.set(i, d);
      applyLiveRound(i, d);
      if (foreground) {
        sfx.forged();
        setForging(null);
      }
    },
    [applyLiveRound, initialRounds],
  );

  // forge round 1 before the game starts, then prefetch round 2
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    sfx.forgeStart();
    void (async () => {
      await ensureLiveRound(0, true);
      if (cancelled) return;
      void ensureLiveRound(1); // background prefetch
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- answer ----------
  const answer = (choice: Choice | null) => {
    if (answeredRef.current || forging) return;
    const d = session.rounds[idx];
    if (!d) return;
    answeredRef.current = true;

    const timedOut = choice === null;
    const correct = !timedOut && choice === d.fakeSide;
    const left = Math.max(0, deadlineRef.current - performance.now());
    const streakBefore = session.streak;
    const breakdown = correct
      ? scoreRound({
          tier: d.difficulty,
          msLeft: left,
          totalMs,
          streakBefore,
        })
      : null;
    const points = breakdown ? breakdown.total : 0;

    const played: PlayedRound = {
      id: d.id,
      kind: d.kind,
      difficulty: d.difficulty,
      category: d.category,
      correct,
      timedOut,
      msLeft: correct ? Math.round(left) : null,
      points,
      timeTakenMs: Math.round(totalMs - left),
    };

    const newStreak = correct ? streakBefore + 1 : 0;
    setSession({
      ...session,
      played: [...session.played, played],
      score: session.score + points,
      streak: newStreak,
      bestStreak: Math.max(session.bestStreak, newStreak),
      hearts: correct || isPractice ? session.hearts : Math.max(0, session.hearts - 1),
    });
    setMsLeft(left);

    if (correct) {
      const t = STREAK_TITLES[newStreak];
      if (t && newStreak >= 3) sfx.streak();
      else sfx.correct();
    } else {
      sfx.wrong();
      if (!isPractice) sfx.heartLost();
    }
    sfx.reveal();
    setReveal({
      choice,
      correct,
      timedOut,
      points,
      breakdown,
      streakAfter: newStreak,
    });
    // bring the reveal panel into view once it renders
    requestAnimationFrame(() =>
      setTimeout(() => {
        revealBoxRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 60),
    );
  };

  // ---------- advance ----------
  const advance = () => {
    sfx.click();
    const nextIdx = idx + 1;

    // game over conditions
    if (!isPractice && session.hearts <= 0) {
      sfx.gameover();
      onFinish(session);
      return;
    }
    if (mode !== "practice" && nextIdx >= ROUNDS_PER_GAME) {
      sfx.victory();
      onFinish(session);
      return;
    }

    // live mode: forge the next round (cached = instant), keep the
    // table covered until it is ready; prefetch one more in background
    if (isLive) {
      answeredRef.current = false;
      setReveal(null);
      setIdx(nextIdx);
      sfx.forgeStart();
      setForging(forgingFor(nextIdx + 1));
      void (async () => {
        await ensureLiveRound(nextIdx, true);
        if (nextIdx + 1 < ROUNDS_PER_GAME) void ensureLiveRound(nextIdx + 1);
      })();
      return;
    }

    // practice mode: extend the pool forever
    if (nextIdx >= session.rounds.length) {
      const want = tierForRound(nextIdx + 1, session.streak);
      const rand = mulberry32(hashString(`practice-${Date.now()}-${nextIdx}`));
      const usedIds = new Set(session.rounds.map((r) => r.id));
      const sub = replacementRound("classic", want, usedIds, rand);
      if (sub) {
        setSession({ ...session, rounds: [...session.rounds, sub] });
      }
    } else if (!isPractice) {
      // streak escalation: swap in a harder round if the player is on fire
      const want = tierForRound(nextIdx + 1, session.streak);
      const planned = session.rounds[nextIdx];
      if (planned && planned.difficulty < want) {
        const rand = mulberry32(hashString(`sub-${session.startedAt}-${nextIdx}`));
        const usedIds = new Set(session.rounds.map((r) => r.id));
        const sub = replacementRound(mode, want, usedIds, rand);
        if (sub) {
          const rounds = [...session.rounds];
          rounds[nextIdx] = sub;
          setSession({ ...session, rounds });
        }
      }
    }

    answeredRef.current = false;
    setReveal(null);
    setIdx(nextIdx);
  };

  // keep stable callback holders fresh after every commit
  useEffect(() => {
    answerRef.current = answer;
    advanceRef.current = advance;
    inRevealRef.current = reveal !== null;
  });

  // start the clock whenever a new question begins (never while forging).
  // the rAF loop paints the bar before the first visible frame, so the
  // sync pre-seed is unnecessary here.
  useEffect(() => {
    if (!datum || reveal || forging) return;
    deadlineRef.current = performance.now() + totalMs;
    lastTickRef.current = -1;
    let raf = 0;
    const loop = () => {
      const left = Math.max(0, deadlineRef.current - performance.now());
      setMsLeft(left);
      const sec = Math.ceil(left / 1000);
      if (sec !== lastTickRef.current) {
        lastTickRef.current = sec;
        if (sec <= 5 && sec > 0) sfx.urgentTick();
        else if (sec > 5) sfx.tick();
      }
      if (left <= 0) {
        answerRef.current(null);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);

  }, [idx, datum, reveal, totalMs, forging]);

  // preload the next round's images while the player reads the reveal
  useEffect(() => {
    if (!reveal) return;
    const next = session.rounds[idx + 1];
    if (next) void preloadRound(next);

  }, [reveal, idx]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M") {
        window.dispatchEvent(
          new CustomEvent("realorai:toggle-mute"),
        );
        return;
      }
      if (e.key === "1" || e.key === "a" || e.key === "A") {
        answerRef.current("left");
      } else if (e.key === "2" || e.key === "b" || e.key === "B") {
        answerRef.current("right");
      } else if ((e.key === "Enter" || e.key === " ") && inRevealRef.current) {
        e.preventDefault();
        advanceRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // mute toggle bus (button + keyboard share this)
  useEffect(() => {
    const toggle = () => {
      const next = !isMuted();
      setMuted(next);
      setMutedUi(next);
      if (!next) sfx.click();
    };
    window.addEventListener("realorai:toggle-mute", toggle);
    return () => window.removeEventListener("realorai:toggle-mute", toggle);
  }, []);

  if (!datum) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const secLeft = Math.ceil(msLeft / 1000);
  const urgent = !reveal && secLeft <= 5;
  const timerFrac = Math.max(0, Math.min(1, msLeft / totalMs));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 pb-8 pt-3 sm:px-5">
      {/* ---------- HUD ---------- */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={() => {
            sfx.click();
            onQuit();
          }}
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Quit game"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide text-muted-foreground">
          {isLive && (
            <Badge
              variant="outline"
              className="gap-1 border-fake/40 bg-fake-soft/40 text-fake"
            >
              <Flower2 className="h-3 w-3" />
              LIVE FORGE
            </Badge>
          )}
          {isPractice ? (
            <>PRACTICE · #{idx + 1}</>
          ) : (
            <>
              ROUND{" "}
              <span className="text-foreground">
                {idx + 1}/{ROUNDS_PER_GAME}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1" aria-label="Lives">
          {isPractice ? (
            <span className="font-mono text-sm text-muted-foreground">∞</span>
          ) : (
            Array.from({ length: MAX_HEARTS }, (_, i) => (
              <Heart
                key={i}
                className={
                  i < session.hearts
                    ? "h-4 w-4 fill-real text-real"
                    : "h-4 w-4 text-muted-foreground/40"
                }
              />
            ))
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {session.streak >= 2 && (
            <div
              className={`flex items-center gap-1 font-display text-sm font-bold ${
                session.streak >= 5 ? "text-gold" : "text-real"
              }`}
            >
              <Flame className="h-4 w-4" />
              {session.streak}
            </div>
          )}
          <div className="font-display text-lg font-bold tabular-nums">
            {session.score.toLocaleString()}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("realorai:toggle-mute"))}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      {/* ---------- timer ---------- */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-opacity ${
            urgent ? "animate-timer-flash bg-fake" : "bg-real"
          } ${forging ? "opacity-0" : ""}`}
          style={{ width: `${forging ? 100 : timerFrac * 100}%` }}
          role="timer"
          aria-label={`${secLeft} seconds remaining`}
        />
      </div>

      {forging ? (
        /* ---------- forging overlay (Live Forge) ---------- */
        <ForgingPanel
          key={forging.round}
          round={forging.round}
          label={forging.label}
          kind={forging.kind}
          modelIndex={forging.modelIndex}
          stage={forging.stage}
        />
      ) : (
        <>
          {/* ---------- prompt ---------- */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-center">
            <h1 className="w-full font-display text-lg font-bold sm:text-xl">
              {reveal
                ? reveal.correct
                  ? "Nailed it — the AI is unmasked."
                  : reveal.timedOut
                    ? "Time's up — the machine slips away."
                    : "Fooled you — that one was real."
                : datum.kind === "image"
                  ? "One of these photos is AI-generated"
                  : "One of these texts is AI-generated"}
            </h1>
            <Badge variant="outline" className="gap-1.5 border-border/70">
              {datum.kind === "image" ? (
                <Camera className="h-3.5 w-3.5" />
              ) : (
                <ScrollText className="h-3.5 w-3.5" />
              )}
              {datum.category}
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1.5 ${
                datum.difficulty === 3
                  ? "border-fake/40 text-fake"
                  : datum.difficulty === 2
                    ? "border-gold/40 text-gold"
                    : "border-real/40 text-real"
              }`}
            >
              {DIFFICULTY_LABEL[datum.difficulty]}
            </Badge>
            {!reveal && (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                press
                <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                  1
                </kbd>
                /
                <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                  2
                </kbd>
                to answer
              </span>
            )}
          </div>

          {/* ---------- the two cards ---------- */}
          <div className="animate-fade-up mt-4 grid flex-1 grid-cols-2 gap-3 sm:gap-5">
            {(["left", "right"] as const).map((side) => {
              const isFake = datum.fakeSide === side;
              const content = isFake ? datum.round.fake : datum.round.real;
              const chosen = reveal?.choice === side;
              const showStamp = Boolean(reveal);
              const dimmed =
                reveal !== null &&
                reveal.choice !== null &&
                !chosen &&
                !reveal.correct;
              return (
                <button
                  key={side}
                  type="button"
                  disabled={Boolean(reveal)}
                  onClick={() => answer(side)}
                  className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
                    chosen && reveal?.correct
                      ? "border-real ring-2 ring-real/60"
                      : chosen && reveal && !reveal.correct
                        ? "animate-shake border-fake ring-2 ring-fake/60"
                        : "border-border/70 hover:border-foreground/40 hover:shadow-lg hover:shadow-fake/5"
                  } ${dimmed ? "opacity-60" : ""} ${
                    reveal ? "cursor-default" : "cursor-pointer"
                  }`}
                  aria-label={`Choose ${side === "left" ? "first" : "second"} ${
                    datum.kind === "image" ? "image" : "text"
                  }`}
                >
                  {datum.kind === "image" ? (
                    <ImageCard
                      url={(content as { url: string }).url}
                      label={side}
                    />
                  ) : (
                    <TextCard
                      text={(content as { text: string }).text}
                      label={side}
                    />
                  )}

                  {/* REAL / AI stamps */}
                  {showStamp && (
                    <span
                      className={`animate-stamp absolute left-3 top-3 z-10 select-none rounded-md border-2 px-2.5 py-0.5 font-display text-sm font-bold tracking-widest backdrop-blur-sm sm:left-4 sm:top-4 sm:text-base ${
                        isFake
                          ? "border-fake bg-fake-soft text-fake"
                          : "border-real bg-real-soft text-real"
                      }`}
                    >
                      {isFake ? "AI" : "REAL"}
                    </span>
                  )}

                  {/* floating score on the chosen card */}
                  {chosen && reveal?.correct && reveal.breakdown && (
                    <span className="animate-float-up pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-2xl font-bold text-gold">
                      +{reveal.points}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ---------- reveal panel / continue ---------- */}
          <div className="mt-4" ref={revealBoxRef}>
            {reveal ? (
              <RevealPanel
                datum={datum}
                reveal={reveal}
                isLast={
                  !isPractice &&
                  (session.hearts <= 0 || idx + 1 >= ROUNDS_PER_GAME)
                }
                heartsLeft={session.hearts}
                onContinue={advance}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 pt-1 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-fake" />
                {isLive
                  ? "This fake was forged seconds ago — on your Pollen"
                  : "Trust the details — hands, text, shadows, rhythm"}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ================= live forging overlay ================= */

/** Flavor lines keep the wait alive. Rotate every few seconds. */
const IMAGE_FLAVOR = [
  "Warming up the latent space…",
  "Counting photons that never fell…",
  "Rendering shadows with suspicious confidence…",
  "Borrowing a stranger's camera settings…",
  "Adding one finger too many…",
  "Polishing the impossible light…",
  "Asking the noise for a second opinion…",
];
const TEXT_FLAVOR = [
  "Choosing words with unearned confidence…",
  "Making the rhythm a little too tidy…",
  "Piling up imagery without consequence…",
  "Sharpening the metaphor past plausibility…",
  "Ironing out every human wrinkle…",
];

function ForgingPanel(f: ForgingState) {
  const { round, label, kind, modelIndex, stage } = f;
  const isImage = kind === "image";

  // total elapsed since this round's forge started (keyed remount per round)
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  // rotating flavor line
  const [flavorIdx, setFlavorIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFlavorIdx((i) => i + 1), 2600);
    return () => clearInterval(id);
  }, []);

  const flavors = isImage ? IMAGE_FLAVOR : TEXT_FLAVOR;
  const flavor = flavors[flavorIdx % flavors.length];

  // stage checklist
  const steps = isImage
    ? [
        {
          icon: <ScrollText className="h-4 w-4" />,
          title: "The brief",
          desc: "GPT-5.4 Nano writes the counterfeit brief",
          active: stage === "briefing",
        },
        {
          icon: <Wand2 className="h-4 w-4" />,
          title: "The forge",
          desc: `${label} paints the counterfeit`,
          active: stage === "generating",
        },
        {
          icon: <ImageDown className="h-4 w-4" />,
          title: "The handoff",
          desc: "Watermark-free pixels land on the table",
          active: stage === "receiving" || stage === "done",
        },
      ]
    : [
        {
          icon: <ScrollText className="h-4 w-4" />,
          title: "The brief",
          desc: "A real passage takes its seat",
          active: stage === "briefing" && elapsed < 0.4,
        },
        {
          icon: <Wand2 className="h-4 w-4" />,
          title: "The forge",
          desc: `${label} composes the counterfeit`,
          active: stage === "briefing" || stage === "receiving",
        },
      ];
  const activeIdx = steps.findIndex((s) => s.active);

  return (
    <section
      className="relative mt-6 flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-fake/30 bg-fake-soft/20 p-6 text-center sm:p-8"
      aria-live="polite"
      aria-label={`Forging round ${round}`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-scanline absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-fake/10 to-transparent" />
      </div>
      <div className="animate-drift pointer-events-none absolute h-48 w-48 rounded-full bg-fake/15 blur-3xl" />

      <div className="relative flex items-center gap-3 font-display text-sm font-bold uppercase tracking-[0.25em] text-fake">
        <Loader2 className="h-4 w-4 animate-spin" />
        Forging round {round}
        <span className="rounded border border-border/70 bg-card/60 px-1.5 py-0.5 font-mono text-[11px] font-normal tracking-normal text-muted-foreground tabular-nums">
          {elapsed.toFixed(1)}s
        </span>
      </div>

      <h2 className="relative mt-4 max-w-md font-display text-2xl font-bold leading-snug sm:text-3xl">
        Passing the brief to{" "}
        <span className="bg-gradient-to-r from-fake to-gold bg-clip-text text-transparent">
          {label}
        </span>
      </h2>
      <p className="relative mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        A real photograph is already on the table. The counterfeit is being
        generated right now with your Pollen — the harder the round, the
        stronger the model.
      </p>

      {/* stage checklist */}
      <ol className="relative mt-6 w-full max-w-sm space-y-2 text-left">
        {steps.map((s, i) => {
          const done = i < activeIdx || stage === "done";
          const active = s.active && stage !== "done";
          return (
            <li
              key={s.title}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all duration-300 ${
                active
                  ? "border-fake/50 bg-fake-soft/50 shadow-lg shadow-fake/5"
                  : done
                    ? "border-real/30 bg-real-soft/20"
                    : "border-border/50 bg-card/30 opacity-55"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  done
                    ? "bg-real/15 text-real"
                    : active
                      ? "bg-fake/15 text-fake"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : s.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {s.title}
                  {active && (
                    <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin text-fake" />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.desc}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* eased progress bar (remounts per stage) */}
      <div className="relative mt-5 w-56">
        <StageBar stage={stage} modelIndex={modelIndex} />
      </div>

      {/* model ladder position */}
      {isImage && modelIndex !== null && modelIndex >= 0 && (
        <div className="relative mt-5 flex items-center gap-1.5">
          {LIVE_IMAGE_MODELS.map((m, i) => (
            <span
              key={m.id}
              title={m.label}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < modelIndex
                  ? "w-5 bg-real/60"
                  : i === modelIndex
                    ? "w-9 bg-gradient-to-r from-fake to-gold"
                    : "w-5 bg-secondary"
              }`}
            />
          ))}
          <span className="ml-2 text-[11px] text-muted-foreground">
            ladder {modelIndex + 1}/{LIVE_IMAGE_MODELS.length}
          </span>
        </div>
      )}

      {/* rotating flavor line */}
      <p
        key={flavorIdx}
        className="animate-fade-up relative mt-5 text-xs italic text-muted-foreground/80"
      >
        {flavor}
      </p>
    </section>
  );
}

/** Eased, capped progress for the current stage — never reaches 100% early. */
function StageBar({
  stage,
  modelIndex,
}: {
  stage: ForgeStage;
  modelIndex: number | null;
}) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setT(performance.now() - t0), 120);
    return () => clearInterval(id);
  }, []);

  // rough per-model wall-clock expectation, in ms
  const expected =
    modelIndex === null ? 6000 : [8000, 11000, 16000, 24000][modelIndex] ?? 12000;

  const [lo, hi, span] =
    stage === "briefing"
      ? [6, 24, 4000]
      : stage === "generating"
        ? [28, 84, expected]
        : stage === "receiving"
          ? [88, 97, 1500]
          : [100, 100, 1];

  const frac = Math.min(1, t / span);
  const eased = 1 - Math.pow(1 - frac, 2.2);
  const pct = stage === "done" ? 100 : lo + (hi - lo) * eased;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-gradient-to-r from-fake via-gold to-fake transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-label="Forging progress"
        aria-valuenow={Math.round(pct)}
      />
    </div>
  );
}

/* ================= cards ================= */

function ImageCard({ url, label }: { url: string; label: string }) {
  // freshly forged blob URLs decode live — fade them in from a blur so
  // the reveal feels like a darkroom print. Cached images (callback ref
  // fires with complete=true) skip straight to the crisp state.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <div className="relative flex h-full min-h-32 items-center justify-center overflow-hidden rounded-xl bg-ink/60 sm:min-h-72 lg:min-h-96">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-fake-soft/30 via-transparent to-fake-soft/10" />
      )}
      <img
        ref={imgRef}
        src={url}
        alt={`Candidate ${label === "left" ? "one" : "two"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`max-h-full max-w-full object-contain transition-all duration-500 ${
          loaded ? "opacity-100 blur-0" : "opacity-0 blur-md"
        }`}
        draggable={false}
      />
      <span className="absolute bottom-2 right-2 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground backdrop-blur-sm">
        {label === "left" ? "[1]" : "[2]"}
      </span>
    </div>
  );
}

function TextCard({ text, label }: { text: string; label: string }) {
  return (
    <div className="text-card-bg relative flex h-full min-h-44 flex-col overflow-hidden rounded-xl border border-border/40 p-3.5 pt-7 sm:min-h-72 sm:p-5 sm:pt-8 lg:min-h-96">
      <p className="nice-scroll flex-1 overflow-y-auto whitespace-pre-line font-serif text-[13px] leading-relaxed text-foreground/90 sm:text-sm">
        {text}
      </p>
      <span className="absolute bottom-2 right-2 rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        {label === "left" ? "[1]" : "[2]"}
      </span>
    </div>
  );
}
