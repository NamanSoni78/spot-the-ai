/** Game rules, scoring and ranking. */

import type { Difficulty, ScoreBreakdown } from "./types";

export const ROUNDS_PER_GAME = 10;
export const MAX_HEARTS = 3;

/** Difficulty tier by 1-based round index (with streak escalation). */
export function tierForRound(roundIndex: number, streak: number): Difficulty {
  const byRound: Difficulty =
    roundIndex <= 2 ? 1 : roundIndex <= 5 ? 2 : 3;
  const byStreak: Difficulty = streak >= 8 ? 3 : streak >= 4 ? 2 : 1;
  return Math.max(byRound, byStreak) as Difficulty;
}

/** Seconds on the clock for a round. */
export function timerSeconds(tier: Difficulty, kind: "image" | "text"): number {
  const base = tier === 1 ? 20 : tier === 2 ? 16 : 12;
  return kind === "text" ? base + 4 : base;
}

export const TIER_MULTIPLIER: Record<Difficulty, number> = { 1: 1, 2: 1.5, 3: 2 };

export function scoreRound(opts: {
  tier: Difficulty;
  msLeft: number;
  totalMs: number;
  streakBefore: number;
}): ScoreBreakdown {
  const base = Math.round(100 * TIER_MULTIPLIER[opts.tier]);
  const speed = Math.round(100 * Math.max(0, Math.min(1, opts.msLeft / opts.totalMs)));
  const streak = 20 * Math.min(opts.streakBefore, 10);
  return { base, speed, streak, total: base + speed + streak };
}

export interface Rank {
  min: number;
  title: string;
  blurb: string;
}

export const RANKS: Rank[] = [
  { min: 3500, title: "AI Whisperer", blurb: "You see the matrix. The bots fear you." },
  { min: 2400, title: "Synth Detective", blurb: "Artifacts, lighting, anatomy — nothing escapes you." },
  { min: 1400, title: "Fake Spotter", blurb: "Solid instincts. You catch most of the tells." },
  { min: 600, title: "Casual Skeptic", blurb: "You can tell — sometimes. Keep training that eye." },
  { min: 0, title: "Bot Bait", blurb: "The machines fooled you today. Rematch?" },
];

export function rankFor(score: number): Rank {
  return RANKS.find((r) => score >= r.min) ?? RANKS[RANKS.length - 1];
}

export const STREAK_TITLES: Record<number, string> = {
  3: "On a roll!",
  5: "Eagle eye!",
  8: "Bot whisperer!",
  12: "Synth sniper!",
  16: "Machine crusher!",
  20: "Certified human!",
};

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}`;
}
