"use client";

/**
 * Post-answer panel: verdict, points breakdown, the AI's prompt + tells,
 * and the real content's full attribution. Continue button (Enter).
 */

import type { RoundDatum } from "@/lib/types";
import type { RevealState } from "./GameView";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Timer,
  Zap,
  Flame,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Eye,
  HeartCrack,
} from "lucide-react";

interface Props {
  datum: RoundDatum;
  reveal: RevealState;
  isLast: boolean;
  heartsLeft: number;
  onContinue: () => void;
}

export default function RevealPanel({
  datum,
  reveal,
  isLast,
  heartsLeft,
  onContinue,
}: Props) {
  const round = datum.round;
  const isImage = round.kind === "image";
  const live = datum.live;
  const liveFailed = live?.fallback === true;
  const liveOk = live !== undefined && !live.fallback;

  return (
    <div className="animate-pop rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur-sm sm:p-5">
      {/* verdict row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          className={`flex items-center gap-2 font-display text-base font-bold sm:text-lg ${
            reveal.correct ? "text-real" : "text-fake"
          }`}
        >
          {reveal.correct ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {reveal.correct
            ? "Correct"
            : reveal.timedOut
              ? "Out of time"
              : "Wrong pick"}
        </div>

        {reveal.breakdown && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-gold" />
              {reveal.breakdown.base}
            </span>
            <span className="flex items-center gap-1">
              <Timer className="h-3.5 w-3.5 text-real" />+
              {reveal.breakdown.speed}
            </span>
            <span className="flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-gold" />+
              {reveal.breakdown.streak}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 font-bold text-foreground">
              +{reveal.points}
            </span>
          </div>
        )}

        <Button onClick={onContinue} className="ml-auto gap-2" size="sm">
          {isLast ? (
            <>See results</>
          ) : (
            <>
              Next <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {/* details grid */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {/* the AI side */}
        <div className="rounded-xl border border-fake/25 bg-fake-soft/40 p-3.5">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-fake">
            <Sparkles className="h-4 w-4" />
            The AI one — how it was made
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground/80">Prompt:</span> “{round.fake.prompt}”
          </p>
          {round.fake.tells.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {round.fake.tells.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fake" />
                  <span className="text-foreground/85">{t}</span>
                </li>
              ))}
            </ul>
          )}
          {liveOk ? (
            <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <span className="rounded border border-fake/40 bg-fake-soft/60 px-1.5 py-0.5 font-mono text-fake">
                {live?.label}
              </span>
              forged live with Pollinations seconds ago · ≈{live?.pollen} Pollen
              from your budget
            </p>
          ) : liveFailed ? (
            <p className="mt-2.5 text-[11px] text-muted-foreground/80">
              Live forge didn’t answer in time — served a pre-baked fake instead
              (no Pollen spent).
            </p>
          ) : (
            <p className="mt-2.5 text-[11px] text-muted-foreground/80">
              Generated offline at build time ({round.fake.generator}) — no keys,
              no tracking, works forever.
            </p>
          )}
        </div>

        {/* the real side */}
        <div className="rounded-xl border border-real/25 bg-real-soft/40 p-3.5">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-real">
            <ExternalLink className="h-4 w-4" />
            The real one — where it comes from
          </div>
          {isImage ? (
            <>
              <a
                href={round.real.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-sm font-medium underline decoration-real/40 underline-offset-2 hover:text-real"
              >
                {round.real.title} <ExternalLink className="inline h-3 w-3" />
              </a>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {round.real.description}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Photo by{" "}
                <span className="text-foreground/85">{round.real.author}</span>{" "}
                ·{" "}
                <a
                  href={round.real.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-real/40 underline-offset-2 hover:text-real"
                >
                  {round.real.license}
                </a>{" "}
                · via Wikimedia Commons
              </p>
            </>
          ) : (
            <>
              <a
                href={round.real.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-sm font-medium underline decoration-real/40 underline-offset-2 hover:text-real"
              >
                {round.real.source} <ExternalLink className="inline h-3 w-3" />
              </a>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                The genuine article — a real {round.real.category}, quoted as
                published.
              </p>
            </>
          )}
        </div>
      </div>

      {/* streak toast / hearts warning */}
      {reveal.correct && reveal.streakAfter >= 3 && (
        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-gold">
          <Flame className="h-4 w-4" />
          {reveal.streakAfter} in a row — difficulty rising!
        </div>
      )}
      {!reveal.correct && heartsLeft === 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-fake">
          <HeartCrack className="h-4 w-4" />
          Out of hearts — game over.
        </div>
      )}
    </div>
  );
}
