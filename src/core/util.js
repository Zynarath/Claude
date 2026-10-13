// Small math / random helpers shared across the game.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Wraps an angle into [-PI, PI]
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function approachAngle(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export function weightedPick(entries, r = Math.random()) {
  let total = 0;
  for (const e of entries) total += e.weight;
  let x = r * total;
  for (const e of entries) {
    x -= e.weight;
    if (x <= 0) return e;
  }
  return entries[entries.length - 1];
}

export function formatTime(seconds) {
  seconds = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

let uidCounter = 1;
export function uid() {
  return (uidCounter++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
