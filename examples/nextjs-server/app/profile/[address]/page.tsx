"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { resolveTonName } from "../../../lib/tonDns";

const MODE_EMOJI: Record<string, string> = { stack: "🧱", memory: "🧠", reaction: "⚡" };
const MODE_LABEL: Record<string, string> = { stack: "Stack Duel", memory: "Memory Grid", reaction: "Reaction Time" };

interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  totalEarningsNano: number;
  gameModeCounts: { stack: number; memory: number; reaction: number };
  bestScores: { stack: number; memory: number; reaction: number };
}

function shortAddr(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      padding: "14px 10px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", opacity: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "monospace", color: "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, opacity: 0.35 }}>{sub}</div>}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { address } = useParams<{ address: string }>();
  const decoded = decodeURIComponent(address);

  const [username, setUsername] = useState<string | null>(null);
  const [tonName, setTonName] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/profile/stats?address=${encodeURIComponent(decoded)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setUsername(data.username ?? null);
        setStats(data.stats);
        // Resolve .ton DNS name as fallback
        if (!data.username) {
          resolveTonName(decoded).then(name => { if (name) setTonName(name); }).catch(() => {});
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [decoded]);

  const winRate = stats && stats.matchesPlayed > 0
    ? Math.round((stats.wins / stats.matchesPlayed) * 100)
    : null;

  const favMode = stats
    ? (Object.entries(stats.gameModeCounts) as [string, number][])
        .sort((a, b) => b[1] - a[1])
        .find(([, count]) => count > 0)?.[0] ?? null
    : null;

  const totalEarnings = stats
    ? (stats.totalEarningsNano / 1_000_000_000).toFixed(3)
    : "0.000";

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ fontSize: 18, fontWeight: 700 }}>👤 Player Profile</div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.4 }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#f87171", background: "rgba(248,113,113,0.08)", borderRadius: 16 }}>{error}</div>
      ) : (
        <>
          {/* Identity card */}
          <div style={{
            background: "linear-gradient(135deg, rgba(108,99,255,0.15), rgba(168,85,247,0.08))",
            border: "1px solid rgba(108,99,255,0.25)",
            borderRadius: 18,
            padding: "20px 18px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "linear-gradient(135deg, #6c63ff, #a855f7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, flexShrink: 0,
            }}>
              {username ? username[0].toUpperCase() : "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>
                {username ?? tonName ?? "Anonymous"}
              </div>
              <div style={{ fontSize: 11, fontFamily: "monospace", opacity: 0.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortAddr(decoded)}
              </div>
              {winRate !== null && (
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 11, background: "rgba(57,198,136,0.15)", border: "1px solid rgba(57,198,136,0.3)", borderRadius: 6, padding: "2px 7px", color: "#39C688", fontWeight: 600 }}>
                    {winRate}% win rate
                  </span>
                  {favMode && (
                    <span style={{ fontSize: 11, background: "rgba(108,99,255,0.15)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 6, padding: "2px 7px", color: "#a78bfa", fontWeight: 600 }}>
                      {MODE_EMOJI[favMode]} {MODE_LABEL[favMode]}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stats grid */}
          {stats && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Overall Stats</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
                <StatBox label="Played" value={stats.matchesPlayed} />
                <StatBox label="Wins" value={stats.wins} />
                <StatBox label="Losses" value={stats.losses} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
                <StatBox label="Ties" value={stats.ties} />
                <StatBox label="Earnings" value={`${totalEarnings}`} sub="BSA USD total" />
              </div>

              {/* Per-mode breakdown */}
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>By Game Mode</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {(["stack", "memory", "reaction"] as const).map(mode => {
                  const count = stats.gameModeCounts[mode] ?? 0;
                  const best = stats.bestScores[mode] ?? 0;
                  return (
                    <div key={mode} style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 12,
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: "rgba(108,99,255,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 22, flexShrink: 0,
                      }}>
                        {MODE_EMOJI[mode]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{MODE_LABEL[mode]}</div>
                        <div style={{ fontSize: 12, opacity: 0.45, marginTop: 2 }}>
                          {count} match{count !== 1 ? "es" : ""} played
                        </div>
                      </div>
                      {best > 0 && (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 10, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Best</div>
                          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: "#a78bfa" }}>{best}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {stats.matchesPlayed === 0 && (
                <div style={{ textAlign: "center", padding: "20px", opacity: 0.4, fontSize: 13 }}>
                  No matches played yet
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
