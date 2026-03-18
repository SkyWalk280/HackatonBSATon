"use client";
/*
  This file is the MAIN PAGE of your Telegram Mini App.
  It's a "use client" component because it needs to:
    1. Access window.Telegram.WebApp (the Telegram SDK)
    2. Make API calls to your /api/joke endpoint
    3. Handle payment flow state

  HOW THE PAYMENT FLOW WORKS:
    1. User clicks "Get Joke"
    2. Your server returns HTTP 402 with payment instructions
    3. The client needs to sign a TON transaction and retry with the payment header
    4. Server verifies via the facilitator and returns the joke
    
  For this hackathon demo, we show the raw 402 response so you can see it working.
  To do full auto-payment, you'd integrate @ton-x402/client (or build the signing logic).
*/

import { useEffect, useState, useCallback } from "react";

// ---- Types ----
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface JokeResponse {
  joke: string;
  timestamp: string;
}

interface PaymentRequired {
  version: number;
  accepts: Array<{
    amount: string;
    asset: string;
    description: string;
  }>;
}

type Status = "idle" | "loading" | "success" | "payment_required" | "error";

// ---- Component ----
export default function Page() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [joke, setJoke] = useState<JokeResponse | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentRequired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  // ── On mount: initialise Telegram Web App ──
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();           // tells Telegram the app is ready
      tg.expand();          // expands to full screen
      tg.setHeaderColor("#0E1117");
      tg.setBackgroundColor("#0E1117");

      // Get user info from Telegram
      const initData = tg.initDataUnsafe;
      if (initData?.user) {
        setUser(initData.user);
      }
    }
  }, []);

  // ── Fetch joke (calls your paid API endpoint) ──
  const fetchJoke = useCallback(async (paymentHeader?: string) => {
    setStatus("loading");
    setError(null);
    setJoke(null);
    setPaymentInfo(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // If you have a payment header from the previous 402 response, attach it.
      // In a full integration, this header contains the signed TON transaction.
      if (paymentHeader) {
        headers["X-PAYMENT"] = paymentHeader;
      }

      const res = await fetch("/api/joke", { headers });

      if (res.ok) {
        // ✅ Payment verified — we got the joke!
        const data: JokeResponse = await res.json();
        setJoke(data);
        setStatus("success");
        setCount((c) => c + 1);
      } else if (res.status === 402) {
        // 💳 Server wants payment first
        // The response body contains what to pay, to whom, and how much
        const data = await res.json();
        setPaymentInfo(data);
        setStatus("payment_required");
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Something went wrong");
    }
  }, []);

  // ── Render ──
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── Header ─── */}
      <header
        style={{
          padding: "24px 20px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
        className="animate-fade-up"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          {/* TON logo */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--ton-blue)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 56 56" fill="none">
              <path
                d="M28 4L4 16V28C4 41.25 14.75 52.5 28 54C41.25 52.5 52 41.25 52 28V16L28 4Z"
                fill="white"
                fillOpacity="0.9"
              />
              <path
                d="M20 26L28 18L36 26M28 18V38"
                stroke="#0098EA"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1.2,
                fontFamily: "var(--font-sans)",
              }}
            >
              TON x402 Demo
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>
              Pay per joke · testnet
            </p>
          </div>
        </div>

        {/* User greeting */}
        {user && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "var(--ton-blue-dim)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-active)",
              fontSize: 13,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            👤 {user.first_name}
            {user.last_name ? ` ${user.last_name}` : ""}
            {user.username ? ` · @${user.username}` : ""}
            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
              id:{user.id}
            </span>
          </div>
        )}
      </header>

      {/* ─── Body ─── */}
      <div
        style={{
          flex: 1,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
          className="animate-fade-up"
        >
          <StatCard label="Jokes fetched" value={count.toString()} />
          <StatCard label="Network" value="Testnet" accent />
        </div>

        {/* Main action card */}
        <div
          className="animate-fade-up"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 20,
            animationDelay: "0.05s",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 16,
              lineHeight: 1.7,
            }}
          >
            Each joke costs <strong style={{ color: "var(--ton-blue)" }}>0.01 BSA USD</strong> (Jetton on TON testnet).
            Clicking the button calls <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4 }}>/api/joke</code>. 
            If unpaid, you'll see the <strong style={{ color: "var(--warning)" }}>402 Payment Required</strong> response from the server.
          </p>

          <button
            onClick={() => fetchJoke()}
            disabled={status === "loading"}
            style={{
              width: "100%",
              padding: "14px 20px",
              background: status === "loading" ? "var(--ton-blue-dim)" : "var(--ton-blue)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              transition: "background 0.2s, transform 0.1s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            {status === "loading" ? (
              <>
                <Spinner />
                Sending request...
              </>
            ) : (
              <>🎲 Get a Joke (costs 0.01 BSA USD)</>
            )}
          </button>
        </div>

        {/* Result: Payment Required (402) */}
        {status === "payment_required" && paymentInfo && (
          <div
            className="animate-fade-up"
            style={{
              background: "rgba(255, 169, 64, 0.08)",
              border: "1px solid rgba(255, 169, 64, 0.3)",
              borderRadius: "var(--radius)",
              padding: 18,
              animationDelay: "0s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>💳</span>
              <span style={{ fontWeight: 600, color: "var(--warning)", fontSize: 14 }}>
                402 — Payment Required
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
              Your server is working correctly! It returned a 402 response. In a full integration, 
              the client would sign a TON transaction and retry with it attached.
            </p>
            <div
              style={{
                background: "var(--bg)",
                borderRadius: "var(--radius-sm)",
                padding: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-muted)",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(paymentInfo, null, 2)}
            </div>
          </div>
        )}

        {/* Result: Success */}
        {status === "success" && joke && (
          <div
            className="animate-fade-up"
            style={{
              background: "rgba(57, 198, 136, 0.08)",
              border: "1px solid rgba(57, 198, 136, 0.3)",
              borderRadius: "var(--radius)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontWeight: 600, color: "var(--success)", fontSize: 14 }}>
                Payment verified — here's your joke
              </span>
            </div>
            <p
              style={{
                fontSize: 16,
                color: "var(--text-primary)",
                lineHeight: 1.7,
                marginBottom: 10,
              }}
            >
              {joke.joke}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {new Date(joke.timestamp).toLocaleTimeString()}
            </p>
          </div>
        )}

        {/* Result: Error */}
        {status === "error" && error && (
          <div
            className="animate-fade-up"
            style={{
              background: "rgba(255, 92, 92, 0.08)",
              border: "1px solid rgba(255, 92, 92, 0.3)",
              borderRadius: "var(--radius)",
              padding: 16,
            }}
          >
            <span style={{ fontSize: 14, color: "var(--error)" }}>⚠ {error}</span>
          </div>
        )}

        {/* Info section */}
        <div
          className="animate-fade-up"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 16,
            animationDelay: "0.1s",
          }}
        >
          <h2
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Env config
          </h2>
          <ConfigRow label="Network" value={process.env.NEXT_PUBLIC_TON_NETWORK || "testnet"} />
          <ConfigRow label="Jetton" value="kQCd6G7...PnW" mono />
          <ConfigRow label="Facilitator" value="BSA Vercel" />
        </div>
      </div>
    </main>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? "var(--ton-blue-dim)" : "var(--bg-card)",
        border: `1px solid ${accent ? "var(--border-active)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ? "var(--ton-blue)" : "var(--text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          color: "var(--text-secondary)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: mono ? 11 : 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        border: "2px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}