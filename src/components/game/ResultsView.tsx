"use client";

/**
 * End-of-run screen: rank, score breakdown, per-kind accuracy, share text.
 */

import { useMemo, useState } from "react";
import type { GameMode, GameSession } from "@/lib/types";
import { ROUNDS_PER_GAME, rankFor } from "@/lib/game";
import { sfx } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Flame,
  Target,
  Camera,
  ScrollText,
  Home,
  RotateCcw,
  Share2,
  Check,
  CalendarCheck,
  Timer,
} from "lucide-react";

interface Props {
  session: GameSession;
  onReplay: () => void;
  onHome: () => void;
}

export default function ResultsView({ session, onReplay, onHome }: Props) {
  const [copied, setCopied] = useState(false);
  const rank = useMemo(() => rankFor(session.score), [session.score]);

  const correct = session.played.filter((p) => p.correct).length;
  const img = session.played.filter((p) => p.kind === "image");
  const txt = session.played.filter((p) => p.kind === "text");
  const imgCorrect = img.filter((p) => p.correct).length;
  const txtCorrect = txt.filter((p) => p.correct).length;
  const heartsGone = session.hearts <= 0;
  const isDaily = session.mode === "daily";

  const share = async () => {
    sfx.click();
    const url =
      typeof window !== "undefined" ? window.location.origin : "";
    const text =
      `Real or AI? — I scored ${session.score.toLocaleString()} (${rank.title})` +
      `${heartsGone ? " before running out of hearts" : ""}: ` +
      `${correct}/${session.played.length} correct, best streak ${session.bestStreak}. ` +
      `Can you spot the fakes? ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ text, title: "Real or AI?" });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      /* user cancelled share — fine */
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10">
      <div className="animate-pop rounded-3xl border border-border/70 bg-card/70 p-6 backdrop-blur-sm sm:p-10">
        {/* rank */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <Trophy className="h-4 w-4 text-gold" />
            {heartsGone ? "Hearts gone" : "Run complete"}
          </div>
          <div className="mt-3 bg-gradient-to-r from-gold via-fake to-gold bg-clip-text font-display text-4xl font-bold text-transparent sm:text-5xl">
            {rank.title}
          </div>
          <p className="mt-2 text-pretty text-muted-foreground">
            {rank.blurb}
          </p>
          <div className="mt-5 font-display text-5xl font-bold tabular-nums sm:text-6xl">
            {session.score.toLocaleString()}
            <span className="ml-2 text-base font-medium text-muted-foreground">
              pts
            </span>
          </div>
        </div>

        {/* breakdown */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Cell
            icon={<Target className="h-4 w-4 text-real" />}
            value={`${correct}/${session.played.length}`}
            label="correct"
          />
          <Cell
            icon={<Flame className="h-4 w-4 text-gold" />}
            value={`${session.bestStreak}`}
            label="best streak"
          />
          <Cell
            icon={<Camera className="h-4 w-4" />}
            value={
              img.length
                ? `${imgCorrect}/${img.length}`
                : "—"
            }
            label="images"
          />
          <Cell
            icon={<ScrollText className="h-4 w-4 text-fake" />}
            value={
              txt.length
                ? `${txtCorrect}/${txt.length}`
                : "—"
            }
            label="texts"
          />
        </div>

        {/* round replay strip */}
        {session.played.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
            {session.played.map((p, i) => (
              <span
                key={i}
                title={`Round ${i + 1}: ${p.category}${p.timedOut ? " (timeout)" : ""}`}
                className={`flex h-7 w-7 items-center justify-center rounded-md border font-mono text-[11px] ${
                  p.correct
                    ? "border-real/40 bg-real-soft text-real"
                    : p.timedOut
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-fake/40 bg-fake-soft text-fake"
                }`}
              >
                {p.correct ? "✓" : p.timedOut ? <Timer className="h-3 w-3" /> : "✕"}
              </span>
            ))}
          </div>
        )}

        {/* actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {isDaily ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary/50 px-5 py-2.5 text-sm text-muted-foreground">
              <CalendarCheck className="h-4 w-4 text-fake" />
              Daily done for today — come back tomorrow
            </div>
          ) : (
            <Button
              onClick={() => {
                sfx.click();
                onReplay();
              }}
              className="gap-2"
              size="lg"
            >
              <RotateCcw className="h-4 w-4" />
              Play again
            </Button>
          )}
          <Button
            onClick={share}
            variant="secondary"
            size="lg"
            className="gap-2"
          >
            {copied ? (
              <Check className="h-4 w-4 text-real" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            {copied ? "Copied!" : "Share score"}
          </Button>
          <Button
            onClick={() => {
              sfx.click();
              onHome();
            }}
            variant="ghost"
            size="lg"
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {session.mode === "live"
            ? "every fake was forged live with Pollinations · streaks raise the stakes · harder models every round"
            : `${ROUNDS_PER_GAME} rounds a run · streaks raise the difficulty · fakes are pre-generated and clearly revealed every time`}
        </p>
      </div>
    </div>
  );
}

function Cell({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 font-display text-xl font-bold tabular-nums">
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
