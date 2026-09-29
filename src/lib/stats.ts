/** Local persistence: lifetime stats, daily challenge state, mute. */

export interface TypeAcc {
  correct: number;
  total: number;
}

export interface Stats {
  bestScore: number;
  bestStreak: number;
  gamesPlayed: number;
  roundsSeen: number;
  roundsCorrect: number;
  image: TypeAcc;
  text: TypeAcc;
  lastDaily: string | null;
  lastDailyScore: number;
}

const KEY = "realorai:stats:v1";

export function emptyStats(): Stats {
  return {
    bestScore: 0,
    bestStreak: 0,
    gamesPlayed: 0,
    roundsSeen: 0,
    roundsCorrect: 0,
    image: { correct: 0, total: 0 },
    text: { correct: 0, total: 0 },
    lastDaily: null,
    lastDailyScore: 0,
  };
}

export function loadStats(): Stats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyStats();
    return { ...emptyStats(), ...(JSON.parse(raw) as Partial<Stats>) };
  } catch {
    return emptyStats();
  }
}

export function saveStats(stats: Stats): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* storage full / private mode — stats are non-critical */
  }
}

export function accuracy(stats: Stats): number {
  return stats.roundsSeen === 0
    ? 0
    : Math.round((stats.roundsCorrect / stats.roundsSeen) * 100);
}
