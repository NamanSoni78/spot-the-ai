# Real or AI? — Spot the synthetic 🕵️

A browser guessing game built for **Pollinations Quest #15725**:

> Players are shown two images or two passages of text and must guess
> **which one is AI-generated** before the timer runs out.

**One is real. One is machine-made. You have seconds to decide.**

- 🖼️ **60 image rounds** — real featured photographs from Wikimedia Commons
  (fully attributed, CC-licensed) vs. AI-generated fakes built to match the
  same subject and style.
- ✍️ **33 text rounds** — famous novel openings, classic poems, traditional
  proverbs and real Commons photo captions vs. AI imitations.
- 📈 **Rising difficulty** — three tiers: the "warm-up" fakes have a dreamy
  AI sheen; the "expert" ones are candid, grainy, and dangerously close.
- 💡 **Learn the tells** — every reveal shows the exact prompt that made the
  fake **plus concrete tells** (melted geometry, garbled text, impossible
  shadows, too-tidy prose) so players actually get better at spotting AI.
- ⏱️ **Timed rounds, 3 hearts, streak multipliers, speed bonuses.**
- 🔥 **Streak escalation** — go on a run and the game quietly swaps in
  harder rounds.
- 📅 **Daily challenge** — same seed for everyone, one attempt a day.
- 🏋️ **Practice mode** — endless rounds, no hearts, no pressure.
- ⚡ **Live Forge (BYOP)** — sign in with Pollinations and every fake is
  generated **on the fly** with a rising model ladder: FLUX.1 Schnell →
  Z-Image Turbo → MAI Image 2.5 Flash → GPT Image 2 (plus GPT-5.4 Nano
  writing the counterfeit texts). Spends only the player-authorized
  Pollen budget — the host never pays for player usage. The forging
  overlay shows live progress (brief → forge → handoff stages, elapsed
  timer, model-ladder position) while the next round is forged in the
  background. Every live image is requested **watermark-free**
  (`nologo=true`) and **private** (`private=true`, kept out of the
  public feed).
- 🔊 **Zero audio assets** — all sound effects are synthesized with WebAudio.
- 🔑 **Zero keys, zero logins, zero tracking for guests** — the classic game
  is 100 % static; every fake was generated at build time and ships with the
  repo. Signing in is optional and only unlocks Live Forge.

## How to play

```bash
bun install
bun run dev        # http://localhost:3000
```

Keyboard: `1` / `2` to pick a side · `Enter` to continue · `M` to mute.

## Live Forge — sign in with Pollinations (optional)

