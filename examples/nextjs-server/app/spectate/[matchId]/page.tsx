"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { resolveTonName } from "../../../lib/tonDns";

const MODE_EMOJI: Record<string, string> = { stack: "🧱", memory: "🧠", reaction: "⚡" };
const MODE_LABEL: Record<string, string> = { stack: "Stack Duel", memory: "Memory Grid", reaction: "Reaction Time" };

interface MatchState {
  id: string;
  status: "waiting" | "playing" | "finished" | "expired";
  gameMode: string;
  betAmount: number;
  player1: { address: string; score: number | null; finished: boolean } | null;
  player2: { address: string; score: number | null; finished: boolean } | null;
  winnerId: string | null;
  payoutTxHash: string | null;
  createdAt: number;
  isPublic: boolean;
}

function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function PlayerCard({
  label, addr, username, score, finished, isWinner, isTie,
}: {
  label: string; addr: string; username: string | null;
  score: number | null; finished: boolean;
  isWinner: boolean; isTie: boolean;
}) {
  return (
    <div style={{
      flex: 1,
      background: isWinner ? "rgba(57,198,136,0.1)" : isTie ? "rgba(255,169,64,0.08)" : "rgba(255,255,255,0.04)",
      border: isWinner ? "1px solid rgba(57,198,136,0.35)" : isTie ? "1px solid rgba(255,169,64,0.25)" : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: "18px 14px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      position: "relative",
    }}>
      {isWinner && (
        <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", fontSize: 22 }}>🏆</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", opacity: 0.45 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, textAlign: "center" }}>
        {username ?? shortAddr(addr)}
      </div>
      {username && (
        <div style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.3 }}>{shortAddr(addr)}</div>
      )}
      <div style={{ marginTop: 8 }}>
        {finished ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "monospace", color: isWinner ? "#39C688" : "#fff" }}>
              {score ?? 0}
            </div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>score</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: 28, height: 28, border: "3px solid rgba(255,255,255,0.15)", borderTopColor: "#0098EA", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 12, opacity: 0.5 }}>playing…</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpectatePage() {
  const router = useRouter();
  const { matchId } = useParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchState | null>(null);
  const [usernames, setUsernames] = useState<{ p1: string | null; p2: string | null }>({ p1: null, p2: null });
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function fetchMatch() {
    try {
      const r = await fetch(`/api/match/${matchId}`);
      if (!r.ok) { setError("Match not found"); return; }
      const data: MatchState = await r.json();
      setMatch(data);
      setLastUpdate(new Date());
      // Resolve usernames once we have addresses
      if (data.player1?.address && !usernames.p1) {
        fetch(`/api/profile/username?address=${encodeURIComponent(data.player1.address)}`)
          .then(r => r.json()).then(d => setUsernames(u => ({ ...u, p1: d.username ?? null }))).catch(() => {});
      }
      if (data.player2?.address && !usernames.p2) {
        fetch(`/api/profile/username?address=${encodeURIComponent(data.player2.address)}`)
          .then(r => r.json()).then(d => setUsernames(u => ({ ...u, p2: d.username ?? null }))).catch(() => {});
      }
      // Fallback to .ton DNS if no display name set
      if (data.player1?.address && !usernames.p1) {
        resolveTonName(data.player1.address)
          .then(name => { if (name) setUsernames(u => ({ ...u, p1: u.p1 ?? name })); })
          .catch(() => {});
      }
      if (data.player2?.address && !usernames.p2) {
        resolveTonName(data.player2.address)
          .then(name => { if (name) setUsernames(u => ({ ...u, p2: u.p2 ?? name })); })
          .catch(() => {});
      }
    } catch (e: any) { setError(e.message); }
  }

  useEffect(() => {
    fetchMatch();
    const interval = setInterval(fetchMatch, 2000);
    return () => clearInterval(interval);
  }, [matchId]);

  const isFinished = match?.status === "finished";
  const isTie = match?.winnerId === "tie";
  const p1wins = !isTie && match?.winnerId === "player1";
  const p2wins = !isTie && match?.winnerId === "player2";
  const prizeDisplay = match ? ((Number(match.betAmount) * 2 * 0.9)).toFixed(3) : "0";

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--tg-theme-bg-color, #0f0f1a)",
      color: "#fff",
      fontFamily: "'Inter', sans-serif",
      padding: "16px",
      maxWidth: 420,
      margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>👁 Live Match</div>
          <div style={{ fontSize: 11, opacity: 0.4 }}>Spectating · updates every 2s</div>
        </div>
      </div>

      {error ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#f87171", background: "rgba(248,113,113,0.08)", borderRadius: 16 }}>{error}</div>
      ) : !match ? (
        <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.4 }}>Loading match…</div>
      ) : (
        <>
          {/* Match info */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{MODE_EMOJI[match.gameMode]} {MODE_LABEL[match.gameMode]}</div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>Match ID: <span style={{ fontFamily: "monospace", color: "#a78bfa" }}>{match.id}</span></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa" }}>{match.betAmount} BSA</div>
              <div style={{ fontSize: 11, opacity: 0.4 }}>each</div>
            </div>
          </div>

          {/* Status banner */}
          <div style={{
            textAlign: "center", padding: "10px 16px", borderRadius: 10, marginBottom: 16,
            background: match.status === "waiting" ? "rgba(255,169,64,0.1)"
              : match.status === "playing" ? "rgba(0,152,234,0.1)"
              : match.status === "finished" ? "rgba(57,198,136,0.1)"
              : "rgba(255,92,50,0.1)",
            border: `1px solid ${match.status === "waiting" ? "rgba(255,169,64,0.3)"
              : match.status === "playing" ? "rgba(0,152,234,0.3)"
              : match.status === "finished" ? "rgba(57,198,136,0.3)"
              : "rgba(255,92,50,0.3)"}`,
            fontSize: 13, fontWeight: 600,
          }}>
            {match.status === "waiting" && "⏳ Waiting for Player 2 to join…"}
            {match.status === "playing" && (
              match.player1?.finished && !match.player2?.finished ? "⚔️ Player 1 done — waiting for Player 2…"
              : !match.player1?.finished && match.player2?.finished ? "⚔️ Player 2 done — waiting for Player 1…"
              : "⚔️ Both players are competing!"
            )}
            {match.status === "finished" && (isTie ? "🤝 It's a Tie!" : `🏆 ${p1wins ? (usernames.p1 ?? "Player 1") : (usernames.p2 ?? "Player 2")} wins ${prizeDisplay} BSA!`)}
            {match.status === "expired" && "⌛ Match expired"}
          </div>

          {/* Player cards */}
          {(match.player1 || match.status !== "waiting") && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <PlayerCard
                label="Player 1"
                addr={match.player1?.address ?? "—"}
                username={usernames.p1}
                score={match.player1?.score ?? null}
                finished={match.player1?.finished ?? false}
                isWinner={p1wins}
                isTie={isTie ?? false}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, opacity: 0.4, flexShrink: 0 }}>VS</div>
              <PlayerCard
                label="Player 2"
                addr={match.player2?.address ?? "TBD"}
                username={usernames.p2}
                score={match.player2?.score ?? null}
                finished={match.player2?.finished ?? false}
                isWinner={p2wins}
                isTie={isTie ?? false}
              />
            </div>
          )}

          {/* Payout info */}
          {isFinished && !isTie && match.payoutTxHash && (
            <div style={{ background: "rgba(57,198,136,0.07)", border: "1px solid rgba(57,198,136,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>Prize paid on-chain</div>
              <div style={{ fontWeight: 700, fontSize: 20, color: "#39C688" }}>{prizeDisplay} BSA USD</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.35, marginTop: 4, wordBreak: "break-all" }}>
                tx: {match.payoutTxHash.slice(0, 30)}…
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", fontSize: 11, opacity: 0.3, marginTop: 8 }}>
            Last updated: {lastUpdate?.toLocaleTimeString()}
          </div>
        </>
      )}
    </main>
  );
}
