"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTonWallet } from "@tonconnect/ui-react";

interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string | null;
  wins: number;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const wallet = useTonWallet();
  const walletAddress = wallet?.account?.address ?? null;

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Username edit state
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function fetchLeaderboard() {
    try {
      const r = await fetch("/api/leaderboard");
      const data = await r.json();
      setEntries(data.entries ?? []);
      if (data.error) setError(data.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyUsername() {
    if (!walletAddress) return;
    try {
      const r = await fetch(`/api/profile/username?address=${encodeURIComponent(walletAddress)}`);
      const data = await r.json();
      setMyUsername(data.username ?? null);
      setEditValue(data.username ?? "");
    } catch {}
  }

  useEffect(() => { fetchLeaderboard(); }, []);
  useEffect(() => { fetchMyUsername(); }, [walletAddress]);

  async function saveUsername() {
    if (!walletAddress) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch("/api/profile/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, username: editValue }),
      });
      const data = await r.json();
      if (data.error) { setSaveError(data.error); return; }
      setMyUsername(data.username);
      setEditMode(false);
      // Refresh leaderboard to show new name
      fetchLeaderboard();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const myEntry = entries.find(e =>
    walletAddress && e.address.toLowerCase() === walletAddress.toLowerCase()
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--tg-theme-bg-color, #0f0f1a)",
        color: "var(--tg-theme-text-color, #fff)",
        fontFamily: "'Inter', sans-serif",
        padding: "16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button
          onClick={() => router.push("/")}
          style={{ background: "none", border: "none", color: "inherit", fontSize: "20px", cursor: "pointer", padding: "4px", lineHeight: 1 }}
        >
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>🏆 Leaderboard</h1>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.5 }}>Top players by wins</p>
        </div>
      </div>

      {/* Username card */}
      {walletAddress && (
        <div
          style={{
            background: "rgba(108,99,255,0.1)",
            border: "1px solid rgba(108,99,255,0.25)",
            borderRadius: "14px",
            padding: "14px 16px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "11px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
            Your display name
          </div>
          {editMode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                maxLength={20}
                placeholder="Enter a display name…"
                autoFocus
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(108,99,255,0.4)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "9px 12px",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              {saveError && <div style={{ fontSize: "12px", color: "#f87171" }}>⚠ {saveError}</div>}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveUsername}
                  disabled={saving || editValue.trim().length < 2}
                  style={{
                    flex: 1, padding: "9px", background: "linear-gradient(135deg,#6c63ff,#a855f7)",
                    border: "none", borderRadius: "8px", color: "#fff", fontSize: "14px",
                    fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => { setEditMode(false); setEditValue(myUsername ?? ""); setSaveError(null); }}
                  style={{
                    padding: "9px 16px", background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px",
                    color: "rgba(255,255,255,0.6)", fontSize: "14px", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "16px", fontWeight: 600, color: myUsername ? "#fff" : "rgba(255,255,255,0.3)" }}>
                {myUsername ?? "Not set"}
              </span>
              <button
                onClick={() => setEditMode(true)}
                style={{
                  background: "rgba(108,99,255,0.2)", border: "1px solid rgba(108,99,255,0.3)",
                  borderRadius: "8px", color: "#a78bfa", fontSize: "13px", fontWeight: 600,
                  padding: "6px 12px", cursor: "pointer",
                }}
              >
                {myUsername ? "✏️ Edit" : "✏️ Set name"}
              </button>
            </div>
          )}
          {myEntry && !myUsername && (
            <div style={{ fontSize: "12px", color: "#fbbf24", marginTop: "8px" }}>
              ⭐ You're on the leaderboard! Set a name so others can recognise you.
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.5 }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#f87171", background: "rgba(248,113,113,0.08)", borderRadius: "16px", fontSize: "14px" }}>
          Failed to load: {error}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "rgba(255,255,255,0.04)", borderRadius: "16px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎮</div>
          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>No wins recorded yet</div>
          <div style={{ fontSize: "13px", opacity: 0.5, marginBottom: "24px" }}>Play a match to appear here</div>
          <button
            onClick={() => router.push("/")}
            style={{ background: "linear-gradient(135deg,#6c63ff,#a855f7)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 600, padding: "12px 28px", cursor: "pointer" }}
          >
            Play Now
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {entries.map((entry) => {
            const isTop3 = entry.rank <= 3;
            const isMe = walletAddress && entry.address.toLowerCase() === walletAddress.toLowerCase();
            const displayName = entry.username ?? shortAddress(entry.address);
            return (
              <div
                key={entry.rank}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  background: isMe
                    ? "rgba(251,191,36,0.08)"
                    : isTop3
                    ? "rgba(108,99,255,0.12)"
                    : "rgba(255,255,255,0.04)",
                  border: isMe
                    ? "1px solid rgba(251,191,36,0.3)"
                    : isTop3
                    ? "1px solid rgba(108,99,255,0.3)"
                    : "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "14px",
                  padding: "14px 16px",
                }}
              >
                {/* Rank */}
                <div style={{ width: "36px", textAlign: "center", fontSize: isTop3 ? "24px" : "16px", fontWeight: 700, color: isTop3 ? "#fff" : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                  {MEDAL[entry.rank] ?? `#${entry.rank}`}
                </div>

                {/* Name + address */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName}
                    {isMe && <span style={{ fontSize: "11px", color: "#fbbf24", marginLeft: "6px" }}>you</span>}
                  </div>
                  {entry.username && (
                    <div style={{ fontSize: "11px", opacity: 0.35, fontFamily: "monospace", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortAddress(entry.address)}
                    </div>
                  )}
                </div>

                {/* Wins badge */}
                <div style={{
                  flexShrink: 0,
                  background: isTop3 ? "linear-gradient(135deg,#6c63ff,#a855f7)" : "rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  padding: "4px 10px",
                  fontSize: "14px",
                  fontWeight: 700,
                }}>
                  {entry.wins} {entry.wins === 1 ? "win" : "wins"}
                </div>
              </div>
            );
          })}
          <div style={{ textAlign: "center", fontSize: "12px", opacity: 0.3, paddingTop: "8px" }}>
            Updated after every match
          </div>
        </div>
      )}
    </main>
  );
}
