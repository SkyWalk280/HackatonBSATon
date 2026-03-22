"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePayment } from "./hooks/usePayment";

interface TelegramUser { id: number; first_name: string; username?: string; }
type LobbyScreen = "home" | "creating" | "waiting" | "joining" | "join_preview";
type GameMode = "stack" | "memory" | "reaction";

const GAME_OPTIONS: { value: GameMode; label: string; emoji: string; desc: string }[] = [
  { value: "stack",    label: "Stack Duel",    emoji: "🎮", desc: "Drop blocks, stack as high as you can" },
  { value: "memory",  label: "Memory Grid",   emoji: "🧠", desc: "Remember and repeat the tile sequence" },
  { value: "reaction",label: "Reaction Time", emoji: "⚡", desc: "Tap the target as fast as possible" },
];

const BET_OPTIONS = [
  { value: 0.01, label: "0.01", nano: "10000000" },
  { value: 0.05, label: "0.05", nano: "50000000" },
  { value: 0.10, label: "0.10", nano: "100000000" },
  { value: 0.50, label: "0.50", nano: "500000000" },
];

function LobbyContent() {
  const searchParams = useSearchParams();
  const wallet = useTonWallet();
  const router = useRouter();

  // Read preset params (used by rematch / deep-link join)
  const rawPresetMode = searchParams.get("presetMode") ?? "";
  const presetMode: GameMode = (["stack","memory","reaction"] as const).includes(rawPresetMode as GameMode)
    ? rawPresetMode as GameMode : "stack";
  const rawPresetBet = Number(searchParams.get("presetBet") ?? "");
  const presetBet = BET_OPTIONS.some(o => o.value === rawPresetBet) ? rawPresetBet : 0.01;
  const joinMatchIdParam = searchParams.get("joinMatchId") ?? "";

  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  // If arriving via rematch (presetMode param present), skip straight to creating screen
  const isRematch = searchParams.get("presetMode") !== null;
  const [screen, setScreen] = useState<LobbyScreen>(isRematch ? "creating" : "home");
  const [matchId, setMatchId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [matchSeed, setMatchSeed] = useState(0);
  const [matchExpiresAt, setMatchExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState("5:00");
  const [gameMode, setGameMode] = useState<GameMode>(presetMode);
  const gameModeRef = useRef<GameMode>(presetMode);
  const [betAmount, setBetAmount] = useState(presetBet);
  const betRef = useRef(presetBet);
  const [joinMatchInfo, setJoinMatchInfo] = useState<{
    gameMode: string; betAmount: number; nano: string;
  } | null>(null);
  const [joinEndpoint, setJoinEndpoint] = useState("/api/match-entry/10000000");
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const isPublicRef = useRef(true);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready(); tg.expand();
      tg.setHeaderColor("#0A0F1A");
      tg.setBackgroundColor("#0A0F1A");
      if (tg.initDataUnsafe?.user) setTgUser(tg.initDataUnsafe.user);
    }
  }, []);

  // Fetch username when wallet connects
  useEffect(() => {
    const addr = wallet?.account?.address;
    if (!addr) return;
    fetch(`/api/profile/username?address=${encodeURIComponent(addr)}`)
      .then(r => r.json())
      .then(d => { if (d.username) { setUsername(d.username); setUsernameInput(d.username); } })
      .catch(() => {});
  }, [wallet?.account?.address]);

  async function saveUsername() {
    const addr = wallet?.account?.address;
    if (!addr || !usernameInput.trim()) return;
    setUsernameSaving(true);
    try {
      const r = await fetch("/api/profile/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, username: usernameInput }),
      });
      const d = await r.json();
      if (d.username) { setUsername(d.username); setEditingUsername(false); }
      else if (d.error) setError(d.error);
    } catch (e: any) { setError(e.message); }
    finally { setUsernameSaving(false); }
  }

  // Auto-join from deep link (?joinMatchId=X)
  useEffect(() => {
    if (!joinMatchIdParam.trim()) return;
    const id = joinMatchIdParam.toUpperCase();
    setJoinInput(id);
    (async () => {
      try {
        const res = await fetch(`/api/match/${id}`);
        const data = await res.json();
        if (data.error || data.status !== "waiting") {
          setError(data.error || "Match is not open");
          return;
        }
        const bet = data.betAmount ?? 0.01;
        const nano = BET_OPTIONS.find(o => o.value === bet)?.nano
          ?? Math.round(bet * 1_000_000_000).toString();
        setJoinMatchInfo({ gameMode: data.gameMode, betAmount: bet, nano });
        setJoinEndpoint(`/api/match-entry/${nano}`);
        setScreen("join_preview");
      } catch (e: any) { setError("Could not load match: " + e.message); }
    })();
  }, [joinMatchIdParam]);

  // Waiting room countdown
  useEffect(() => {
    if (screen !== "waiting" || !matchExpiresAt) return;
    const tick = () => {
      const diff = Math.max(0, matchExpiresAt - Date.now());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [screen, matchExpiresAt]);

  const getGamePage = (mode: string) => {
    if (mode === "memory") return "/memory";
    if (mode === "reaction") return "/reaction";
    return "/game";
  };

  const betNano = BET_OPTIONS.find(o => o.value === betAmount)?.nano ?? "10000000";

  const createPayment = usePayment({
    endpoint: `/api/match-entry/${betNano}`,
    onSuccess: useCallback(async (_data: any) => {
      try {
        const currentMode = gameModeRef.current;
        const currentBet = betRef.current;
        const res = await fetch("/api/match/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerAddress: wallet?.account?.address,
            paymentBoc: "verified",
            gameMode: currentMode,
            betAmount: currentBet,
            isPublic: isPublicRef.current,
          }),
        });
        const match = await res.json();
        setMatchId(match.matchId);
        setMatchSeed(match.seed);
        setMatchExpiresAt(match.expiresAt ?? null);
        setScreen("waiting");
      } catch (err: any) { setError("Failed to create match: " + err.message); }
    }, [wallet]),
  });

  const joinPayment = usePayment({
    endpoint: joinEndpoint,
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

  const handlePreviewMatch = useCallback(async () => {
    const id = joinInput.trim().toUpperCase();
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/match/${id}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (data.status !== "waiting") { setError("Match is not open (already started or finished)"); return; }
      const bet = data.betAmount ?? 0.01;
      const nano = BET_OPTIONS.find(o => o.value === bet)?.nano
        ?? Math.round(bet * 1_000_000_000).toString();
      setJoinMatchInfo({ gameMode: data.gameMode, betAmount: bet, nano });
      setJoinEndpoint(`/api/match-entry/${nano}`);
      setScreen("join_preview");
    } catch (err: any) { setError("Could not look up match: " + err.message); }
  }, [joinInput]);

  // Player 1 waiting room — polls until opponent joins or match expires
  useEffect(() => {
    if (screen !== "waiting" || !matchId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}`);
        const data = await res.json();
        if (data.status === "playing") {
          clearInterval(interval);
          router.push(`${getGamePage(gameModeRef.current)}?matchId=${matchId}&playerAddress=${wallet?.account?.address}&seed=${matchSeed}&role=player1`);
        } else if (data.status === "expired") {
          clearInterval(interval);
          setScreen("home");
          setError("Match expired — no one joined in time. Your entry fee will be refunded.");
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
  const prize = (betAmount * 2 * 0.9).toFixed(3);

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
        {wallet && !editingUsername && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}>
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>
              Display name: <strong style={{ color: username ? "var(--text-primary)" : "var(--text-muted)" }}>{username ?? "not set"}</strong>
            </span>
            <button onClick={() => setEditingUsername(true)} style={{ background:"none", border:"none", color:"var(--ton-blue)", fontSize:12, cursor:"pointer", padding:0 }}>
              {username ? "✏️ Edit" : "✏️ Set"}
            </button>
          </div>
        )}
        {wallet && editingUsername && (
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            <input
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              maxLength={20}
              placeholder="Display name…"
              autoFocus
              style={{ flex:1, padding:"6px 10px", background:"var(--bg)", border:"1px solid var(--border-active)", borderRadius:7, color:"var(--text-primary)", fontSize:13, outline:"none" }}
            />
            <button onClick={saveUsername} disabled={usernameSaving || usernameInput.trim().length < 2}
              style={{ padding:"6px 12px", background:"var(--ton-blue)", border:"none", borderRadius:7, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", opacity: usernameSaving ? 0.6 : 1 }}>
              {usernameSaving ? "…" : "Save"}
            </button>
            <button onClick={() => { setEditingUsername(false); setUsernameInput(username ?? ""); }}
              style={{ padding:"6px 10px", background:"none", border:"1px solid var(--border)", borderRadius:7, color:"var(--text-secondary)", fontSize:13, cursor:"pointer" }}>
              ✕
            </button>
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
                ["1", `Pay ${betAmount.toFixed(2)} BSA USD`, "Entry fee to create or join"],
                ["2", "Pick your game", "3 game modes available"],
                ["3", `Winner takes ${prize}`, `90% of ${(betAmount*2).toFixed(2)} BSA USD pot`],
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
              <div style={s.sectionLabel}>Bet Amount (BSA USD)</div>
              <div style={{ display:"flex", gap:6 }}>
                {BET_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setBetAmount(opt.value); betRef.current = opt.value; }}
                    style={{ ...s.betChip, ...(betAmount === opt.value ? s.betChipActive : {}) }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={s.betInfo}>
                Pot: <strong style={{ color:"var(--text-primary)" }}>{(betAmount*2).toFixed(2)} BSA USD</strong>
                {" · "}Winner: <strong style={{ color:"var(--ton-blue)" }}>{prize} BSA USD</strong>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.sectionLabel}>Choose Game Mode</div>
              <div style={{ position:"relative" as const }}>
                <select
                  value={gameMode}
                  onChange={e => {
                    const m = e.target.value as GameMode;
                    setGameMode(m);
                    gameModeRef.current = m;
                  }}
                  style={s.select}
                >
                  {GAME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>
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
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ ...s.btn, ...s.btnGhost, flex:1, fontSize:13 }} onClick={() => router.push("/lobby")}>🏟️ Open Matches</button>
              <button style={{ ...s.btn, ...s.btnGhost, flex:1, fontSize:13 }} onClick={() => router.push("/leaderboard")}>🏆 Leaderboard</button>
            </div>
            <button style={{ ...s.btn, ...s.btnGhost, fontSize:13 }} onClick={() => router.push("/practice")}>
              🎯 Practice Mode
            </button>
            {wallet?.account?.address && (
              <button style={{ ...s.btn, ...s.btnGhost, fontSize:13 }} onClick={() => router.push(`/profile/${encodeURIComponent(wallet.account.address)}`)}>
                👤 My Profile
              </button>
            )}
          </>
        )}

        {screen === "creating" && (
          <div style={s.card}>
            <div style={s.cardTitle}>Create a Match</div>
            <div style={s.modeDesc}>
              <span style={{ fontSize:20 }}>{selectedGame.emoji}</span>
              <span style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>{selectedGame.label}</span>
            </div>
            <div style={s.betBadge}>
              Bet: <strong style={{ color:"var(--ton-blue)" }}>{betAmount.toFixed(2)} BSA USD</strong>
              {" · "}Prize: <strong style={{ color:"var(--ton-blue)" }}>{prize} BSA USD</strong>
            </div>
            <p style={s.cardDesc}>Pay <strong style={{ color:"var(--ton-blue)" }}>{betAmount.toFixed(2)} BSA USD</strong> entry fee. You'll get a match ID to share.</p>
            {/* Public / Private toggle */}
            <div style={{ display:"flex", gap:6 }}>
              {([true, false] as const).map(pub => (
                <button key={String(pub)}
                  onClick={() => { setIsPublic(pub); isPublicRef.current = pub; }}
                  style={{
                    flex:1, padding:"10px 8px",
                    background: isPublic === pub ? (pub ? "rgba(57,198,136,0.15)" : "rgba(168,85,247,0.15)") : "var(--bg)",
                    border: isPublic === pub ? `1px solid ${pub ? "rgba(57,198,136,0.4)" : "rgba(168,85,247,0.4)"}` : "1px solid var(--border)",
                    borderRadius:8, color: isPublic === pub ? (pub ? "#39C688" : "#a855f7") : "var(--text-secondary)",
                    fontSize:13, fontWeight:600, cursor:"pointer",
                  }}>
                  {pub ? "🌐 Public" : "🔒 Private"}
                </button>
              ))}
            </div>
            <div style={{ fontSize:11, color:"var(--text-muted)", textAlign:"center" as const }}>
              {isPublic ? "Anyone can find and join this match in Open Matches" : "Only players with the Match ID can join"}
            </div>
            {!wallet && <div style={s.warnBox}>⚠ Connect wallet first</div>}
            {createPayment.error && <div style={s.errBox}>⚠ {createPayment.error}</div>}
            <button style={{ ...s.btn, opacity:(!wallet||isCreating)?0.5:1 }} disabled={!wallet||isCreating} onClick={createPayment.execute}>
              {isCreating ? "⏳ Processing..." : `Pay ${betAmount.toFixed(2)} BSA USD & Create`}
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
              Bet: <strong style={{ color:"var(--ton-blue)" }}>{betAmount.toFixed(2)} BSA USD</strong><br/>
              Share this ID with your opponent.
            </p>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 12px" }}>
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>Expires in</span>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:600, color: timeLeft < "1:00" ? "var(--warning)" : "var(--text-secondary)" }}>{timeLeft}</span>
            </div>
            <button style={s.btn} onClick={shareMatch}>📤 Share Match ID</button>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => router.push(`/spectate/${matchId}`)}>👁 Watch Live</button>
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
            <p style={s.cardDesc}>Enter the match ID to see bet details before paying.</p>
            <input
              style={s.input}
              placeholder="Match ID (e.g. ABC123)"
              value={joinInput}
              onChange={e => setJoinInput(e.target.value.toUpperCase())}
              maxLength={8}
            />
            <button
              style={{ ...s.btn, opacity:(!joinInput.trim())?0.5:1 }}
              disabled={!joinInput.trim()}
              onClick={handlePreviewMatch}
            >
              Preview Match →
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setScreen("home")}>← Back</button>
          </div>
        )}

        {screen === "join_preview" && joinMatchInfo && (
          <div style={s.card}>
            <div style={s.cardTitle}>Join Match</div>
            <div style={s.matchIdBox}>
              <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:4, textTransform:"uppercase" as const, letterSpacing:"0.07em" }}>Match ID</div>
              <div style={{ fontSize:28, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--ton-blue)", letterSpacing:"0.1em" }}>{joinInput.trim().toUpperCase()}</div>
            </div>
            <div style={s.previewRow}>
              <div style={s.previewItem}>
                <div style={s.previewLabel}>Game Mode</div>
                <div style={s.previewValue}>
                  {GAME_OPTIONS.find(g => g.value === joinMatchInfo.gameMode)?.emoji}{" "}
                  {GAME_OPTIONS.find(g => g.value === joinMatchInfo.gameMode)?.label ?? joinMatchInfo.gameMode}
                </div>
              </div>
              <div style={s.previewItem}>
                <div style={s.previewLabel}>Entry Fee</div>
                <div style={{ ...s.previewValue, color:"var(--ton-blue)" }}>{joinMatchInfo.betAmount.toFixed(2)} BSA</div>
              </div>
              <div style={s.previewItem}>
                <div style={s.previewLabel}>Prize</div>
                <div style={{ ...s.previewValue, color:"var(--ton-blue)" }}>{(joinMatchInfo.betAmount * 2 * 0.9).toFixed(3)} BSA</div>
              </div>
            </div>
            {!wallet && <div style={s.warnBox}>⚠ Connect wallet first</div>}
            {joinPayment.error && <div style={s.errBox}>⚠ {joinPayment.error}</div>}
            <button
              style={{ ...s.btn, opacity:(!wallet||isJoining)?0.5:1 }}
              disabled={!wallet||isJoining}
              onClick={joinPayment.execute}
            >
              {isJoining ? "⏳ Processing..." : `Pay ${joinMatchInfo.betAmount.toFixed(2)} BSA USD & Join`}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setScreen("joining")}>← Back</button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"var(--bg)" }} />
    }>
      <LobbyContent />
    </Suspense>
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
  betChip: { flex:1, padding:"10px 4px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-secondary)", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"var(--font-mono)" },
  betChipActive: { background:"var(--ton-blue-dim)", border:"1px solid var(--border-active)", color:"var(--ton-blue)" },
  betInfo: { fontSize:12, color:"var(--text-muted)", textAlign:"center" as const },
  betBadge: { fontSize:13, color:"var(--text-secondary)", background:"var(--bg)", borderRadius:8, padding:"8px 12px", border:"1px solid var(--border)" },
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
  previewRow: { display:"flex", gap:8 },
  previewItem: { flex:1, background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 8px", display:"flex", flexDirection:"column", gap:4, alignItems:"center" },
  previewLabel: { fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.06em", fontWeight:600 },
  previewValue: { fontSize:13, fontWeight:700, color:"var(--text-primary)", textAlign:"center" as const },
};
