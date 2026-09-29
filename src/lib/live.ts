/**
 * Live Forge — builds rounds on the fly with the signed-in player's
 * Pollinations budget (BYOP). Every round has a pre-baked static fallback,
 * so the game keeps running even when generation fails.
 *
 * Round plan (10 rounds, 3 hearts):
 *   image rounds: 1,2 (FLUX.1 Schnell) · 4,5 (Z-Image Turbo) ·
 *                 7,8 (MAI Image 2.5 Flash) · 10 (GPT Image 2)
 *   text rounds:  3, 6, 9 (GPT-5.4 Nano writes the counterfeit passage)
 *
 * The fake always depicts a *different* real photo from the same pool, so
 * the pair is matched in subject but never a duplicate.
 */

import type {
  Difficulty,
  ImageRound,
  Round,
  RoundDatum,
  TextRound,
} from "./types";
import { ALL_ROUNDS, toDatum } from "./rounds";
import {
  generateLiveImage,
  imageModelForRound,
  nanoChat,
  TEXT_MODEL,
  type GenPhase,
  type LiveModel,
} from "./pollinations";

/** 1-based round indexes that are text rounds in a live run. */
const TEXT_ROUNDS = new Set([3, 6, 9]);

/** Fine-grained forging progress surfaced to the forging overlay. */
export type ForgeStage = GenPhase | "briefing" | "done";

function tierFor(round1: number): Difficulty {
  return round1 <= 3 ? 1 : round1 <= 6 ? 2 : 3;
}

export function isLiveTextRound(round1: number): boolean {
  return TEXT_ROUNDS.has(round1);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Robustly pull the first JSON object out of an LLM reply. */
function parseJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asStringArray(v: unknown, limit = 3): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, limit);
}

/** Measure a local image to pick a comparable generation size. */
function aspectOf(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (v: number | null) => {
      img.onload = null;
      img.onerror = null;
      resolve(v);
    };
    img.onload = () => done(img.naturalWidth / img.naturalHeight);
    img.onerror = () => done(null);
    setTimeout(() => done(null), 4000);
    img.src = url;
  });
}

async function genSize(realUrl: string): Promise<{ width: number; height: number }> {
  const aspect = await aspectOf(realUrl);
  if (aspect && aspect >= 1.2) return { width: 1280, height: 960 };
  if (aspect && aspect <= 0.83) return { width: 960, height: 1280 };
  return { width: 1024, height: 1024 };
}

/* ------------------------------------------------------------------ */
/* prompt engineering (GPT-5.4 Nano)                                   */
/* ------------------------------------------------------------------ */

const IMAGE_FORGE_SYSTEM = `You are the forge-master of "Real or AI?", a game that shows one real photograph next to one AI-generated counterfeit and asks players to spot the fake. Given the real photo's description, write the image-generation prompt for a convincing counterfeit counterpart: same subject and mood, but a DIFFERENT plausible scene (new composition, angle, lighting — never describe the exact same shot).

Reply with ONLY a minified JSON object, no markdown:
{"prompt":"<25-60 words, single line, no quotes or newlines>","tells":["<clue>","<clue>"]}

Rules for "prompt": concrete visual nouns, camera + light cues, one line.
Rules for "tells": exactly 2 short, specific clues a player could use to spot the AI image (max 12 words each), phrased about the generated image, e.g. "hand merges with the railing", "reflections ignore the light source". Vary them per image.`;

const TEXT_FORGE_SYSTEM = `You forge counterfeit texts for "Real or AI?", a game that shows a real published passage next to a machine-written fake. Given the REAL text (only as a style reference — never copy its words, phrases, or famous lines), write one convincing fake in the same category.

Reply with ONLY a minified JSON object, no markdown:
{"fake":"<the counterfeit text>","tells":["<clue>","<clue>"]}

Rules for "fake": match the real one's language (English), register, and approximate length (novel opening or poem: 40-120 words; proverb: one crisp sentence; photo caption: 1-3 factual sentences). Invent fresh content: new imagery, new subject. No famous quotes, no real author names, no meta commentary.
Rules for "tells": exactly 2 short clues that reveal machine authorship (max 12 words each), e.g. "rhythm too regular", "imagery piles up without consequence".`;

const TIER_HINT: Record<Difficulty, string> = {
  1: "Difficulty tier 1 (early rounds): let the prompt lean dreamy, glossy, slightly surreal or oversaturated — a stylized AI look an attentive player can catch.",
  2: "Difficulty tier 2 (mid rounds): realistic amateur-photography prompt — plausible phone-camera or DSLR framing, natural light, small imperfections.",
  3: "Difficulty tier 3 (expert rounds): forensic style-match — mimic the real photo's era, medium, grain, colour response and framing so the pair is genuinely hard to tell apart.",
};

/* ------------------------------------------------------------------ */
/* forge                                                               */
/* ------------------------------------------------------------------ */

export interface ForgeOptions {
  token: string;
  /** 1-based round index */
  round1: number;
  /** real-content keys (image url or text source) already used this run */
  usedKeys: Set<string>;
  /** keys reserved by the static fallback plan — avoid those too */
  reservedKeys?: Set<string>;
  /** optional progress reporter for the forging overlay */
  onStage?: (stage: ForgeStage) => void;
}

export type ForgeResult =
  | { ok: true; datum: RoundDatum; model: LiveModel }
  | { ok: false; reason: string };

