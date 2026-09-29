/** Round pool loading + game session building. */

import roundsData from "@/data/rounds.json";
import type { GameMode, Round, RoundDatum } from "./types";
import { hashString, mulberry32, shuffled, todayKey } from "./rng";
import { ROUNDS_PER_GAME, tierForRound } from "./game";
import type { Difficulty } from "./types";

export const ALL_ROUNDS = roundsData as unknown as Round[];

export function poolFor(mode: GameMode): Round[] {
  if (mode === "image") return ALL_ROUNDS.filter((r) => r.kind === "image");
  if (mode === "text") return ALL_ROUNDS.filter((r) => r.kind === "text");
  return ALL_ROUNDS;
}

/** Pick one round from `pool` at (or nearest to) the wanted difficulty. */
function pickRound(
  pool: Round[],
  want: Difficulty,
  usedIds: Set<string>,
  rand: () => number,
): Round | null {
  const candidates = pool.filter((r) => !usedIds.has(r.id));
  if (candidates.length === 0) return null;
  for (const d of [want, 2, 1, 3] as Difficulty[]) {
    const tier = candidates.filter((r) => r.difficulty === d);
    if (tier.length > 0) {
      return shuffled(tier, rand)[0];
    }
  }
  return shuffled(candidates, rand)[0];
}

/**
 * Build the ordered round list for a session.
 * Classic/daily modes: 10 rounds with an escalating difficulty curve
 * (adjusted live by streak via `tierForRound`). Because streak affects the
 * curve, the full list is rebuilt lazily per round via `nextRoundDatum`.
 */
export function buildSessionRounds(
  mode: GameMode,
  count: number,
  seed: number,
): RoundDatum[] {
  const rand =
    mode === "daily"
      ? mulberry32(hashString(`daily-${todayKey()}`))
      : mulberry32(seed);
  const pool = shuffled(poolFor(mode), rand);
  const usedIds = new Set<string>();
  const out: RoundDatum[] = [];
  for (let i = 0; i < count; i++) {
    // plan with the base curve (streak escalation handled at runtime)
    const want = tierForRound(i + 1, 0);
    const r = pickRound(pool, want, usedIds, rand);
    if (!r) break;
    usedIds.add(r.id);
    out.push(toDatum(r, rand));
  }
  return out;
}

export function toDatum(r: Round, rand: () => number): RoundDatum {
  return {
    id: r.id,
    kind: r.kind,
    difficulty: r.difficulty,
    category: r.category,
    fakeSide: rand() < 0.5 ? "left" : "right",
    round: r,
  };
}

/** Substitute a replacement round at the wanted tier (streak escalation). */
export function replacementRound(
  mode: GameMode,
  want: Difficulty,
  usedIds: Set<string>,
  rand: () => number,
): RoundDatum | null {
  const pool = poolFor(mode);
  const r = pickRound(pool, want, usedIds, rand);
  if (!r) return null;
  return toDatum(r, rand);
}

export const GAME_LENGTH = ROUNDS_PER_GAME;

/** Preload the images for an image round (both sides). */
export function preloadRound(datum: RoundDatum): Promise<void> {
  const r = datum.round;
  if (r.kind !== "image") return Promise.resolve();
  const urls = [r.real.url, r.fake.url];
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = u;
        }),
    ),
  ).then(() => undefined);
}
