"use client";

/**
 * Home screen: hero, mode selection, lifetime stats, how-to-play,
 * and a full credits dialog (every Commons source, properly attributed).
 */

import { useEffect, useMemo, useState } from "react";
import type { GameMode } from "@/lib/types";
import type { Stats } from "@/lib/stats";
import { accuracy } from "@/lib/stats";
import { ALL_ROUNDS } from "@/lib/rounds";
import { RANKS } from "@/lib/game";
import { todayKey } from "@/lib/rng";
import { sfx, unlockAudio, initMuted, setMuted } from "@/lib/sound";
import {
  LIVE_IMAGE_MODELS,
  TEXT_MODEL,
  type LiveSession,
} from "@/lib/pollinations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shuffle,
  Camera,
  ScrollText,
  CalendarDays,
  Dumbbell,
  Trophy,
  Flame,
  Target,
  Volume2,
  VolumeX,
  Play,
  Scale,
  Keyboard,
  Flower2,
  Zap,
  LogOut,
  Lock,
  Github,
  Code2,
} from "lucide-react";

interface Props {
  stats: Stats;
  statsLoaded: boolean;
  onStart: (mode: GameMode) => void;
  live: LiveSession | null;
  liveConfigured: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const MODES: {
  id: GameMode;
  title: string;
  desc: string;
  icon: typeof Shuffle;
  accent: string;
}[] = [
  {
    id: "classic",
    title: "Classic Mix",
    desc: "10 rounds of images + texts. 3 lives, rising difficulty.",
    icon: Shuffle,
    accent: "text-foreground",
  },
  {
    id: "image",
    title: "Images Only",
    desc: "60 real photographs vs AI fakes. Study the pixels.",
    icon: Camera,
    accent: "text-real",
  },
  {
    id: "text",
    title: "Texts Only",
    desc: "33 openings, poems, proverbs & captions. Feel the rhythm.",
    icon: ScrollText,
    accent: "text-fake",
  },
];

export default function HomeView({
  stats,
  statsLoaded,
  onStart,
  live,
  liveConfigured,
  onSignIn,
  onSignOut,
}: Props) {
  const [muted, setMutedUi] = useState(true);
  // hydration-safe localStorage read: server and first client render agree
  // (muted defaults to true), then the stored value syncs in after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMutedUi(initMuted());
  }, []);

  const dailyDone = stats.lastDaily === todayKey();
  const realImages = useMemo(
    () => ALL_ROUNDS.filter((r) => r.kind === "image"),
    [],
  );
  const realTexts = useMemo(
    () => ALL_ROUNDS.filter((r) => r.kind === "text"),
    [],
  );

  const click = (fn: () => void) => () => {
    unlockAudio();
    sfx.click();
    fn();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:pt-16">
      {/* ---------- hero ---------- */}
      <div className="relative text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-6 mx-auto h-40 w-40 animate-drift select-none rounded-full bg-fake/15 blur-3xl" />
        <div className="flex items-center justify-center gap-3">
          <span className="rounded-lg border-2 border-real bg-real-soft px-3 py-1 font-display text-sm font-bold tracking-widest text-real">
            REAL
          </span>
          <span className="font-display text-lg text-muted-foreground">
            or
          </span>
          <span className="rounded-lg border-2 border-fake bg-fake-soft px-3 py-1 font-display text-sm font-bold tracking-widest text-fake">
            AI?
          </span>
        </div>
        <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">
          Spot the{" "}
          <span className="bg-gradient-to-r from-fake to-gold bg-clip-text text-transparent">
            synthetic
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Two photos or two passages — one real, one machine-made. You have
          seconds to decide. Real photographs come from Wikimedia Commons;
          the fakes were AI-generated. Learn the tells before the fakes get
          too good.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/70 px-3 py-1">
            {realImages.length} image pairs
          </span>
          <span className="rounded-full border border-border/70 px-3 py-1">
            {realTexts.length} text pairs
          </span>
          <span className="rounded-full border border-border/70 px-3 py-1">
            3 difficulty tiers
          </span>
        </div>

        {/* ---------- Pollinations sign-in ---------- */}
        {liveConfigured && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {live ? (
              <div className="flex items-center gap-2.5 rounded-full border border-fake/40 bg-fake-soft/40 py-1.5 pl-2 pr-3">
                {live.user.picture ? (
                   
                  <img
                    src={live.user.picture}
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fake/20 text-fake">
                    <Flower2 className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="text-sm font-medium">{live.user.name}</span>
                <button
                  onClick={click(onSignOut)}
                  className="ml-1 flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  sign out
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={click(onSignIn)}
                className="h-11 gap-2 rounded-full border-fake/40 bg-fake-soft/30 px-5 text-sm hover:border-fake/70"
              >
                <Flower2 className="h-4 w-4 text-fake" />
                Sign in with Pollinations
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  · unlocks Live Forge
                </span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ---------- daily challenge ---------- */}
      <section className="mt-10">
        <button
          onClick={click(() => !dailyDone && onStart("daily"))}
          disabled={dailyDone}
          className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${
            dailyDone
              ? "cursor-not-allowed border-border/50 opacity-60"
              : "animate-glow border-fake/40 bg-fake-soft/30 hover:border-fake/70"
          }`}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fake/15 text-fake">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-bold sm:text-lg">
              Daily Challenge
            </div>
            <p className="text-sm text-muted-foreground">
              {dailyDone
                ? `Played today — scored ${stats.lastDailyScore.toLocaleString()}. Come back tomorrow for a fresh seed.`
                : "The same 10 rounds for everyone today. One shot at it."}
            </p>
          </div>
          {dailyDone ? (
            <Trophy className="h-5 w-5 shrink-0 text-gold" />
          ) : (
            <Play className="h-5 w-5 shrink-0 text-fake transition group-hover:translate-x-1" />
          )}
        </button>
      </section>

      {/* ---------- live forge (BYOP) ---------- */}
      <section className="mt-6">
        <button
          onClick={
            liveConfigured
              ? click(() => (live ? onStart("live") : onSignIn()))
              : undefined
          }
          disabled={!liveConfigured}
          className={`group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition sm:p-5 ${
            !liveConfigured
              ? "cursor-not-allowed border-border/50 opacity-60"
              : live
                ? "animate-glow border-fake/50 bg-fake-soft/25 hover:border-fake/80"
                : "border-fake/40 bg-fake-soft/15 hover:border-fake/70"
          }`}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-fake/10 blur-2xl" />
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fake/15 text-fake">
              {liveConfigured ? (
                <Zap className="h-6 w-6" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-display text-base font-bold sm:text-lg">
                Live Forge
                <span className="rounded-full border border-fake/40 bg-fake-soft/60 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-fake">
                  BYOP
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {!liveConfigured
                  ? "Fakes generated on the fly with your Pollen — needs the host to connect a Pollinations App Key."
                  : live
                    ? "Fresh fakes, forged while you play — spends your own Pollen (≈0.07 per run)."
                    : "Sign in with Pollinations to forge fakes live — the models get better every round."}
              </p>
            </div>
            {liveConfigured &&
              (live ? (
                <Play className="h-5 w-5 shrink-0 text-fake transition group-hover:translate-x-1" />
              ) : (
                <Flower2 className="h-5 w-5 shrink-0 text-fake" />
              ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="text-muted-foreground/70">model ladder:</span>
            {[...LIVE_IMAGE_MODELS, TEXT_MODEL].map((m, i) => (
              <span
                key={m.id}
                className="rounded-full border border-border/70 bg-card/60 px-2 py-0.5 font-mono text-[10px]"
              >
                {m.label}
                {i === 4 && <span className="text-muted-foreground/60"> · texts</span>}
              </span>
            ))}
          </div>
        </button>
      </section>

      {/* ---------- modes ---------- */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={click(() => onStart(m.id))}
            className="group rounded-2xl border border-border/70 bg-card/60 p-5 text-left transition hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-xl hover:shadow-fake/5"
          >
            <m.icon className={`h-7 w-7 ${m.accent}`} />
            <div className="mt-3 font-display text-base font-bold">
              {m.title}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {m.desc}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition group-hover:gap-2">
              Play <Play className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </section>

      {/* ---------- practice ---------- */}
      <section className="mt-4">
        <button
          onClick={click(() => onStart("practice"))}
          className="group flex w-full items-center gap-4 rounded-2xl border border-real/30 bg-real-soft/20 p-4 text-left transition hover:border-real/60 sm:p-5"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-real/15 text-real">
            <Dumbbell className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-bold sm:text-lg">
              Practice
            </div>
            <p className="text-sm text-muted-foreground">
              Endless rounds, no hearts, no pressure — train your eye.
            </p>
          </div>
          <Play className="h-5 w-5 shrink-0 text-real transition group-hover:translate-x-1" />
        </button>
      </section>

      {/* ---------- stats ---------- */}
      {statsLoaded && stats.gamesPlayed > 0 && (
        <section className="mt-10 rounded-2xl border border-border/70 bg-card/60 p-5">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-muted-foreground">
            <Trophy className="h-4 w-4 text-gold" />
            YOUR RECORD
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Best score"
              value={stats.bestScore.toLocaleString()}
              sub={bestRank(stats.bestScore)}
            />
            <Stat
              label="Accuracy"
              value={`${accuracy(stats)}%`}
              sub={`${stats.roundsCorrect}/${stats.roundsSeen} calls`}
            />
            <Stat
              label="Best streak"
              value={`${stats.bestStreak}`}
              sub="in a row"
              icon={<Flame className="h-3.5 w-3.5 text-gold" />}
            />
            <Stat
              label="Games"
              value={`${stats.gamesPlayed}`}
              sub={`imgs ${pct(stats.image.correct, stats.image.total)}% · texts ${pct(stats.text.correct, stats.text.total)}%`}
              icon={<Target className="h-3.5 w-3.5 text-real" />}
            />
          </div>
        </section>
      )}

      {/* ---------- how to play ---------- */}
      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <HowTo
          step="1"
          title="Two of a kind"
          body="Every round shows a matched pair — same subject, same style. Exactly one side is AI-generated; the other is a real photograph from Wikimedia Commons or a genuine published text."
        />
        <HowTo
          step="2"
          title="Beat the clock"
          body="Easy rounds give you 20 seconds, expert ones just 12. Answer fast for speed bonuses; build streaks for multipliers. Three wrong calls and the run is over."
        />
        <HowTo
          step="3"
          title="Learn the tells"
          body="After each call the game reveals the fake's prompt and the exact tells that expose it — melted hands, garbled text, impossible shadows, too-tidy prose."
        />
      </section>

      {/* ---------- footer ---------- */}
      <footer className="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        <a
          href="https://pollinations.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 transition hover:text-fake"
        >
          <Flower2 className="h-4 w-4" />
          AI fakes by Pollinations
        </a>

        <span className="hidden sm:inline">·</span>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={click(() => undefined)}
            >
              <Scale className="h-4 w-4" />
              Credits &amp; licenses
            </Button>
          </DialogTrigger>
          <DialogContent className="nice-scroll max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Credits &amp; licenses</DialogTitle>
              <DialogDescription>
                Every “real” in this game is properly attributed. AI fakes are
                generated with the{" "}
                <a
                  href="https://pollinations.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-fake"
                >
                  Pollinations
                </a>{" "}
                platform — pre-baked for guests, forged live with the signed-in
                player’s own Pollen in Live Forge mode.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-3">
              <li className="text-xs leading-relaxed">
                <span className="font-medium text-fake">AI fakes</span> —
                generated via the{" "}
                <a
                  href="https://gen.pollinations.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-fake"
                >
                  Pollinations Image &amp; Text APIs
                </a>{" "}
                (FLUX.1 Schnell, Z-Image Turbo, MAI Image 2.5 Flash, GPT Image 2,
                GPT-5.4 Nano). Live Forge spends only the player-authorized
                budget.
              </li>
              {ALL_ROUNDS.map((r) =>
                r.kind === "image" ? (
                  <li key={r.id} className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">
                      {r.real.title}
                    </span>{" "}
                    — {r.real.author},{" "}
                    <a
                      href={r.real.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-real"
                    >
                      {r.real.license}
                    </a>
                    ,{" "}
                    <a
                      href={r.real.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-real"
                    >
                      Wikimedia Commons
                    </a>
                  </li>
                ) : (
                  <li key={r.id} className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">
                      {r.real.source}
                    </span>{" "}
                    —{" "}
                    <a
                      href={r.real.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-real"
                    >
                      source
                    </a>
                  </li>
                ),
              )}
            </ul>
          </DialogContent>
        </Dialog>

        <span className="hidden sm:inline">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Keyboard className="h-4 w-4" />
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
            1
          </kbd>
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
            2
          </kbd>
          answer ·
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
            M
          </kbd>
          mute
        </span>

        <span className="hidden sm:inline">·</span>
        <button
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setMutedUi(next);
            unlockAudio();
            if (!next) sfx.click();
          }}
          className="inline-flex items-center gap-1.5 hover:text-foreground"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
          {muted ? "Unmute" : "Mute"}
        </button>

        {/* ---------- author credit ---------- */}
        <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-2 border-t border-border/50 pt-5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            Made with <span className="text-fake">❤️</span> By{" "}
            <span className="font-semibold text-foreground/90">Naman</span>
          </span>
          <span aria-hidden className="hidden sm:inline text-muted-foreground/50">
            •
          </span>
          <a
            href="https://github.com/NamanSoni78"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 underline-offset-4 transition hover:text-fake hover:underline"
          >
            <Github className="h-4 w-4" />
            GitHub Account
          </a>
          <span aria-hidden className="hidden sm:inline text-muted-foreground/50">
            •
          </span>
          <a
            href="https://github.com/NamanSoni78/spot-the-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 underline-offset-4 transition hover:text-fake hover:underline"
          >
            <Code2 className="h-4 w-4" />
            Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-display text-2xl font-bold tabular-nums">
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function HowTo({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary font-display text-sm font-bold text-muted-foreground">
        {step}
      </div>
      <div className="mt-3 font-display font-bold">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function bestRank(score: number): string {
  const r = RANKS.find((x) => score >= x.min);
  return r ? r.title : "";
}

function pct(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}
