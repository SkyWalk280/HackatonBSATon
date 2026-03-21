"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { useRouter } from "next/navigation";
import { usePayment } from "./hooks/usePayment";

interface TelegramUser { id: number; first_name: string; username?: string; }
type LobbyScreen = "home" | "creating" | "waiting" | "joining";
type GameMode = "stack" | "memory" | "reaction";

const GAME_OPTIONS: { value: GameMode; label: string; emoji: string; desc: string }[] = [
  { value: "stack",    label: "Stack Duel",    emoji: "🎮", desc: "Drop blocks, stack as high as you can" },
  { value: "memory",  label: "Memory Grid",   emoji: "🧠", desc: "Remember and repeat the tile sequence" },
  { value: "reaction",label: "Reaction Time", emoji: "⚡", desc: "Tap the target as fast as possible" },
];

export default function Page() {
  const wallet = useTonWallet();
  const router = useRouter();

  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [screen, setScreen] = useState<LobbyScreen>("home");
  const [matchId, setMatchId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [matchSeed, setMatchSeed] = useState(0);
  const [gameMode, setGameMode] = useState<GameMode>("stack");
  const gameModeRef = useRef<GameMode>("stack"); // always current, survives stale closures
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready(); tg.expand();
      tg.setHeaderColor("#0A0F1A");
      tg.setBackgroundColor("#0A0F1A");
      if (tg.initDataUnsafe?.user) setTgUser(tg.initDataUnsafe.user);
    }
  }, []);

  const getGamePage = (mode: string) => {
    if (mode === "memory") return "/memory";
    if (mode === "reaction") return "/reaction";
    return "/game";
  };

  const createPayment = usePayment({
    endpoint: "/api/match-entry",
    onSuccess: useCallback(async (_data: any) => {
      try {
        // Use ref — not state — so we always get the latest selected mode
        const currentMode = gameModeRef.current;
        console.log("=== CREATING MATCH with mode:", currentMode);
        const res = await fetch("/api/match/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerAddress: wallet?.account?.address,
            paymentBoc: "verified",
            gameMode: currentMode,
          }),
        });
        const match = await res.json();
        console.log("=== SERVER RETURNED:", match);
        setMatchId(match.matchId);
        setMatchSeed(match.seed);
        setScreen("waiting");
      } catch (err: any) { setError("Failed to create match: " + err.message); }
    }, [wallet]), // gameMode removed from deps — ref handles it
  });

  const joinPayment = usePayment({
    endpoint: "/api/match-entry",
    onSuccess: useCallback(async (_data: any) => {
      try {
        const res = await fetch("/api/match/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: joinInput.trim().toUpperCase(),
            playerAddress: wallet?.account?.address,
            paymentBoc: "verified",
          }),
        });
        const match = await res.json();
        if (match.error) { setError(match.error); return; }
        router.push(`${getGamePage(match.gameMode)}?matchId=${match.matchId}&playerAddress=${wallet?.account?.address}&seed=${match.seed}&role=player2`);
      } catch (err: any) { setError("Failed to join match: " + err.message); }
    }, [wallet, joinInput, router]),
  });

  // Player 1 waiting room — polls until opponent joins
  useEffect(() => {
    if (screen !== "waiting" || !matchId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}`);
        const data = await res.json();
        if (data.status === "playing") {
          clearInterval(interval);
          // Use gameModeRef so we always navigate to the correct game
          router.push(`${getGamePage(gameModeRef.current)}?matchId=${matchId}&playerAddress=${wallet?.account?.address}&seed=${matchSeed}&role=player1`);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [screen, matchId, matchSeed, wallet, router]);

  const shareMatch = useCallback(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`Join my Stack Duel! Match ID: ${matchId}`)}`);
    } else {
      navigator.clipboard.writeText(matchId);
      alert(`Match ID copied: ${matchId}`);
    }
  }, [matchId]);

  const isCreating = ["loading","payment_required","waiting_wallet","verifying"].includes(createPayment.status);
  const isJoining  = ["loading","payment_required","waiting_wallet","verifying"].includes(joinPayment.status);
  const selectedGame = GAME_OPTIONS.find(g => g.value === gameMode)!;

  return (
    <main style={s.main}>
      <header style={s.header}>
        <div style={s.headerRow}>
          <div>
            <div style={s.title}>🎮 Stack Duel</div>
            <div style={s.subtitle}>1v1 · Pay to play · Win BSA USD</div>
          </div>
          <TonConnectButton />
        </div>
        {tgUser && (
          <div style={s.userBadge}>
            👤 <span style={{ fontFamily:"var(--font-mono)", fontSize:12 }}>
              {tgUser.first_name}{tgUser.username ? ` · @${tgUser.username}` : ""}
            </span>
          </div>
        )}
      </header>

      <div style={s.body}>
        {error && (
          <div style={s.errBox}>
            ⚠ {error}
            <button onClick={() => setError(null)} style={{ marginLeft:8, background:"none", border:"none", color:"inherit", cursor:"pointer" }}>✕</button>
          </div>
        )}

        {screen === "home" && (
          <>
            <div style={s.card}>
              <div style={s.sectionLabel}>How it works</div>
              {[
                ["1","Pay 0.01 BSA USD","Entry fee to create or join"],
                ["2","Pick your game","3 game modes available"],
                ["3","Winner takes 0.018","90% of pot. Platform keeps 10%."],
              ].map(([n,title,sub]) => (
                <div key={n} style={s.step}>
                  <div style={s.stepNum}>{n}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>{title}</div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={s.card}>
              <div style={s.sectionLabel}>Choose Game Mode</div>
              <div style={{ position:"relative" as const }}>
                <select
                  value={gameMode}
                  onChange={e => {
                    const m = e.target.value as GameMode;
                    setGameMode(m);
                    gameModeRef.current = m; // keep ref in sync
                  }}
                  style={s.select}
                >
                  {GAME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.emoji} {opt.label}
                    </option>
                  ))}
                </select>
                <div style={s.selectArrow}>▾</div>
              </div>
              <div style={s.modeDesc}>
                <span style={{ fontSize:20 }}>{selectedGame.emoji}</span>
                <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{selectedGame.desc}</span>
              </div>
            </div>

            {!wallet && <div style={s.warnBox}>⚠ Connect your TON wallet above to play</div>}
            <button style={{ ...s.btn, opacity:(!wallet||isCreating)?0.5:1 }} disabled={!wallet||isCreating} onClick={() => { setError(null); setScreen("creating"); }}>
              ⚔️ Create Match
            </button>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => { setError(null); setScreen("joining"); }}>
              🔗 Join Match
            </button>
          </>
        )}

        {screen === "creating" && (
          <div style={s.card}>
            <div style={s.cardTitle}>Create a Match</div>
            <div style={s.modeDesc}>
              <span style={{ fontSize:20 }}>{selectedGame.emoji}</span>
              <span style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>{selectedGame.label}</span>
            </div>
            <p style={s.cardDesc}>Pay <strong style={{ color:"var(--ton-blue)" }}>0.01 BSA USD</strong> entry fee. You'll get a match ID to share.</p>
            {!wallet && <div style={s.warnBox}>⚠ Connect wallet first</div>}
            {createPayment.error && <div style={s.errBox}>⚠ {createPayment.error}</div>}
            <button style={{ ...s.btn, opacity:(!wallet||isCreating)?0.5:1 }} disabled={!wallet||isCreating} onClick={createPayment.execute}>
              {isCreating ? "⏳ Processing..." : "Pay 0.01 BSA USD & Create"}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setScreen("home")}>← Back</button>
          </div>
        )}

        {screen === "waiting" && (
          <div style={s.card}>
            <div style={{ fontSize:36, textAlign:"center" as const }}>⏳</div>
            <div style={s.cardTitle}>Waiting for opponent</div>
            <div style={s.matchIdBox}>
              <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:4, textTransform:"uppercase" as const, letterSpacing:"0.07em" }}>Match ID</div>
              <div style={{ fontSize:32, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--ton-blue)", letterSpacing:"0.1em" }}>{matchId}</div>
            </div>
            <p style={s.cardDesc}>
              Game: <strong>{selectedGame.emoji} {selectedGame.label}</strong><br/>
              Share this ID with your opponent.
            </p>
            <button style={s.btn} onClick={shareMatch}>📤 Share Match ID</button>
            <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
              <div style={s.spinnerSm} />
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>Polling for opponent...</span>
            </div>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setScreen("home")}>Cancel</button>
          </div>
        )}

        {screen === "joining" && (
          <div style={s.card}>
            <div style={s.cardTitle}>Join a Match</div>
            <p style={s.cardDesc}>Enter the match ID. Game mode is set by the creator.</p>
            <input style={s.input} placeholder="Match ID (e.g. ABC123)" value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())} maxLength={8} />
            {joinPayment.error && <div style={s.errBox}>⚠ {joinPayment.error}</div>}
            <button style={{ ...s.btn, opacity:(!wallet||!joinInput.trim()||isJoining)?0.5:1 }} disabled={!wallet||!joinInput.trim()||isJoining} onClick={joinPayment.execute}>
              {isJoining ? "⏳ Processing..." : "Pay 0.01 BSA USD & Join"}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setScreen("home")}>← Back</button>
          </div>
        )}
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column" },
  header: { padding:"14px 16px 12px", background:"var(--bg-card)", borderBottom:"1px solid var(--border)" },
  headerRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  title: { fontSize:18, fontWeight:700, color:"var(--text-primary)" },
  subtitle: { fontSize:11, color:"var(--text-secondary)", marginTop:1 },
  userBadge: { display:"flex", alignItems:"center", gap:6, background:"var(--ton-blue-dim)", border:"1px solid var(--border-active)", borderRadius:8, padding:"5px 10px", color:"var(--text-secondary)", fontSize:12 },
  body: { display:"flex", flexDirection:"column", gap:12, padding:"14px 16px 24px" },
  card: { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:14, padding:16, display:"flex", flexDirection:"column", gap:10 },
  cardTitle: { fontSize:16, fontWeight:700, color:"var(--text-primary)" },
  cardDesc: { fontSize:13, color:"var(--text-secondary)", lineHeight:1.6, margin:0 },
  sectionLabel: { fontSize:10, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.07em" },
  step: { display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderBottom:"1px solid var(--border)" },
  stepNum: { width:22, height:22, borderRadius:"50%", background:"var(--ton-blue-dim)", border:"1px solid var(--border-active)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"var(--ton-blue)", fontFamily:"var(--font-mono)", fontWeight:700, flexShrink:0, marginTop:1 },
  select: { width:"100%", padding:"12px 36px 12px 14px", background:"var(--bg)", border:"1px solid var(--border-active)", borderRadius:10, color:"var(--text-primary)", fontSize:15, fontFamily:"var(--font-sans)", fontWeight:600, appearance:"none" as const, WebkitAppearance:"none" as const, cursor:"pointer", outline:"none" },
  selectArrow: { position:"absolute" as const, right:14, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", pointerEvents:"none" as const, fontSize:14 },
  modeDesc: { display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"var(--bg)", borderRadius:8, border:"1px solid var(--border)" },
  btn: { width:"100%", padding:"13px 16px", background:"var(--ton-blue)", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:600, fontFamily:"var(--font-sans)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 },
  btnSecondary: { background:"var(--bg-card)", border:"1px solid var(--border-active)", color:"var(--ton-blue)" },
  btnGhost: { background:"transparent", border:"1px solid var(--border)", color:"var(--text-secondary)" },
  warnBox: { background:"rgba(255,169,64,0.08)", border:"1px solid rgba(255,169,64,0.25)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--warning)" },
  errBox: { background:"rgba(255,92,50,0.08)", border:"1px solid rgba(255,92,50,0.25)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--error)", display:"flex", alignItems:"center" },
  input: { width:"100%", padding:"12px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, color:"var(--text-primary)", fontSize:18, fontFamily:"var(--font-mono)", fontWeight:700, letterSpacing:"0.15em", textAlign:"center" as const, boxSizing:"border-box" as const },
  matchIdBox: { background:"var(--bg)", border:"1px solid var(--border-active)", borderRadius:10, padding:"14px", textAlign:"center" as const },
  spinnerSm: { width:16, height:16, border:"2px solid var(--border)", borderTopColor:"var(--ton-blue)", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 },
};