Live Forge uses Pollinations' **Connect User Wallets / BYOP** flow
([docs](https://gen.pollinations.ai/docs#tag/connect-user-wallets)):
the player authorizes the app to spend **their own Pollen**, gets a scoped
`sk_…` key (7-day expiry, revocable anytime, budget-capped), and the game
forges fakes in real time while they play. Without a sign-in the game is
fully playable in static mode — every live round also has a pre-baked
fallback, so a failed generation never stalls a run.

To enable it in your deployment:

1. Go to [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) →
   **Create New App Key**.
2. Name it (e.g. `Real or AI?`) and add a **Redirect URI** matching your
   deployment exactly, e.g. `https://your-app.vercel.app/`
   (local dev: `http://localhost:3000/` — loopback matches any port).
3. Copy the `pk_…` App Key and set it as an environment variable in Vercel:

   ```bash
   vercel env add NEXT_PUBLIC_POLLINATIONS_APP_KEY
   # paste pk_... then redeploy
   ```

That's the only configuration needed. The OAuth handshake uses the
authorization-code flow **with PKCE** (the `sk_…` key never appears in a
URL), the token lives in `sessionStorage` only, and the authorize link
requests exactly the five whitelisted models plus a default budget the
player can adjust on the consent screen.

While a round is being forged the player sees a staged overlay — the
nano brief, the image model at work, and the pixel handoff — with an
elapsed timer, an eased progress bar, a model-ladder position indicator
and rotating flavor lines. Freshly forged images fade in from a blur
like darkroom prints, and two WebAudio chimes mark the start and landing
of each forge. All live image requests are sent with `nologo=true` and
`private=true` so counterfeits are watermark-free and stay out of the
public feed.

## Deploy to Vercel (free tier)

The app is a standard Next.js project with no server requirements, so the
default Vercel flow works out of the box:

1. Push this repo to GitHub (make sure `public/content/` is committed —
   that's the whole game content, ~14 MB, every image under 300 KB).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Next.js** — leave every setting at its default.
4. (Optional, unlocks Live Forge) Add the environment variable
   `NEXT_PUBLIC_POLLINATIONS_APP_KEY` with your `pk_…` App Key — see above.
5. Deploy. Done — no server, no database, no other API keys needed.

Or from your terminal:

```bash
npx vercel          # preview
npx vercel --prod   # production
```

## Regenerating the fakes with Pollinations (optional)

The shipped fakes were pre-generated at build time so the game needs **no
API key to play** — anyone can clone and deploy it as-is. If you have a
Pollinations API key, you can regenerate all 60 fake images with live
Pollinations models in one command:

```bash
# free key: https://enter.pollinations.ai/keys
POLLINATIONS_API_KEY=pk_xxxxx bun run content:regen
```

The script calls the OpenAI-compatible endpoint
(`POST https://gen.pollinations.ai/v1/images/generations`) with the
`flux` model, matching each fake's size to its real counterpart's
orientation. Re-run `python3 scripts/build_rounds.py` afterward if you
edit any metadata, and consider refreshing the tells in
`data/fake_tells.json` (they describe the pre-baked images).

### Content pipeline (how the game was built)

| Step | Script | Output |
| --- | --- | --- |
| Harvest Commons candidates (featured pictures, with full metadata) | `scripts/fetch_commons2.py` | `data/commons_uniq.json` |
| Curate + download the shortlist | `scripts/download_shortlist.py` | `data/shortlist/` |
| VLM quality review of the shortlist | `scripts/vlm_review.ts` | `data/vlm_review.json` |
| Generate the 60 fake images (build time) | `scripts/generate_fakes.ts` | `public/content/fake/` |
| VLM tells analysis for every fake | `scripts/analyze_fakes.ts` | `data/fake_tells.json` |
| Build text rounds (novels/poems/proverbs/captions + AI fakes) | `scripts/build_text_rounds.ts` | `data/text_rounds_raw.json` |
| Assemble the final round pool | `scripts/build_rounds.py` | `src/data/rounds.json` |
| Optimize images to <300 KB WebP | `scripts/optimize_images.py` | `public/content/real/*.webp` |
| Regenerate fakes with Pollinations (optional) | `scripts/regen_with_pollinations.ts` | `public/content/fake/` |

Real photographs live in `public/content/real/`; fakes in
`public/content/fake/`. Rounds are loaded from `src/data/rounds.json`
(93 rounds, 97 KB).

## Credits & licenses

The game could not exist without freely-licensed photography:

- **Every "real" photograph is a Wikimedia Commons featured picture**,
  shown with its title, author, license and source link both in-game
  (after every reveal) and in the full credits list on the home screen.
  Licenses include CC BY-SA, CC BY, CC0 / public domain — see the
  in-app *Credits & licenses* dialog for the complete list.
- **Text rounds** quote public-domain literature (Melville, Austen, the
  Brontës, Dickens, Shelley, Keats, Dickinson, Poe, Frost, Sandburg,
  Blake, Wordsworth …), traditional proverbs, and Commons photo
  descriptions; each is linked to its source.
- **AI fakes** were generated offline at build time and are labeled as
  AI-generated in every reveal — the game never presents synthetic media
  as authentic.

Made with ❤️ by **[Naman](https://github.com/NamanSoni78)** ·
open-sourced at **[NamanSoni78/spot-the-ai](https://github.com/NamanSoni78/spot-the-ai)**.

## Tech notes

- Next.js (App Router) + React + Tailwind CSS v4 + shadcn/ui, one route,
  fully client-side game loop.
- **Live Forge** talks straight from the browser to
  `enter.pollinations.ai` (OAuth + PKCE) and `gen.pollinations.ai`
  (image + chat completions) with the player's own scoped key — no server
  proxy, zero cost for the host. Rounds N+2 are forged in the background
  while the player answers round N.
- Deterministic seeded RNG (`mulberry32`) for the daily challenge.
- WebAudio-synthesized sound (no audio files).
- Lifetime stats persisted in `localStorage`.
- Accessibility: keyboard controls, ARIA labels, reduced-motion support.

## File map

```
src/
  app/            layout, page (game shell), globals.css (theme + animations)
  components/game/  HomeView, GameView, RevealPanel, ResultsView
  lib/            game rules, scoring, rounds pool, RNG, sound, stats, types,
                  pollinations.ts (BYOP OAuth + API), live.ts (live forge)
  data/           rounds.json (the assembled round pool)
public/content/   real/ (Commons photos) + fake/ (pre-generated AI images)
scripts/          content pipeline (see table above)
data/             pipeline inputs & intermediates (not needed at runtime)
```
