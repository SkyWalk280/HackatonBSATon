"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MODES = [
  {
    value: "stack" as const,
    emoji: "🧱",
    label: "Stack Duel",
    desc: "Tap to drop a block onto the stack. Only the overlapping part stays. Stack as high as you can — speed increases every 5 blocks.",
    color: "#0098EA",
    page: "/game",
  },
  {
    value: "memory" as const,
    emoji: "🧠",
    label: "Memory Grid",
    desc: "Watch the 3×3 tile grid flash a sequence, then tap them back in the exact same order. Each round adds one more tile.",
    color: "#a855f7",
    page: "/memory",
  },
  {
    value: "reaction" as const,
    emoji: "⚡",
    label: "Reaction Time",
    desc: "A glowing circle appears at a random position after a random delay. Tap it as fast as you can. 8 rounds — lower average time wins.",
    color: "#facc15",
    page: "/reaction",
  },
];

export default function PracticePage() {
  const router = useRouter();
  const [pbs, setPbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const m of MODES) {
      const val = localStorage.getItem(`pb:practice:${m.value}`);
      if (val !== null) loaded[m.value] = val;
    }
    setPbs(loaded);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 16 }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>

        <button
          onClick={() => router.push("/")}
          style={{
            background: "none", border: "none",
            color: "var(--text-secondary)", fontSize: 14,
            cursor: "pointer", padding: "12px 0", marginBottom: 4,
          }}
        >
          ← Back to Lobby
        </button>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)" }}>
            🎯 Practice Mode
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.55 }}>
            Play free — no wallet, no bet, no opponent. Learn the games and sharpen your skills before risking real BSA USD.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {MODES.map(m => {
            const pb = pbs[m.value];
            const pbLabel = pb !== undefined
              ? (m.value === "reaction" ? `Best: ${pb}ms` : `Best: ${pb}`)
              : "No attempts yet";

            return (
              <div
                key={m.value}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "18px 20px",
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  flexShrink: 0,
                  background: `${m.color}18`,
                  border: `1px solid ${m.color}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}>
                  {m.emoji}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 4 }}>
                    {m.desc}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: pb !== undefined ? "var(--ton-blue)" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {pb !== undefined ? `🏅 ${pbLabel}` : pbLabel}
                  </div>
                </div>

                <button
                  onClick={() => router.push(`${m.page}?practice=true`)}
                  style={{
                    padding: "10px 18px",
                    background: "var(--ton-blue)",
                    border: "none",
                    borderRadius: 10,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  Play
                </button>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 20,
          padding: "14px 16px",
          background: "rgba(57,198,136,0.06)",
          border: "1px solid rgba(57,198,136,0.2)",
          borderRadius: 12,
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}>
          💡 <strong style={{ color: "var(--text-primary)" }}>Tip:</strong> Your personal best for each mode is saved on this device. Once you feel confident, hit <strong style={{ color: "var(--text-primary)" }}>Play for Real</strong> from the result screen to jump straight into a bet match.
        </div>

      </div>
    </div>
  );
}
