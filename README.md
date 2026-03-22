# 🎮 Stack Duel

A skill-based 1v1 Telegram Mini App built on TON, where two players bet BSA USD, compete in one of three skill games, and the winner receives 90% of the pot — paid on-chain immediately after the match.

No accounts. No subscriptions. Just connect your wallet, pay to play, and win.

## Live Demo / Simply launch the bot and prepare your testet funds

**Telegram Bot:** @HacaktonBsaTestBot (With stack-duel botpic) **P.S:** it is Hac**ak**ton spelling (a typo during creation). The botpic and pictures were AI-generated.

**Vercel Deployment:** https://hackaton-bsa-testing-nextjs-server.vercel.app/

---

## Game Modes

### 🧱 Stack Duel
A block moves horizontally across the screen. Tap to drop it onto the stack below — only the overlapping part stays, misses shrink the block. Speed increases every 5 successful placements. Game ends when the block becomes too small to continue. Both players receive the same seeded RNG so conditions are identical.

### 🧠 Memory Grid
A 3×3 grid of 9 themed emoji tiles (🔥💎⚡🌊🍀🎯🚀⭐🎮). The game flashes a growing sequence each round; the player must tap the tiles back in the exact order. Each round adds one more tile. Survives more rounds = higher score. Both players receive the same sequence (seeded).

### ⚡ Reaction Time
8 rounds of tap-the-target. A circle appears at a random position after a random delay; tap it as fast as possible. Missing or tapping too early incurs a penalty. Lower cumulative reaction time = higher score. Round positions and delays are seeded identically for both players.

---

## Fairness

Both players receive the same random **seed** from the server. This seed controls all randomness in the game — block direction, tile sequences, target positions — so both players face identical conditions regardless of when they play. Results can be verified by replaying inputs against the same seed.

---

## Match Flow

```
Player 1                              Server                          Player 2
────────                              ──────                          ────────
Pay entry fee (x402)
  → POST /api/match/create
    ← { matchId, seed, expiresAt }
  Waiting room (polls /api/match/:id)

                                                              Pay entry fee (x402)
                                                                → POST /api/match/join
                                                                ← { matchId, seed, gameMode }

Both players redirected to /<game>?matchId=…&seed=…&role=player1|2

Game runs entirely client-side (deterministic seed)

POST /api/match/score  ←──────────────────────────────────────── POST /api/match/score
  (both scores received)
    Winner resolved, payout sent on-chain (90% of pot)
    Leaderboard updated (Redis ZINCRBY)
```

**Match expiry:** If Player 2 never joins within 5 minutes the match is marked `expired` and Player 1's entry fee is automatically refunded.

---

## Money Flow

| Bet | Pot | Winner receives | Platform fee |
|---|---|---|---|
| 0.01 BSA USD × 2 | 0.02 | 0.018 BSA USD | 0.002 (10%) |
| 0.05 BSA USD × 2 | 0.10 | 0.090 BSA USD | 0.010 (10%) |
| 0.10 BSA USD × 2 | 0.20 | 0.180 BSA USD | 0.020 (10%) |
| 0.50 BSA USD × 2 | 1.00 | 0.900 BSA USD | 0.100 (10%) |

On a tie → both players are refunded their entry fee.

```
Player 1:  -bet BSA USD  (entry fee)
Player 2:  -bet BSA USD  (entry fee)
                ↓
     PAYMENT_ADDRESS collects 2× bet
                ↓
     Server sends 90% → winner (on-chain, immediate)
     Platform keeps 10% fee
```
---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend / Backend | Next.js 15 App Router — client components + API routes |
| Game Engine | HTML5 Canvas + `requestAnimationFrame` (Stack); React state (Memory, Reaction) |
| Wallet | TON Connect 2 (`@tonconnect/ui-react`) |
| Payments | x402 protocol (`@ton-x402/middleware`, `@ton-x402/facilitator`) |
| Blockchain | TON Testnet — BSA USD Jetton (TEP-74) |
| Persistence | Upstash Redis (`@upstash/redis`) |
| Hosting | Vercel (serverless functions) |
| Platform | Telegram Mini App (WebApp JS API) |
| Package Manager | pnpm workspaces |

---

## Project Structure

