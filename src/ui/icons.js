// Procedurally painted item icons (cached data URLs), so no image assets are needed.
import { ITEMS } from '../data/items.js';

const cache = new Map();
const SIZE = 64;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const P = {
  log(x, c, c2) {
    x.fillStyle = c; x.save(); x.translate(32, 32); x.rotate(-0.5);
    x.fillRect(-22, -9, 44, 18); x.fillStyle = c2; x.beginPath(); x.ellipse(22, 0, 6, 9, 0, 0, 7); x.fill();
    x.strokeStyle = shade(c, 0.6); x.beginPath(); x.ellipse(22, 0, 3, 5, 0, 0, 7); x.stroke(); x.restore();
  },
  thatch(x, c, c2) {
    x.lineWidth = 2.5;
    for (let i = 0; i < 14; i++) { x.strokeStyle = i % 2 ? c : c2; x.beginPath(); x.moveTo(14 + i * 2.6, 54); x.lineTo(22 + i * 1.8, 10 + (i % 3) * 3); x.stroke(); }
    x.fillStyle = shade(c, 0.6); x.fillRect(16, 34, 34, 5);
  },
  stone(x, c, c2) {
    x.fillStyle = c; x.beginPath(); x.moveTo(12, 44); x.lineTo(20, 20); x.lineTo(42, 14); x.lineTo(54, 30); x.lineTo(48, 50); x.lineTo(24, 54); x.closePath(); x.fill();
    x.fillStyle = c2; x.beginPath(); x.moveTo(20, 20); x.lineTo(42, 14); x.lineTo(40, 26); x.lineTo(24, 30); x.closePath(); x.fill();
  },
  flint(x, c, c2) {
    x.fillStyle = c; x.beginPath(); x.moveTo(16, 50); x.lineTo(28, 12); x.lineTo(48, 22); x.lineTo(40, 52); x.closePath(); x.fill();
    x.fillStyle = c2; x.beginPath(); x.moveTo(28, 12); x.lineTo(48, 22); x.lineTo(34, 30); x.closePath(); x.fill();
  },
  fiber(x, c, c2) {
    x.lineWidth = 2;
    for (let i = 0; i < 9; i++) { x.strokeStyle = i % 2 ? c : c2; x.beginPath(); x.moveTo(32, 54); x.quadraticCurveTo(10 + i * 6, 30, 8 + i * 6, 10); x.stroke(); }
  },
  hide(x, c, c2) {
    x.fillStyle = c; x.beginPath(); x.moveTo(14, 16); x.lineTo(26, 20); x.lineTo(38, 14); x.lineTo(50, 18); x.lineTo(48, 34); x.lineTo(54, 48); x.lineTo(36, 50); x.lineTo(30, 56); x.lineTo(20, 48); x.lineTo(10, 46); x.lineTo(16, 32); x.closePath(); x.fill();
    x.fillStyle = c2; x.globalAlpha = 0.5; x.fillRect(22, 26, 18, 14); x.globalAlpha = 1;
  },
  ore(x, c, c2) { P.stone(x, c, shade(c, 1.2)); x.fillStyle = c2; for (const [a, b] of [[24, 30], [38, 24], [34, 42], [44, 36]]) { x.beginPath(); x.arc(a, b, 3.5, 0, 7); x.fill(); } },
  ingot(x, c, c2) {
    x.fillStyle = shade(c, 0.7); x.beginPath(); x.moveTo(8, 40); x.lineTo(20, 26); x.lineTo(56, 26); x.lineTo(44, 40); x.closePath(); x.fill();
    x.fillStyle = c; x.fillRect(8, 40, 36, 10); x.fillStyle = c2; x.beginPath(); x.moveTo(8, 40); x.lineTo(20, 26); x.lineTo(56, 26); x.lineTo(44, 40); x.closePath(); x.globalAlpha = 0.5; x.fill(); x.globalAlpha = 1;
  },
  crystal(x, c, c2) {
    for (const [cx, h, w] of [[24, 36, 9], [34, 46, 10], [44, 30, 8]]) {
      x.fillStyle = c; x.beginPath(); x.moveTo(cx - w, 54); x.lineTo(cx - w, 54 - h + 10); x.lineTo(cx, 54 - h); x.lineTo(cx + w, 54 - h + 10); x.lineTo(cx + w, 54); x.closePath(); x.fill();
      x.fillStyle = c2; x.globalAlpha = 0.45; x.fillRect(cx - w + 2, 54 - h + 10, w * 0.6, h - 12); x.globalAlpha = 1;
    }
  },
  drop(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(32, 8); x.quadraticCurveTo(54, 38, 32, 56); x.quadraticCurveTo(10, 38, 32, 8); x.fill(); x.fillStyle = c2; x.beginPath(); x.arc(26, 38, 4, 0, 7); x.fill(); },
  pearl(x, c, c2) { for (const [a, b] of [[22, 36], [38, 30], [32, 46], [44, 44]]) { const g = x.createRadialGradient(a - 2, b - 2, 1, a, b, 8); g.addColorStop(0, c2); g.addColorStop(1, c); x.fillStyle = g; x.beginPath(); x.arc(a, b, 7, 0, 7); x.fill(); } },
  shell(x, c, c2) { x.fillStyle = c; x.beginPath(); x.ellipse(32, 34, 22, 16, -0.3, 0, 7); x.fill(); x.strokeStyle = c2; x.lineWidth = 2; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(32, 34, 20 - i * 5, 14 - i * 3.5, -0.3, 3.4, 6); x.stroke(); } },
  powder(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(10, 52); x.quadraticCurveTo(32, 10, 54, 52); x.closePath(); x.fill(); x.fillStyle = c2; for (let i = 0; i < 12; i++) x.fillRect(16 + Math.random() * 30, 26 + Math.random() * 24, 2, 2); },
  paste(x, c, c2) { x.fillStyle = shade(c, 0.6); x.fillRect(14, 30, 36, 22); x.fillStyle = c; x.beginPath(); x.ellipse(32, 30, 18, 8, 0, 0, 7); x.fill(); x.fillStyle = c2; x.beginPath(); x.ellipse(32, 28, 12, 4, 0, 0, 7); x.fill(); },
  berry(x, c, c2) {
    x.strokeStyle = '#3a6a24'; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 10); x.lineTo(32, 22); x.stroke();
    for (const [a, b] of [[24, 30], [40, 30], [32, 42], [22, 44], [42, 44], [32, 28]]) { const g = x.createRadialGradient(a - 2, b - 2, 1, a, b, 8); g.addColorStop(0, c2); g.addColorStop(1, c); x.fillStyle = g; x.beginPath(); x.arc(a, b, 7, 0, 7); x.fill(); }
  },
  meat(x, c, c2) {
    x.fillStyle = c; x.beginPath(); x.ellipse(30, 34, 20, 15, -0.4, 0, 7); x.fill(); x.fillStyle = c2; x.beginPath(); x.ellipse(26, 30, 9, 6, -0.4, 0, 7); x.fill();
    x.fillStyle = '#eee8d8'; x.fillRect(44, 18, 12, 6); x.beginPath(); x.arc(56, 18, 4, 0, 7); x.arc(56, 24, 4, 0, 7); x.fill();
  },
  vial(x, c, c2) { x.fillStyle = '#ccd8e0'; x.fillRect(26, 10, 12, 8); x.fillStyle = c; x.beginPath(); x.moveTo(22, 18); x.lineTo(42, 18); x.lineTo(48, 52); x.lineTo(16, 52); x.closePath(); x.fill(); x.fillStyle = c2; x.globalAlpha = 0.6; x.fillRect(22, 34, 6, 14); x.globalAlpha = 1; },
  implant(x, c, c2) { x.fillStyle = c; x.fillRect(16, 22, 32, 20); x.fillStyle = c2; x.fillRect(22, 28, 20, 8); x.fillStyle = shade(c2, 0.6); x.fillRect(30, 18, 4, 28); },
  waterskin(x, c, c2) { x.fillStyle = c; x.beginPath(); x.ellipse(32, 38, 16, 18, 0, 0, 7); x.fill(); x.fillRect(28, 10, 8, 12); x.fillStyle = c2; x.globalAlpha = 0.5; x.beginPath(); x.ellipse(32, 42, 10, 10, 0, 0, 7); x.fill(); x.globalAlpha = 1; },
  spyglass(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(-0.6); x.fillStyle = c2; x.fillRect(-24, -6, 22, 12); x.fillStyle = c; x.fillRect(-4, -8, 28, 16); x.restore(); },
  compass(x, c, c2) { x.fillStyle = c; x.beginPath(); x.arc(32, 32, 20, 0, 7); x.fill(); x.fillStyle = '#f0f0e0'; x.beginPath(); x.arc(32, 32, 16, 0, 7); x.fill(); x.fillStyle = c2; x.beginPath(); x.moveTo(32, 18); x.lineTo(36, 32); x.lineTo(28, 32); x.fill(); x.fillStyle = '#333'; x.beginPath(); x.moveTo(32, 46); x.lineTo(36, 32); x.lineTo(28, 32); x.fill(); },
  gps(x, c, c2) { x.fillStyle = c; x.fillRect(18, 10, 28, 44); x.fillStyle = c2; x.fillRect(22, 16, 20, 18); x.fillStyle = '#888'; x.fillRect(22, 40, 8, 8); x.fillRect(34, 40, 8, 8); },
  pick(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.6); x.fillStyle = c; x.fillRect(-3, -6, 6, 34); x.fillStyle = c2; x.beginPath(); x.moveTo(-24, -10); x.quadraticCurveTo(0, -20, 24, -10); x.lineTo(20, -4); x.quadraticCurveTo(0, -12, -20, -4); x.closePath(); x.fill(); x.restore(); },
  hatchet(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.5); x.fillStyle = c; x.fillRect(-3, -14, 6, 40); x.fillStyle = c2; x.beginPath(); x.moveTo(2, -18); x.lineTo(18, -22); x.lineTo(20, -2); x.lineTo(2, -6); x.closePath(); x.fill(); x.restore(); },
  spear(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.78); x.fillStyle = c; x.fillRect(-2, -20, 4, 48); x.fillStyle = c2; x.beginPath(); x.moveTo(0, -30); x.lineTo(6, -18); x.lineTo(-6, -18); x.closePath(); x.fill(); x.restore(); },
  torch(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.5); x.fillStyle = c; x.fillRect(-3, -8, 6, 34); x.fillStyle = '#333'; x.fillRect(-5, -14, 10, 8); x.fillStyle = c2; x.beginPath(); x.moveTo(0, -30); x.quadraticCurveTo(10, -16, 0, -14); x.quadraticCurveTo(-10, -16, 0, -30); x.fill(); x.restore(); },
  club(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.6); x.fillStyle = c; x.fillRect(-3, 0, 6, 26); x.fillStyle = c2; x.beginPath(); x.ellipse(0, -10, 8, 16, 0, 0, 7); x.fill(); x.restore(); },
  sling(x, c, c2) { x.strokeStyle = c; x.lineWidth = 5; x.beginPath(); x.moveTo(32, 56); x.lineTo(32, 36); x.lineTo(20, 14); x.moveTo(32, 36); x.lineTo(44, 14); x.stroke(); x.strokeStyle = c2; x.lineWidth = 2; x.beginPath(); x.moveTo(20, 14); x.quadraticCurveTo(32, 30, 44, 14); x.stroke(); },
  bow(x, c, c2) { x.strokeStyle = c; x.lineWidth = 4; x.beginPath(); x.arc(14, 32, 26, -1.1, 1.1); x.stroke(); x.strokeStyle = c2; x.lineWidth = 1.5; x.beginPath(); x.moveTo(26, 9); x.lineTo(26, 55); x.stroke(); },
  arrow(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.78); x.fillStyle = c; x.fillRect(-1.5, -22, 3, 46); x.fillStyle = c2; x.beginPath(); x.moveTo(0, -30); x.lineTo(5, -20); x.lineTo(-5, -20); x.closePath(); x.fill(); x.fillStyle = '#ddd'; x.fillRect(-5, 18, 10, 6); x.restore(); },
  pistol(x, c, c2) { x.fillStyle = c2; x.fillRect(14, 20, 38, 9); x.fillStyle = c; x.save(); x.translate(22, 30); x.rotate(0.3); x.fillRect(-5, 0, 11, 22); x.restore(); },
  rifle(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(-0.5); x.fillStyle = c2; x.fillRect(-28, -3, 44, 5); x.fillStyle = c; x.fillRect(8, -5, 22, 10); x.restore(); },
  bullet(x, c, c2) { for (let i = 0; i < 3; i++) { x.fillStyle = c2; x.fillRect(16 + i * 12, 26, 9, 22); x.fillStyle = c; x.beginPath(); x.arc(20.5 + i * 12, 26, 4.5, Math.PI, 0); x.fill(); } },
  sword(x, c, c2) { x.save(); x.translate(32, 32); x.rotate(0.78); x.fillStyle = c2; x.beginPath(); x.moveTo(0, -30); x.lineTo(4, -24); x.lineTo(4, 12); x.lineTo(-4, 12); x.lineTo(-4, -24); x.closePath(); x.fill(); x.fillStyle = c; x.fillRect(-10, 12, 20, 4); x.fillRect(-3, 16, 6, 12); x.restore(); },
  hat(x, c, c2) { x.fillStyle = c; x.beginPath(); x.ellipse(32, 42, 24, 7, 0, 0, 7); x.fill(); x.beginPath(); x.arc(32, 38, 15, Math.PI, 0); x.fill(); x.fillStyle = c2; x.fillRect(18, 34, 28, 4); },
  shirt(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(20, 12); x.lineTo(44, 12); x.lineTo(56, 24); x.lineTo(48, 30); x.lineTo(46, 54); x.lineTo(18, 54); x.lineTo(16, 30); x.lineTo(8, 24); x.closePath(); x.fill(); x.fillStyle = c2; x.fillRect(28, 12, 8, 6); },
  pants(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(18, 10); x.lineTo(46, 10); x.lineTo(48, 56); x.lineTo(36, 56); x.lineTo(32, 26); x.lineTo(28, 56); x.lineTo(16, 56); x.closePath(); x.fill(); x.fillStyle = c2; x.fillRect(18, 10, 28, 5); },
  gloves(x, c, c2) { x.fillStyle = c; x.fillRect(20, 28, 24, 26); for (let i = 0; i < 4; i++) x.fillRect(20 + i * 6.5, 12 + (i === 0 ? 8 : 0), 5, 18); x.fillStyle = c2; x.fillRect(20, 48, 24, 6); },
  boots(x, c, c2) { x.fillStyle = c; x.fillRect(22, 10, 16, 34); x.fillRect(22, 38, 30, 14); x.fillStyle = c2; x.fillRect(22, 50, 30, 4); },
  foundation(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(8, 30); x.lineTo(32, 18); x.lineTo(56, 30); x.lineTo(32, 42); x.closePath(); x.fill(); x.fillStyle = shade(c, 0.6); x.beginPath(); x.moveTo(8, 30); x.lineTo(32, 42); x.lineTo(32, 50); x.lineTo(8, 38); x.closePath(); x.fill(); x.fillStyle = shade(c, 0.8); x.beginPath(); x.moveTo(32, 42); x.lineTo(56, 30); x.lineTo(56, 38); x.lineTo(32, 50); x.closePath(); x.fill(); },
  wall(x, c, c2) { x.fillStyle = c; x.fillRect(12, 12, 40, 40); x.strokeStyle = shade(c, 0.6); x.lineWidth = 2; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(12 + i * 8, 12); x.lineTo(12 + i * 8, 52); x.stroke(); } },
  doorframe(x, c, c2) { P.wall(x, c, c2); x.clearRect(26, 26, 12, 26); },
  door(x, c, c2) { x.fillStyle = c; x.fillRect(20, 10, 24, 44); x.fillStyle = c2; x.beginPath(); x.arc(38, 34, 2.5, 0, 7); x.fill(); },
  ceiling(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(8, 34); x.lineTo(32, 22); x.lineTo(56, 34); x.lineTo(32, 46); x.closePath(); x.fill(); x.fillStyle = shade(c, 0.6); x.fillRect(8, 34, 48, 3); },
  ramp(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(8, 52); x.lineTo(56, 14); x.lineTo(56, 52); x.closePath(); x.fill(); },
  campfire(x, c, c2) { x.fillStyle = '#6a4a2a'; x.save(); x.translate(32, 46); x.rotate(0.4); x.fillRect(-18, -3, 36, 6); x.rotate(-0.8); x.fillRect(-18, -3, 36, 6); x.restore(); x.fillStyle = c2; x.beginPath(); x.moveTo(32, 14); x.quadraticCurveTo(46, 36, 32, 44); x.quadraticCurveTo(18, 36, 32, 14); x.fill(); x.fillStyle = '#ffe080'; x.beginPath(); x.moveTo(32, 26); x.quadraticCurveTo(38, 38, 32, 42); x.quadraticCurveTo(26, 38, 32, 26); x.fill(); },
  box(x, c, c2) { x.fillStyle = c; x.fillRect(12, 24, 40, 28); x.fillStyle = c2; x.fillRect(10, 20, 44, 7); x.fillStyle = '#222'; x.fillRect(29, 28, 6, 6); },
  bag(x, c, c2) { x.fillStyle = c2; x.beginPath(); x.ellipse(32, 36, 24, 12, -0.2, 0, 7); x.fill(); x.fillStyle = c; x.beginPath(); x.ellipse(16, 32, 8, 6, -0.2, 0, 7); x.fill(); },
  bed(x, c, c2) { x.fillStyle = c; x.fillRect(8, 36, 48, 10); x.fillRect(8, 22, 6, 28); x.fillStyle = c2; x.fillRect(14, 30, 42, 8); x.fillStyle = '#e8e0d0'; x.fillRect(14, 28, 10, 6); },
  mortar(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(12, 30); x.lineTo(52, 30); x.lineTo(44, 52); x.lineTo(20, 52); x.closePath(); x.fill(); x.fillStyle = '#8a6a44'; x.save(); x.translate(38, 22); x.rotate(0.5); x.fillRect(-3, -14, 6, 24); x.restore(); },
  forge(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(16, 54); x.lineTo(20, 14); x.lineTo(44, 14); x.lineTo(48, 54); x.closePath(); x.fill(); x.fillStyle = c2; x.fillRect(26, 36, 12, 10); },
  smithy(x, c, c2) { x.fillStyle = c; x.fillRect(8, 30, 48, 6); x.fillRect(12, 36, 5, 18); x.fillRect(47, 36, 5, 18); x.fillStyle = c2; x.fillRect(20, 20, 20, 10); x.fillRect(14, 22, 8, 5); },
  saddle(x, c, c2) { x.fillStyle = c; x.beginPath(); x.moveTo(10, 30); x.quadraticCurveTo(32, 46, 54, 30); x.lineTo(50, 44); x.quadraticCurveTo(32, 56, 14, 44); x.closePath(); x.fill(); x.fillStyle = c2; x.fillRect(16, 20, 8, 14); x.fillRect(40, 22, 8, 12); x.strokeStyle = '#3a2a1a'; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 44); x.lineTo(32, 58); x.stroke(); },
};

export function iconURL(id) {
  if (cache.has(id)) return cache.get(id);
  const def = ITEMS[id];
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = SIZE;
  const ctx = cvs.getContext('2d');
  const ic = (def && def.icon) || { shape: 'stone', c: '#888', c2: '#aaa' };
  const fn = P[ic.shape] || P.stone;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  fn(ctx, ic.c, ic.c2);
  ctx.restore();
  const url = cvs.toDataURL();
  cache.set(id, url);
  return url;
}
