# Pollinations App Submission — copy-paste guide

> Open the form: https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml
> Fill each field below exactly. **Quest field must be `#15725`.**

---

## Issue title

```
[App Submission] Real or AI? — Spot the Synthetic
```

---

## App Name

```
Real or AI? — Spot the Synthetic
```

---

## App Description

```
Real or AI? is a timed browser game where players see two matched images or two matched passages — one real, one AI-generated — and must spot the fake before the clock runs out. 3 hearts, streak multipliers, speed bonuses, and a reveal after every round that shows the fake's exact prompt plus the concrete tells that gave it away.

HOW IT USES POLLINATIONS

1) Live Forge mode — BYOP ("Connect User Wallets")
Players can sign in with Pollinations using the OAuth authorization-code flow with PKCE (enter.pollinations.ai/authorize → scoped sk_ key in sessionStorage, 7-day expiry, budget-capped, revocable by the user anytime). Once signed in, every fake in the run is generated LIVE with the player's own Pollen via gen.pollinations.ai, on a rising model ladder that makes rounds progressively harder:
  • Rounds 1–3  → black-forest-labs/flux.1-schnell
  • Rounds 4–6  → tongyi-mai/z-image-turbo
  • Rounds 7–8  → microsoft/mai-image-2.5-flash
  • Rounds 9–10 → openai/gpt-image-2
  • Text rounds (3, 6, 9) → openai/gpt-5.4-nano writes counterfeit novel openings, poems, proverbs and photo captions.
GPT-5.4 Nano also prompt-engineers each image fake to match its real counterpart's subject, era and style (tier 1 = dreamy AI look, tier 3 = forensic style match). While a fake is being forged the player watches a staged progress overlay (nano brief → model at work → pixel handoff) with an elapsed timer, eased progress bar, model-ladder indicator and rotating flavor lines; the next round is forged in the background while they answer, freshly forged images fade in from a blur, and every live image is requested watermark-free (nologo=true) and private (private=true, kept out of the public feed). Every live slot falls back to a pre-baked fake if generation fails — a run can never stall.

2) Guest mode — 100% static, no sign-in, no keys
Anyone can play instantly: 60 real Wikimedia Commons featured photographs (fully attributed, CC-licensed) paired with 60 pre-generated fakes, plus 33 real-vs-AI text rounds. All content ships with the repo (~14 MB, every image under 300 KB), so the app works on Vercel's free tier with zero configuration. A documented build script (scripts/regen_with_pollinations.ts) regenerates the entire fake set through the Pollinations image API.

GAME FLOW
Home → choose a mode (Classic Mix / Images Only / Texts Only / Daily Challenge — same seed for everyone, one shot per day / Practice — endless, no hearts / Live Forge) → 10 timed rounds with 3 hearts → per-round reveal: which one was AI, the exact prompt, the tells, and the real item's full attribution (author, license, Commons source) → results screen with rank, per-kind accuracy and a share line. Streaks escalate difficulty; the daily seed is deterministic.

QUEST FEATURES (#15725)
✓ Image rounds and caption rounds (novel openings, poetry, proverbs, photo captions)
✓ Real images from Wikimedia Commons featured pictures, fully attributed
✓ Fakes generated ahead of time so anyone can play without signing in
✓ Harder rounds that use more realistic models (the Live Forge model ladder: flux.1-schnell → z-image-turbo → mai-image-2.5-flash → gpt-image-2)
✓ A reveal of what gave the fake away (per-fake tells, written by GPT-5.4 Nano for live rounds)
✓ Streak scoring (multipliers, streak titles, difficulty escalation)

Built with Next.js (App Router), Tailwind CSS v4 and shadcn/ui — one page, fully client-side, zero tracking. Pollinations is credited in the app footer, the credits dialog and every live-round reveal. All sound effects are synthesized with WebAudio (no assets). Made with ❤️ by Naman (github.com/NamanSoni78) — fully open source at github.com/NamanSoni78/spot-the-ai.
```

---

## App URL

```
https://YOUR-DEPLOYMENT.vercel.app/
```

*(replace with your real Vercel URL after deploying)*

---

## GitHub Repository URL

```
https://github.com/NamanSoni78/spot-the-ai
```

*(replace if you renamed the repo)*

---

## App Category

```
games
```

---

## App Language

```
en
```

---

## Discord Username

```
(your Discord username, optional — e.g. yourname)
```

---

## Quest

```
#15725
```

---

## Before you submit — 3-point checklist

1. **Deploy first.** Push the repo to GitHub → import at vercel.com/new →
   add env var `NEXT_PUBLIC_POLLINATIONS_APP_KEY` (your `pk_…` App Key
   from enter.pollinations.ai/keys, with your Vercel URL registered as
   the App Key's Redirect URI) → deploy. Guest modes work even without
   the key; Live Forge needs it.
2. **Play one full Live Forge run** while signed in, to confirm your App
   Key + redirect URI are correctly registered.
3. Then open the submission form, paste the fields above, set
   **Quest = #15725**, and submit.