```
telegram-miniapp/
├── packages/
│   ├── core/            — shared types + payment encoding
│   ├── middleware/      — paymentGate() function
│   ├── facilitator/     — verify + settle handlers
│   └── client/          — CLI client (server-to-server testing)
└── examples/
    └── nextjs-server/
        ├── app/
        │   ├── page.tsx                  Lobby — create/join, bet selector, display name
        │   ├── game/page.tsx             Stack Duel game (Canvas)
        │   ├── memory/page.tsx           Memory Grid game
        │   ├── reaction/page.tsx         Reaction Time game
        │   ├── practice/page.tsx         Practice mode selector — play any game free, tracks personal bests
        │   ├── lobby/page.tsx            Open matches browser (public matches only)
        │   ├── leaderboard/page.tsx      Global leaderboard — top 10, clickable profiles
        │   ├── spectate/[matchId]/       Live match spectating — polls every 2s
        │   ├── profile/[address]/        Player profile — stats, win rate, best scores
        │   ├── components/
        │   │   ├── ResultScreen.tsx      Animated results screen (count-up, streak badge, double-or-nothing)
        │   │   └── PracticeResult.tsx    Practice result screen (count-up, personal best, play again)
        │   ├── hooks/usePayment.ts       x402 payment hook
        │   └── api/
        │       ├── match-entry/[bet]/    Payment gate — dynamic per bet amount
        │       ├── match/create/         Create match (post-payment); accepts isPublic
        │       ├── match/join/           Join match (post-payment)
        │       ├── match/[id]/           Poll state; triggers expiry refund
        │       ├── match/score/          Submit score; payout + leaderboard + stats + streak
        │       ├── matches/open/         List public waiting matches only
        │       ├── leaderboard/          Top 10 sorted set (resolves usernames + TON DNS)
        │       ├── profile/username/     GET/POST display name per wallet address
        │       ├── profile/stats/        GET player stats (wins, losses, earnings, bests)
        │       ├── profile/streak/       GET current win streak for a wallet address
        │       └── facilitator/          verify + settle endpoints
        └── lib/
            ├── redis.ts                  Shared Upstash Redis client
            ├── match-store.ts            Match CRUD — Redis-backed, async, with expiry
            ├── payout.ts                 Server-side BSA USD payout via TON
            ├── payment-config.ts         x402 config helper
            ├── sounds.ts                 Web Audio API sound synthesis (no asset files)
            ├── gameHash.ts               SHA-256 game fingerprint via Web Crypto API
            └── tonDns.ts                 Resolve .ton DNS names via TON API
```
## Running Locally

### Prerequisites
- Node.js 18+, pnpm 9+
- Tonkeeper wallet in testnet mode
- Testnet BSA USD tokens
- Upstash Redis account (free tier)
- TON Center API key (free at toncenter.com)

### Setup

```bash
# Clone and install
git clone https://github.com/SkyWalk280/HackatonBSATon.git
cd telegram-miniapp
pnpm install
pnpm -r build

# Start dev server
cd examples/nextjs-server
pnpm dev
```

### Environment Variables

Create `examples/nextjs-server/.env.local`:

```env
# TON Network
TON_NETWORK=testnet
TON_RPC_URL=https://testnet.toncenter.com/api/v2/jsonRPC
RPC_API_KEY=your_toncenter_api_key

# Wallet (server-side payout signer)
PAYMENT_ADDRESS=your_tonkeeper_testnet_address
WALLET_MNEMONIC="word1 word2 ... word24"

# BSA USD Jetton master contract
JETTON_MASTER_ADDRESS=kQCd6G7c_HUBkgwtmGzpdqvHIQoNkYOEE0kSWoc5v57hPPnW

# x402 facilitator (point to self in production)
FACILITATOR_URL=https://your-vercel-url.vercel.app/api/facilitator

# Upstash Redis (upstash.com — free tier works)
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Public URL (used in share-win links)
NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app
NEXT_PUBLIC_TON_NETWORK=testnet
```
---

## Hackathon Context

Built for the **BSA × TON Hackathon 2026** — TON generalist track.

**Stack:** Next.js · TON · TonConnect · x402 · Upstash Redis · Vercel

**Team:** Anthony Abou Haidar