async function forgeImage(opts: ForgeOptions): Promise<ForgeResult> {
  const candidates = ALL_ROUNDS.filter(
    (r): r is ImageRound =>
      r.kind === "image" &&
      !opts.usedKeys.has(r.real.url) &&
      !(opts.reservedKeys?.has(r.real.url) ?? false),
  );
  if (candidates.length === 0) return { ok: false, reason: "no real images left" };
  const real = candidates[Math.floor(Math.random() * candidates.length)];

  const model = imageModelForRound(opts.round1);
  const tier = tierFor(opts.round1);

  const user = [
    `Real photo title: ${real.real.title}.`,
    `Description: ${real.real.description}`,
    `Subject: ${real.real.subject ?? real.category}.`,
    TIER_HINT[tier],
  ].join("\n");

  opts.onStage?.("briefing");
  const raw = await nanoChat({
    token: opts.token,
    system: IMAGE_FORGE_SYSTEM,
    user,
    maxTokens: 400,
  });
  const parsed = parseJson(raw);
  const prompt = typeof parsed?.prompt === "string" ? parsed.prompt.trim() : "";
  const tells = asStringArray(parsed?.tells, 3);
  if (!prompt || prompt.length < 10) return { ok: false, reason: "bad nano reply" };

  const size = await genSize(real.real.url);
  const seed = Math.floor(Math.random() * 2 ** 30);
  const img = await generateLiveImage({
    token: opts.token,
    prompt,
    model: model.id,
    width: size.width,
    height: size.height,
    seed,
    onPhase: (p) => opts.onStage?.(p),
  });
  opts.onStage?.("done");

  opts.usedKeys.add(real.real.url);
  const round: ImageRound = {
    id: `live-img-${opts.round1}-${Date.now() & 0xffff}`,
    kind: "image",
    difficulty: tier,
    category: real.category,
    real: real.real,
    fake: {
      url: img.objectUrl,
      prompt,
      generator: `Pollinations · ${model.label} (live)`,
      seed,
      tells: tells.length > 0 ? tells : [`${model.label} signature sheen — too-clean textures`],
    },
  };
  const datum = toDatum(round, Math.random);
  datum.live = {
    model: model.id,
    label: model.label,
    pollen: model.pollen,
    prompt,
    fallback: false,
  };
  return { ok: true, datum, model };
}

async function forgeText(opts: ForgeOptions): Promise<ForgeResult> {
  const candidates = ALL_ROUNDS.filter(
    (r): r is TextRound =>
      r.kind === "text" &&
      !opts.usedKeys.has(r.real.source) &&
      !(opts.reservedKeys?.has(r.real.source) ?? false),
  );
  if (candidates.length === 0) return { ok: false, reason: "no real texts left" };
  const real = candidates[Math.floor(Math.random() * candidates.length)];
  const tier = tierFor(opts.round1);

  const user = [
    `Category: ${real.real.category}.`,
    `Real text (style reference only, never copy it):\n"""\n${real.real.text.slice(0, 900)}\n"""`,
    tier === 1
      ? "Make the fake good but slightly off: overly tidy rhythm or generic imagery."
      : tier === 2
        ? "Make the fake convincing: natural rhythm, specific detail, small human roughness."
        : "Make the fake expert: match the era, voice and texture of the real one as closely as possible.",
  ].join("\n");

  opts.onStage?.("briefing");
  const raw = await nanoChat({
    token: opts.token,
    system: TEXT_FORGE_SYSTEM,
    user,
    maxTokens: 500,
  });
  const parsed = parseJson(raw);
  const fakeText = typeof parsed?.fake === "string" ? parsed.fake.trim() : "";
  const tells = asStringArray(parsed?.tells, 3);
  if (!fakeText || fakeText.length < 20) return { ok: false, reason: "bad nano reply" };
  opts.onStage?.("done");

  opts.usedKeys.add(real.real.source);
  const round: TextRound = {
    id: `live-txt-${opts.round1}-${Date.now() & 0xffff}`,
    kind: "text",
    difficulty: tier,
    category: real.category,
    real: real.real,
    fake: {
      text: fakeText,
      prompt: `Imitate a ${real.real.category} in the voice of the real text (tier ${tier}).`,
      generator: `Pollinations · ${TEXT_MODEL.label} (live)`,
      tells: tells.length > 0 ? tells : ["rhythm a touch too regular", "detail without consequence"],
      category: real.real.category,
    },
  };
  const datum = toDatum(round, Math.random);
  datum.live = {
    model: TEXT_MODEL.id,
    label: TEXT_MODEL.label,
    pollen: TEXT_MODEL.pollen,
    prompt: `Imitate a ${real.real.category} in the voice of the real text (tier ${tier}).`,
    fallback: false,
  };
  return { ok: true, datum, model: TEXT_MODEL };
}

/** Forge one live round. Never throws — returns { ok: false } on failure. */
export async function forgeLiveRound(opts: ForgeOptions): Promise<ForgeResult> {
  try {
    return isLiveTextRound(opts.round1)
      ? await forgeText(opts)
      : await forgeImage(opts);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "forge failed",
    };
  }
}

/** Mark a pre-baked static datum as a live-mode fallback. */
export function asLiveFallback(datum: RoundDatum): RoundDatum {
  return {
    ...datum,
    live: {
      model: "pre-baked",
      label: "Pre-baked fake (fallback)",
      pollen: 0,
      prompt: datum.round.fake.prompt,
      fallback: true,
    },
  };
}
