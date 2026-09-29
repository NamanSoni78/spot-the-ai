/**
 * Pollinations "Connect User Wallets" (BYOP — Bring Your Own Pollen) client.
 *
 * Sign-in uses the OAuth authorization-code flow with PKCE against
 * enter.pollinations.ai, exactly as documented at
 * https://gen.pollinations.ai/docs (#tag/connect-user-wallets):
 *
 *   1. send the player to /authorize with our publishable App Key (pk_...),
 *      a PKCE S256 challenge, and the model whitelist + budget they approve
 *   2. they come back to the same page with ?code=...&state=...
 *   3. we exchange the code for a scoped user key (sk_...)
 *   4. that key is used as a Bearer token on gen.pollinations.ai so live
 *      generation spends the *player's* Pollen budget — never ours.
 *
 * The key lives in sessionStorage only (survives reloads in the same tab,
 * dies with it) — never localStorage, never a URL, never a log.
 * The legacy fragment flow (#api_key=...) is supported as a fallback.
 */

const AUTH_BASE = "https://enter.pollinations.ai";
const GEN_BASE = "https://gen.pollinations.ai";

/** Publishable App Key from enter.pollinations.ai → "Create New App Key". */
export const APP_KEY: string = process.env.NEXT_PUBLIC_POLLINATIONS_APP_KEY ?? "";

/** Image models used by Live Forge, easiest → hardest. */
export interface LiveModel {
  id: string;
  label: string;
  /** approximate pollen per generated image */
  pollen: number;
}

export const LIVE_IMAGE_MODELS: LiveModel[] = [
  { id: "black-forest-labs/flux.1-schnell", label: "FLUX.1 Schnell", pollen: 0.002 },
  { id: "tongyi-mai/z-image-turbo", label: "Z-Image Turbo", pollen: 0.004 },
  { id: "microsoft/mai-image-2.5-flash", label: "MAI Image 2.5 Flash", pollen: 0.015 },
  { id: "openai/gpt-image-2", label: "GPT Image 2", pollen: 0.023 },
];

export const TEXT_MODEL: LiveModel = {
  id: "openai/gpt-5.4-nano",
  label: "GPT-5.4 Nano",
  pollen: 0.0002,
};

/** Model ladder for a 10-round live run (1-based round index). */
export function imageModelForRound(round1: number): LiveModel {
  if (round1 <= 3) return LIVE_IMAGE_MODELS[0];
  if (round1 <= 6) return LIVE_IMAGE_MODELS[1];
  if (round1 <= 8) return LIVE_IMAGE_MODELS[2];
  return LIVE_IMAGE_MODELS[3];
}

/** All models we ask the player to authorize. */
export const LIVE_MODEL_IDS = [...LIVE_IMAGE_MODELS.map((m) => m.id), TEXT_MODEL.id];

