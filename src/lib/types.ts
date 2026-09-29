/** Core data types for Real or AI? — a spot-the-synthetic guessing game. */

export type Difficulty = 1 | 2 | 3;

/** Real photograph from Wikimedia Commons (fully attributed). */
export interface RealImageContent {
  /** local path, e.g. /content/real/foo.jpg */
  url: string;
  title: string;
  description: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Commons file page */
  sourceUrl: string;
  /** subject slug used for pairing, e.g. "animals" */
  subject: string;
}

/** AI-generated image (pre-baked at build time). */
export interface FakeImageContent {
  url: string;
  prompt: string;
  /** human-readable generator label, e.g. "Pollinations · flux" */
  generator: string;
  seed: number | null;
  /** short specific clues that reveal it is AI-made */
  tells: string[];
}

export interface ImageRound {
  id: string;
  kind: "image";
  difficulty: Difficulty;
  /** display label, e.g. "Wildlife" */
  category: string;
  real: RealImageContent;
  fake: FakeImageContent;
}

export type TextCategory =
  | "novel opening"
  | "poetry"
  | "proverb"
  | "photo caption";

export interface RealTextContent {
  text: string;
  source: string;
  sourceUrl: string;
  category: TextCategory;
}

export interface FakeTextContent {
  text: string;
  prompt: string;
  generator: string;
  tells: string[];
  category: TextCategory;
}

export interface TextRound {
  id: string;
  kind: "text";
  difficulty: Difficulty;
  category: string;
  real: RealTextContent;
  fake: FakeTextContent;
}

export type Round = ImageRound | TextRound;

export type GameMode =
  | "classic"
  | "image"
  | "text"
  | "daily"
  | "practice"
  | "live";

/** Extra metadata for rounds forged live via Pollinations (BYOP). */
export interface LiveForgeInfo {
  /** model id, e.g. "openai/gpt-image-2" or "pre-baked" on fallback */
  model: string;
  /** pretty label, e.g. "GPT Image 2" */
  label: string;
  /** approximate pollen spent (player's budget) */
  pollen: number;
  /** the prompt that produced the fake */
  prompt: string;
  /** true when live forging failed and a pre-baked fake was served */
  fallback: boolean;
}

export interface RoundDatum {
  id: string;
  kind: "image" | "text";
  difficulty: Difficulty;
  category: string;
  /** which side the fake is on for this playthrough ("left" | "right") */
  fakeSide: "left" | "right";
  round: Round;
  /** present only in Live Forge mode */
  live?: LiveForgeInfo;
}

export interface ScoreBreakdown {
  base: number;
  speed: number;
  streak: number;
  total: number;
}

export interface PlayedRound {
  id: string;
  kind: "image" | "text";
  difficulty: Difficulty;
  category: string;
  correct: boolean;
  timedOut: boolean;
  /** ms remaining when answered (null if timed out) */
  msLeft: number | null;
  points: number;
  timeTakenMs: number;
}

export interface GameSession {
  mode: GameMode;
  rounds: RoundDatum[];
  played: PlayedRound[];
  score: number;
  streak: number;
  bestStreak: number;
  hearts: number;
  startedAt: number;
}
