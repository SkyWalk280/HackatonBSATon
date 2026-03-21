# 🎮 Stack Duel

A skill-based 1v1 Telegram Mini App built on TON, where players compete by stacking blocks and winner takes the prize — powered by x402 micropayments.

## Live Demo

**Telegram Bot:** @HacaktonBsaTestBot (With stack-duel botpic) **P.S:** it is Hac**ak**ton (a typo during creation) The botpic and pictures were AI-generated (chatgpt)

**Vercel Deployment:** (https://hackaton-bsa-testing-nextjs-server.vercel.app/)

---

## What It Is

Stack Duel is a competitive stacking game where two players pay a small entry fee in BSA USD (a TON Jetton), play the same challenge under identical conditions, and the higher scorer wins 90% of the pot — automatically paid out on-chain.

No accounts. No subscriptions. Just connect your wallet, pay to play, and win.

---

## How It Works

### The Game
- A block moves horizontally across the screen
- Tap to drop it onto the stack below
- Only the overlapping part stays — misses shrink your block
- Speed increases every 5 successful placements
- Game ends when the block becomes too small to continue
- Score = number of successful stacks

### Fairness
Both players receive the same random **seed** from the server. This seed controls block direction and speed progression — so both players face identical conditions regardless of when they play. Results can be verified by replaying inputs.

### Payment Flow
1. Player 1 creates a match → pays **0.01 BSA USD** entry fee via TonConnect
2. Player 2 joins with the match ID → pays **0.01 BSA USD** entry fee
3. Both players play independently (no real-time sync needed)
4. Server compares scores → winner automatically receives **0.018 BSA USD**
5. Platform keeps **0.002 BSA USD** (10% fee)
6. On a tie → both players are refunded their entry fee

---

## Architecture

```
Telegram Mini App (Next.js 15)
├── Lobby (create / join match)
│   └── TonConnect wallet integration
│   └── x402 payment gate (entry fee verification)
├── Game (canvas-based stacking game)
│   └── Seeded random for fairness
│   └── Score submission to server
└── Results (winner announcement + prize display)

Server (Next.js API Routes on Vercel)
├── /api/match/create     — creates match, stores in Redis
├── /api/match/join       — joins match, starts game
├── /api/match/score      — submits score, triggers payout
├── /api/match/[id]       — polls match state
├── /api/facilitator/verify — verifies x402 payment offline
└── /api/facilitator/settle — confirms payment on-chain

Blockchain (TON Testnet)
├── BSA USD Jetton (kQCd6G7c_HUBkgwtmGzpdqvHIQoNkYOEE0kSWoc5v57hPPnW)
├── TonConnect for wallet signing
└── Server-side payout via WalletContractV5R1
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Game Engine | HTML5 Canvas + requestAnimationFrame |
| Wallet | TonConnect UI React |
| Payments | x402 protocol (@ton-x402/middleware) |
| Blockchain | TON Testnet, Jetton (TEP-74) |
| Storage | Upstash Redis |
| Hosting | Vercel |
| Package Manager | pnpm workspaces |

---

## x402 Protocol

This app uses the **x402 pay-per-request** protocol:

1. Client calls a protected endpoint with no payment → server returns **HTTP 402**
2. Client reads payment instructions from the 402 response body
3. Client builds a Jetton transfer with a unique `queryId` comment
4. TonConnect sends the transaction → user approves in Tonkeeper
5. Client retries the endpoint with a `PAYMENT-SIGNATURE` header (base64 encoded BOC + metadata)
6. Server calls `/api/facilitator/verify` (offline BOC check) → valid
7. Server calls `/api/facilitator/settle` (polls chain for confirmation) → confirmed
8. Server returns the protected resource 

---

## Money Flow

```
Player 1:  -0.01 BSA USD  (entry fee)
Player 2:  -0.01 BSA USD  (entry fee)
                ↓
     PAYMENT_ADDRESS collects 0.02 BSA USD
                ↓
     Server sends 0.018 BSA USD → winner
     Platform keeps 0.002 BSA USD (10% fee)
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- pnpm 9+
- Tonkeeper wallet (testnet mode)
- Testnet BSA USD tokens
- Upstash Redis account (free tier)
- TON Center API key (free at toncenter.com)

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Start dev server
pnpm dev
```

### Environment Variables

Create `examples/nextjs-server/.env.local`:

```env
# TON Network
TON_NETWORK=testnet
TON_RPC_URL=https://testnet.toncenter.com/api/v2/jsonRPC
RPC_API_KEY=your_toncenter_api_key

# Wallet (server-side payout)
PAYMENT_ADDRESS=your_tonkeeper_testnet_address
WALLET_MNEMONIC="word1 word2 ... word24"

# Jetton
JETTON_MASTER_ADDRESS=kQCd6G7c_HUBkgwtmGzpdqvHIQoNkYOEE0kSWoc5v57hPPnW

# Facilitator
FACILITATOR_URL=https://your-vercel-url.vercel.app/api/facilitator

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# App
NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app
NEXT_PUBLIC_TON_NETWORK=testnet
```

### Testing Locally

Open `http://localhost:3000` — the lobby.
Open `http://localhost:3000/game` — the game directly (no payment required for testing).

Use Postman or curl to test the match API:

```bash
# Create a match
curl -X POST http://localhost:3000/api/match/create \
  -H "Content-Type: application/json" \
  -d '{"playerAddress":"0:your_address","paymentBoc":"test"}'

# Get match state
curl http://localhost:3000/api/match/MATCHID

# Join a match
curl -X POST http://localhost:3000/api/match/join \
  -H "Content-Type: application/json" \
  -d '{"matchId":"MATCHID","playerAddress":"0:other_address","paymentBoc":"test"}'
```

---

## Deploying to Vercel

```bash
# Push to GitHub
git add .
git commit -m "Stack Duel"
git push

# Connect repo to Vercel
# Set root directory to: examples/nextjs-server
# Add all environment variables in Vercel dashboard
# Deploy
```

---

## Project Structure

```
telegram-miniapp/
├── packages/
│   ├── core/          — shared types + payment encoding
│   ├── middleware/    — paymentGate() function
│   ├── facilitator/   — verify + settle handlers
│   └── client/        — CLI client (server-to-server)
└── examples/
    └── nextjs-server/
        ├── app/
        │   ├── page.tsx              — lobby (create/join)
        │   ├── game/page.tsx         — stacking game
        │   ├── hooks/usePayment.ts   — x402 payment hook
        │   └── api/
        │       ├── match/            — match CRUD endpoints
        │       ├── match-entry/      — payment-gated entry
        │       └── facilitator/      — verify + settle
        └── lib/
            ├── match-store.ts        — Redis match storage
            ├── payout.ts             — server-side TON payout
            └── payment-config.ts     — x402 config
```

---

## Key Design Decisions

**Why role-based scoring instead of address-based?**
Using `role=player1/player2` instead of wallet addresses to track scores ensures correct behavior even when testing with the same wallet, and eliminates any ambiguity when two players have identical addresses.

**Why seeded randomness?**
Both players get the same seed from the server, generating identical block sequences. This makes the game provably fair — neither player has any advantage from latency or timing.

**Why x402 instead of a subscription?**
x402 enables true pay-per-use — players only pay when they play. No accounts, no recurring charges, no friction. The entry fee is collected atomically with the game session.

**Why Upstash Redis instead of a database?**
Vercel serverless functions are stateless — an in-memory store would be wiped between requests. Redis provides persistent shared state across all function instances with minimal setup.

---

## Hackathon Context

Built for the **BSA x TON Hackathon 2026** — TON generalist track.

**Stack:** Next.js · TON · TonConnect · x402 · Upstash Redis · Vercel

**Team:** [Your name]