/** True when the host configured a Pollinations App Key (pk_...). */
export function isLiveConfigured(): boolean {
  return APP_KEY.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/* session storage                                                     */
/* ------------------------------------------------------------------ */

const K_TOKEN = "roai:polli:token";
const K_USER = "roai:polli:user";
const K_EXPIRES = "roai:polli:expires";
const K_VERIFIER = "roai:polli:verifier";
const K_STATE = "roai:polli:state";

export interface PolliUser {
  name: string;
  picture?: string;
}

export interface LiveSession {
  token: string;
  user: PolliUser;
}

function ss(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadLiveSession(): LiveSession | null {
  const s = ss();
  if (!s) return null;
  try {
    const token = s.getItem(K_TOKEN);
    if (!token) return null;
    const expires = Number(s.getItem(K_EXPIRES) ?? 0);
    if (expires && Date.now() > expires) {
      clearLiveSession();
      return null;
    }
    const user: PolliUser = JSON.parse(s.getItem(K_USER) ?? '{"name":"Pollinations player"}');
    return { token, user };
  } catch {
    return null;
  }
}

export function saveLiveSession(session: LiveSession, expiresInSeconds?: number) {
  const s = ss();
  if (!s) return;
  s.setItem(K_TOKEN, session.token);
  s.setItem(K_USER, JSON.stringify(session.user));
  // default user-authorized key lifetime is 7 days; refresh a bit earlier
  s.setItem(K_EXPIRES, String(Date.now() + (expiresInSeconds ?? 604800) * 1000 - 3_600_000));
}

export function clearLiveSession() {
  const s = ss();
  if (!s) return;
  for (const k of [K_TOKEN, K_USER, K_EXPIRES, K_VERIFIER, K_STATE]) s.removeItem(k);
}

/* ------------------------------------------------------------------ */
/* OAuth (PKCE) + legacy fragment flow                                 */
/* ------------------------------------------------------------------ */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export function redirectUri(): string {
  return `${window.location.origin}/`;
}

/** Step 1 — send the player to the Pollinations consent screen. */
export async function beginSignIn(): Promise<void> {
  if (!APP_KEY) return;
  const s = ss();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const { verifier, challenge } = await makePkce();
  if (s) {
    s.setItem(K_STATE, state);
    s.setItem(K_VERIFIER, verifier);
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: APP_KEY,
    redirect_uri: redirectUri(),
    scope: "profile usage",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    models: LIVE_MODEL_IDS.join(","),
    expiry: "7",
  });
  window.location.assign(`${AUTH_BASE}/authorize?${params.toString()}`);
}

async function exchangeCode(code: string): Promise<string | null> {
  const s = ss();
  const verifier = s?.getItem(K_VERIFIER);
  if (!verifier) return null;
  try {
    const res = await fetch(`${AUTH_BASE}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: APP_KEY,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchUser(token: string): Promise<PolliUser> {
  try {
    const res = await fetch(`${AUTH_BASE}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = (await res.json()) as {
        preferred_username?: string;
        name?: string;
        picture?: string;
      };
      return {
        name: d.preferred_username ?? d.name ?? "Pollinations player",
        picture: d.picture,
      };
    }
  } catch {
    /* best effort */
  }
  return { name: "Pollinations player" };
}

/** Pollen balance of the signed-in player (best effort). */
export async function fetchBalance(token: string): Promise<number | null> {
  try {
    const res = await fetch(`${GEN_BASE}/account/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { balance?: number };
    return typeof d.balance === "number" ? d.balance : null;
  } catch {
    return null;
  }
}

function cleanUrl() {
  window.history.replaceState({}, "", window.location.pathname);
}

async function establish(token: string, expiresIn?: number): Promise<LiveSession> {
  const user = await fetchUser(token);
  const session: LiveSession = { token, user };
  saveLiveSession(session, expiresIn);
  return session;
}

/**
 * Step 2/3 — call once on mount. Detects either the OAuth redirect
 * (?code=…&state=…) or the legacy fragment (#api_key=…), completes the
 * sign-in, cleans the URL and returns the session (or null).
 */
export async function handleOAuthCallback(): Promise<LiveSession | null> {
  if (typeof window === "undefined") return null;

  // legacy fragment flow: #api_key=sk_...&state=...
  if (window.location.hash.length > 1) {
    const frag = new URLSearchParams(window.location.hash.slice(1));
    const key = frag.get("api_key");
    const err = frag.get("error");
    if (key) {
      cleanUrl();
      return establish(key);
    }
    if (err) cleanUrl(); // access denied — stay a guest
  }

  // OAuth code flow: ?code=...&state=...
  const q = new URLSearchParams(window.location.search);
  const code = q.get("code");
  if (!code) return null;
  const state = q.get("state");
  const expected = ss()?.getItem(K_STATE);
  cleanUrl();
  if (state && expected && state !== expected) return null; // CSRF mismatch
  const token = await exchangeCode(code);
  ss()?.removeItem(K_VERIFIER);
  ss()?.removeItem(K_STATE);
  if (!token) return null;
  return establish(token);
}

/* ------------------------------------------------------------------ */
/* generation (spends the player's pollen)                             */
/* ------------------------------------------------------------------ */

export interface LiveImageResult {
  objectUrl: string;
  bytes: number;
}

/** Coarse generation phases surfaced to the UI (forging overlay).
 * The image endpoint only responds once the model has finished painting,
 * so "generating" = the long silent wait, "receiving" = pixels streaming. */
export type GenPhase = "generating" | "receiving";

/** GET /image/{prompt} with the player's key — returns a blob URL.
 *
 * `nologo=true` disables the Pollinations watermark and `private=true`
 * keeps the generation out of the public feed (both documented in the
 * Pollinations API docs; watermark removal requires the authenticated
 * key we always send here — the player's own).
 */
export async function generateLiveImage(opts: {
  token: string;
  prompt: string;
  model: string;
  width: number;
  height: number;
  seed?: number;
  timeoutMs?: number;
  onPhase?: (phase: GenPhase) => void;
}): Promise<LiveImageResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  try {
    const params = new URLSearchParams({
      model: opts.model,
      width: String(opts.width),
      height: String(opts.height),
      seed: String(opts.seed ?? Math.floor(Math.random() * 2 ** 30)),
      nologo: "true",
      private: "true",
    });
    opts.onPhase?.("generating");
    const res = await fetch(`${GEN_BASE}/image/${encodeURIComponent(opts.prompt)}?${params}`, {
      headers: { Authorization: `Bearer ${opts.token}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Pollinations image failed (${res.status})`);
    }
    // stream the bytes so the UI can tell "painting" from "downloading"
    let blob: Blob;
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let first = true;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (first) {
          first = false;
          opts.onPhase?.("receiving");
        }
        chunks.push(value);
      }
      blob = new Blob(chunks, { type: res.headers.get("content-type") ?? "image/jpeg" });
    } else {
      blob = await res.blob();
    }
    if (blob.size === 0 || !blob.type.startsWith("image/")) {
      throw new Error("Pollinations returned no image");
    }
    return { objectUrl: URL.createObjectURL(blob), bytes: blob.size };
  } finally {
    clearTimeout(t);
  }
}

/** POST /v1/chat/completions on the nano model — returns the message text. */
export async function nanoChat(opts: {
  token: string;
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(`${GEN_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: TEXT_MODEL.id,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_tokens: opts.maxTokens ?? 600,
      }),
    });
    if (!res.ok) throw new Error(`Pollinations text failed (${res.status})`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(t);
  }
}
