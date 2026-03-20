"use client";

import { useEffect, useState, useCallback } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { usePayment } from "./hooks/usePayment";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export default function Page() {
  const wallet = useTonWallet();
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [joke, setJoke] = useState<{ joke: string; timestamp: string } | null>(null);
  const [fact, setFact] = useState<{ fact: string; timestamp: string } | null>(null);
  const [totalPaid, setTotalPaid] = useState(0);
  const [activeTab, setActiveTab] = useState<"joke" | "fact">("joke");

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#0A0F1A");
      tg.setBackgroundColor("#0A0F1A");
      if (tg.initDataUnsafe?.user) setTgUser(tg.initDataUnsafe.user);
    }
  }, []);

  const jokePayment = usePayment({
    endpoint: "/api/joke",
    onSuccess: useCallback((data: any) => {
      setJoke(data);
      setTotalPaid((s) => s + 0.01);
    }, []),
  });

  const factPayment = usePayment({
    endpoint: "/api/fact",
    onSuccess: useCallback((data: any) => {
      setFact(data);
      setTotalPaid((s) => s + 0.005);
    }, []),
  });

  const active = activeTab === "joke" ? jokePayment : factPayment;
  const isLoading = ["loading","payment_required","waiting_wallet","verifying"].includes(active.status);

  const statusLabel: Record<string, string> = {
    idle: activeTab === "joke" ? "Get Joke · 0.01 BSA USD" : "Get Fact · 0.005 BSA USD",
    loading: "Calling server...",
    payment_required: "Building transaction...",
    waiting_wallet: "Approve in Tonkeeper...",
    verifying: "Verifying on-chain...",
    success: "Get another!",
    error: "Try again",
  };

  return (
    <main style={s.main}>
      <header style={s.header}>
        <div style={s.headerRow}>
          <div style={s.logoRow}>
            <TonBadge />
            <div>
              <div style={s.title}>TON x402 Demo</div>
              <div style={s.subtitle}>Pay-per-request · testnet</div>
            </div>
          </div>
          <TonConnectButton />
        </div>
        {tgUser && (
          <div style={s.userRow}>
            <span>👤</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {tgUser.first_name}{tgUser.username ? ` · @${tgUser.username}` : ""}
            </span>
            <span style={{ color: "var(--text-muted)", marginLeft: "auto", fontSize: 11 }}>
              id:{tgUser.id}
            </span>
          </div>
        )}
      </header>

      <div style={s.body}>
        <div style={s.row}>
          <Stat label="Wallet" value={wallet ? "Connected ✓" : "Not connected"} blue={!!wallet} />
          <Stat label="Total spent" value={`${totalPaid.toFixed(3)} BSA`} />
        </div>

        <div style={s.tabs}>
          {(["joke","fact"] as const).map((t) => (
            <button key={t} style={{ ...s.tab, ...(activeTab === t ? s.tabOn : {}) }} onClick={() => setActiveTab(t)}>
              {t === "joke" ? "🎲 Jokes" : "💡 Facts"}
              <span style={s.pill}>{t === "joke" ? "0.01" : "0.005"}</span>
            </button>
          ))}
        </div>

        <div style={s.card}>
          <p style={s.desc}>
            {activeTab === "joke"
              ? "Each joke costs 0.01 BSA USD. Your wallet signs a Jetton transfer, the server verifies it via the BSA facilitator, then returns your joke."
              : "Each fact costs 0.005 BSA USD. Same x402 flow — just a different endpoint and a lower price."}
          </p>

          {!wallet && (
            <div style={s.warn}>⚠ Connect your TON wallet above first (use Tonkeeper, switch to testnet)</div>
          )}

          <button
            onClick={active.execute}
            disabled={isLoading || !wallet}
            style={{ ...s.btn, ...(isLoading || !wallet ? s.btnOff : {}) }}
          >
            {isLoading ? <><Spin /> {statusLabel[active.status]}</> : (statusLabel[active.status] || statusLabel.idle)}
          </button>

          {isLoading && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              {[
                ["loading",          "Calling /api/" + activeTab],
                ["payment_required", "Got 402 · building Jetton tx"],
                ["waiting_wallet",   "Waiting for Tonkeeper approval"],
                ["verifying",        "Verifying with facilitator"],
              ].map(([key, label]) => {
                const statuses = ["loading","payment_required","waiting_wallet","verifying","success"];
                const currentIdx = statuses.indexOf(active.status);
                const thisIdx = statuses.indexOf(key);
                return (
                  <div key={key} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0" }}>
                    <div style={{
                      width:16, height:16, borderRadius:"50%", flexShrink:0,
                      background: currentIdx > thisIdx ? "var(--success)" : currentIdx === thisIdx ? "var(--ton-blue)" : "var(--border)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:9, color:"#fff", transition:"background 0.3s",
                    }}>
                      {currentIdx > thisIdx ? "✓" : ""}
                    </div>
                    <span style={{ fontSize:12, color: currentIdx >= thisIdx ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {active.status === "success" && (activeTab === "joke" ? joke : fact) && (
          <div style={s.result}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
              <span style={{ color:"var(--success)", fontWeight:600, fontSize:13 }}>✓ Payment verified</span>
            </div>
            <p style={{ fontSize:15, color:"var(--text-primary)", lineHeight:1.7, marginBottom:6 }}>
              {activeTab === "joke" ? joke?.joke : (fact as any)?.fact}
            </p>
            <p style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
              {new Date((activeTab === "joke" ? joke?.timestamp : (fact as any)?.timestamp) || "").toLocaleTimeString()}
            </p>
          </div>
        )}

        {active.status === "error" && active.error && (
          <div style={s.err}>⚠ {active.error}</div>
        )}

        <div style={s.card}>
          <div style={s.sectionLabel}>How x402 works</div>
          {[
            ["1", "GET /api/joke",       "No payment → server returns HTTP 402"],
            ["2", "Read 402 body",       "Contains: amount, asset, destination address"],
            ["3", "Build Jetton tx",     "Sign transfer in Tonkeeper wallet"],
            ["4", "Retry with X-PAYMENT","Attach signed BOC as request header"],
            ["5", "Facilitator verifies","Checks TON chain via BSA Vercel server"],
            ["6", "Joke returned ✓",     "Server confirms and responds with data"],
          ].map(([n, label, sub]) => (
            <div key={n} style={{ display:"flex", gap:10, padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
              <div style={{
                width:20, height:20, borderRadius:"50%", flexShrink:0, marginTop:1,
                background:"var(--ton-blue-dim)", border:"1px solid var(--border-active)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, color:"var(--ton-blue)", fontFamily:"var(--font-mono)", fontWeight:700,
              }}>{n}</div>
              <div>
                <div style={{ fontSize:13, color:"var(--text-primary)", fontWeight:500 }}>{label}</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:1 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, blue }: { label:string; value:string; blue?:boolean }) {
  return (
    <div style={{ flex:1, background: blue ? "var(--ton-blue-dim)" : "var(--bg-card)", border:`1px solid ${blue ? "var(--border-active)" : "var(--border)"}`, borderRadius:10, padding:"10px 12px" }}>
      <div style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700, color: blue ? "var(--ton-blue)" : "var(--text-primary)", fontFamily:"var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function TonBadge() {
  return (
    <div style={{ width:34, height:34, borderRadius:"50%", background:"var(--ton-blue)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <svg width="18" height="18" viewBox="0 0 56 56" fill="none">
        <path d="M28 4L4 16V28C4 41.25 14.75 52.5 28 54C41.25 52.5 52 41.25 52 28V16L28 4Z" fill="white" fillOpacity="0.9"/>
        <path d="M20 26L28 18L36 26M28 18V38" stroke="#0098EA" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function Spin({ size = 13 }: { size?: number }) {
  return <div style={{ width:size, height:size, border:`${size<12?1.5:2}px solid rgba(255,255,255,0.3)`, borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block", flexShrink:0 }} />;
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column" },
  header: { padding:"14px 16px 12px", background:"var(--bg-card)", borderBottom:"1px solid var(--border)" },
  headerRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 },
  logoRow: { display:"flex", alignItems:"center", gap:10 },
  title: { fontSize:15, fontWeight:700, color:"var(--text-primary)", lineHeight:1.2 },
  subtitle: { fontSize:11, color:"var(--text-secondary)", marginTop:1 },
  userRow: { display:"flex", alignItems:"center", gap:6, background:"var(--ton-blue-dim)", border:"1px solid var(--border-active)", borderRadius:8, padding:"5px 10px", color:"var(--text-secondary)" },
  body: { display:"flex", flexDirection:"column", gap:12, padding:"12px 16px 24px" },
  row: { display:"flex", gap:10 },
  tabs: { display:"flex", gap:8 },
  tab: { flex:1, padding:"9px 0", borderRadius:10, border:"1px solid var(--border)", background:"var(--bg-card)", color:"var(--text-secondary)", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"var(--font-sans)", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.15s" },
  tabOn: { background:"var(--ton-blue-dim)", border:"1px solid var(--border-active)", color:"var(--text-primary)" },
  pill: { fontSize:10, color:"var(--ton-blue)", background:"rgba(0,152,234,0.15)", padding:"1px 5px", borderRadius:4, fontFamily:"var(--font-mono)" },
  card: { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:14, padding:16 },
  desc: { fontSize:13, color:"var(--text-secondary)", lineHeight:1.7, marginBottom:12 },
  warn: { background:"rgba(255,169,64,0.08)", border:"1px solid rgba(255,169,64,0.25)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--warning)", marginBottom:12 },
  btn: { width:"100%", padding:"13px 16px", background:"var(--ton-blue)", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:600, fontFamily:"var(--font-sans)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 },
  btnOff: { background:"var(--ton-blue-dim)", cursor:"not-allowed", color:"rgba(255,255,255,0.35)" },
  result: { background:"rgba(57,198,136,0.07)", border:"1px solid rgba(57,198,136,0.25)", borderRadius:14, padding:16 },
  err: { background:"rgba(255,92,92,0.08)", border:"1px solid rgba(255,92,92,0.25)", borderRadius:10, padding:"12px 16px", fontSize:13, color:"var(--error)" },
  sectionLabel: { fontSize:10, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 },
};