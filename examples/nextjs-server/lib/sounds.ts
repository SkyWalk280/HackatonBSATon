// Web Audio API sound synthesis — no asset files needed
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  freq: number,
  type: OscillatorType,
  duration: number,
  gainStart: number,
  gainEnd: number,
  startAt = 0,
) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + startAt);
  gain.gain.setValueAtTime(gainStart, c.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(gainEnd, 0.0001),
    c.currentTime + startAt + duration,
  );
  osc.start(c.currentTime + startAt);
  osc.stop(c.currentTime + startAt + duration + 0.01);
}

export const sounds = {
  /** Block lands on stack */
  thud() {
    tone(110, "sine", 0.07, 0.35, 0.01);
    tone(75, "sine", 0.12, 0.2, 0.01, 0.02);
  },
  /** Tile tap / target hit */
  ding() {
    tone(880, "sine", 0.08, 0.18, 0.01);
    tone(1320, "sine", 0.06, 0.12, 0.01, 0.07);
  },
  /** Wrong tile / miss */
  error() {
    tone(220, "sawtooth", 0.12, 0.22, 0.01);
    tone(165, "sawtooth", 0.16, 0.18, 0.01, 0.08);
  },
  /** Buzzer — reaction time miss / game over */
  buzzer() {
    tone(175, "square", 0.22, 0.28, 0.01);
  },
  /** Victory jingle — 4 ascending notes */
  victory() {
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((f, i) => tone(f, "sine", 0.22, 0.22, 0.01, i * 0.13));
  },
};
