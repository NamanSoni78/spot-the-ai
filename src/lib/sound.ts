/**
 * Tiny WebAudio synth for game sound effects — zero audio assets.
 * All calls are safe no-ops before the first user interaction
 * (browsers block AudioContext until a gesture happens).
 */

type Ctx = AudioContext & { _unlocked?: boolean };

let ctx: Ctx | null = null;
let muted = false;

const MUTE_KEY = "realorai:muted";

export function initMuted(): boolean {
  if (typeof window === "undefined") return false;
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  }
}

export function isMuted(): boolean {
  return muted;
}

function ac(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor() as Ctx;
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/** Call from a click handler once to unlock audio on iOS/Safari. */
export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === "running") c._unlocked = true;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {},
): void {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  const t0 = c.currentTime + start;
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  }
  const peak = opts.gain ?? 0.14;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  click(): void {
    if (muted) return;
    tone(520, 0, 0.07, { type: "triangle", gain: 0.08 });
  },
  hover(): void {
    if (muted) return;
    tone(700, 0, 0.04, { type: "sine", gain: 0.03 });
  },
  tick(): void {
    if (muted) return;
    tone(1050, 0, 0.035, { type: "square", gain: 0.05 });
  },
  urgentTick(): void {
    if (muted) return;
    tone(1400, 0, 0.05, { type: "square", gain: 0.07 });
  },
  correct(): void {
    if (muted) return;
    tone(659.25, 0, 0.12, { type: "triangle", gain: 0.12 }); // E5
    tone(830.61, 0.09, 0.14, { type: "triangle", gain: 0.12 }); // G#5
    tone(987.77, 0.18, 0.22, { type: "triangle", gain: 0.13 }); // B5
  },
  wrong(): void {
    if (muted) return;
    tone(220, 0, 0.28, { type: "sawtooth", gain: 0.1, slideTo: 110 });
    tone(160, 0.05, 0.3, { type: "square", gain: 0.05, slideTo: 80 });
  },
  heartLost(): void {
    if (muted) return;
    tone(392, 0, 0.14, { type: "triangle", gain: 0.1 });
    tone(311, 0.12, 0.16, { type: "triangle", gain: 0.1 });
    tone(233, 0.24, 0.3, { type: "triangle", gain: 0.11 });
  },
  streak(): void {
    if (muted) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, i * 0.07, 0.16, { type: "triangle", gain: 0.1 }),
    );
  },
  reveal(): void {
    if (muted) return;
    tone(440, 0, 0.08, { type: "sine", gain: 0.07 });
    tone(554.37, 0.06, 0.1, { type: "sine", gain: 0.07 });
  },
  gameover(): void {
    if (muted) return;
    [392, 349.23, 293.66, 261.63].forEach((f, i) =>
      tone(f, i * 0.14, 0.3, { type: "triangle", gain: 0.1 }),
    );
  },
  victory(): void {
    if (muted) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) =>
      tone(f, i * 0.08, 0.25, { type: "triangle", gain: 0.11 }),
    );
  },
  /** Live Forge: the counterfeit press starts warming up. */
  forgeStart(): void {
    if (muted) return;
    tone(180, 0, 0.5, { type: "sawtooth", gain: 0.035, slideTo: 320 });
    tone(240, 0.08, 0.45, { type: "sine", gain: 0.05, slideTo: 480 });
  },
  /** Live Forge: a fresh fake lands on the table. */
  forged(): void {
    if (muted) return;
    tone(587.33, 0, 0.1, { type: "triangle", gain: 0.1 }); // D5
    tone(880, 0.08, 0.16, { type: "triangle", gain: 0.11 }); // A5
  },
};
