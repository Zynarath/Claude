// In-game HUD: status rings, hotbar, notifications, prompts and target info.
import { ITEMS } from '../data/items.js';
import { iconURL } from './icons.js';
import { xpForLevel, MAX_LEVEL } from '../data/engrams.js';
import { toLatLon } from '../world/terrain.js';
import { formatTime } from '../core/util.js';

const $ = (id) => document.getElementById(id);

const ICONS = {
  health: '<svg viewBox="0 0 24 24"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/></svg>',
  stamina: '<svg viewBox="0 0 24 24"><path d="M13 1 4 14h6l-2 9 10-14h-6z"/></svg>',
  oxygen: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="6" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="17" cy="6" r="3.5" fill="none" stroke="#fff" stroke-width="2"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M14 2c4 0 8 4 8 8 0 5-6 7-9 6l-5 5c-1 1-3 0-3-1-1 0-2-2-1-3l5-5c-1-3 1-10 5-10z"/></svg>',
  water: '<svg viewBox="0 0 24 24"><path d="M12 1C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-14z"/></svg>',
  weight: '<svg viewBox="0 0 24 24"><path d="M8 3h8l-1 4h3l3 15H3L6 7h3z"/></svg>',
  torpor: '<svg viewBox="0 0 24 24"><path d="M4 4h9v2l-6 7h6v2H4v-2l6-7H4zM14 13h7v2l-4 5h4v2h-7v-2l4-5h-4z"/></svg>',
};
const STAT_COLORS = { health: '#5aff5a', stamina: '#ffd23a', oxygen: '#5ad8ff', food: '#ff9a3a', water: '#3a9aff', weight: '#c8c8c8', torpor: '#b07aff' };

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.statEls = {};
    const stats = $('stats');
    for (const k of ['torpor', 'health', 'stamina', 'oxygen', 'food', 'water', 'weight']) {
      const el = document.createElement('div');
      el.className = 'stat';
      el.style.color = STAT_COLORS[k];
      el.innerHTML = `<span class="val"></span><div class="ring"><div class="fill"></div>${ICONS[k]}</div>`;
      stats.appendChild(el);
      this.statEls[k] = { el, val: el.querySelector('.val'), fill: el.querySelector('.fill') };
    }
    this.hotbarEls = [];
    const hb = $('hotbar');
    for (let i = 0; i < 10; i++) {
      const el = document.createElement('div');
      el.className = 'hb';
      el.innerHTML = `<span class="k">${(i + 1) % 10}</span><img alt=""><span class="q"></span><div class="dur hidden"><div></div></div>`;
      hb.appendChild(el);
      this.hotbarEls.push({ el, img: el.querySelector('img'), q: el.querySelector('.q'), dur: el.querySelector('.dur'), durFill: el.querySelector('.dur > div'), key: '' });
    }
    this.notifEl = $('notifications');
    this.gainsEl = $('gains');
    this.promptEl = $('prompt');
    this.targetEl = $('target-info');
    this.tameEl = $('tame-info');
    this.lastPrompt = '';
    this.lastTarget = '';
    this.lastTame = '';
    this.gainMap = new Map();
    this.showValues = false;
    this.dmgFx = 0;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  notify(text, type = 'neutral', seconds = 3.5) {
    const n = document.createElement('div');
    n.className = `n ${type}`;
    n.textContent = text;
    this.notifEl.appendChild(n);
    while (this.notifEl.children.length > 4) this.notifEl.firstChild.remove();
    setTimeout(() => n.remove(), seconds * 1000);
  }

  itemGain(id, qty) {
    if (!qty) return;
    const existing = this.gainMap.get(id);
    if (existing && existing.el.isConnected) {
      existing.qty += qty;
      existing.el.querySelector('span').textContent = `${ITEMS[id].name} +${existing.qty}`;
      clearTimeout(existing.t);
      existing.el.classList.remove('out');
      existing.t = setTimeout(() => this.fadeGain(id), 2500);
      return;
    }
    const el = document.createElement('div');
    el.className = 'g';
    el.innerHTML = `<img src="${iconURL(id)}" alt=""><span>${ITEMS[id].name} +${qty}</span>`;
    this.gainsEl.appendChild(el);
    while (this.gainsEl.children.length > 7) this.gainsEl.firstChild.remove();
    const rec = { el, qty, t: setTimeout(() => this.fadeGain(id), 2500) };
    this.gainMap.set(id, rec);
  }

  fadeGain(id) {
    const rec = this.gainMap.get(id);
    if (!rec) return;
    rec.el.classList.add('out');
    setTimeout(() => { rec.el.remove(); if (this.gainMap.get(id) === rec) this.gainMap.delete(id); }, 650);
  }

  setPrompt(html) {
    if (html !== this.lastPrompt) { this.promptEl.innerHTML = html; this.lastPrompt = html; }
  }
  setTarget(html) {
    if (html !== this.lastTarget) { this.targetEl.innerHTML = html; this.lastTarget = html; }
  }
  setTame(html) {
    if (html !== this.lastTame) { this.tameEl.innerHTML = html; this.lastTame = html; }
  }

  damageFlash(amount) {
    this.dmgFx = Math.min(1, this.dmgFx + amount);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.root.classList.toggle('ui-open', g.ui.isOpen());
    this.root.classList.toggle('show-values', g.input.down('KeyH') || this.showValues);
    $('clock').textContent = g.sky.timeString();
    $('clock').classList.toggle('show', g.input.down('KeyH'));
    const pools = {
      health: [p.health, p.maxHealth], stamina: [p.stamina, p.maxStamina], oxygen: [p.oxygen, p.maxOxygen],
      food: [p.food, p.maxFood], water: [p.water, p.maxWater], weight: [p.carried, p.maxWeight], torpor: [p.torpor, p.maxTorpor],
    };
    const rider = p.riding;
    if (rider) {
      pools.health = [rider.hp, rider.hpMax];
      pools.stamina = [rider.stamina, rider.staminaMax];
      pools.weight = [rider.inventory.weight(), rider.weightMax];
    }
    for (const [k, [v, m]] of Object.entries(pools)) {
      const s = this.statEls[k];
      const frac = Math.max(0, Math.min(1, v / m));
      s.fill.style.height = `${(k === 'weight' || k === 'torpor' ? frac : frac) * 100}%`;
      s.val.textContent = `${Math.floor(v)} / ${Math.floor(m)}`;
      const low = k === 'weight' || k === 'torpor' ? frac > 0.95 : frac < 0.15;
      s.el.classList.toggle('low', low);
      if (k === 'oxygen') s.el.style.display = p.oxygen < p.maxOxygen - 0.5 || p.headUnder ? '' : 'none';
      if (k === 'torpor') s.el.style.display = p.torpor > 0.5 ? '' : 'none';
    }
    // status effects
    const fx = [];
    const names = { starving: 'Starving', dehydrated: 'Dehydrated', hungry: 'Hungry', thirsty: 'Thirsty', cold: 'Cold', hot: 'Hot', hypothermia: 'Hypothermia', hyperthermia: 'Hyperthermia', encumbered: 'Encumbered', drowning: 'Drowning', exhausted: 'Exhausted' };
    for (const f of p.statusFlags) fx.push(`<div class="se ${['hungry', 'thirsty', 'cold', 'hot', 'exhausted'].includes(f) ? 'warn' : ''}">${names[f] || f}</div>`);
    if (g.input.down('KeyH')) fx.push(`<div class="se warn">${p.temperature.toFixed(0)}°C</div>`);
    const fxHtml = fx.join('');
    if (fxHtml !== this._fx) { $('status-effects').innerHTML = fxHtml; this._fx = fxHtml; }

    // XP
    const cur = xpForLevel(p.level), next = xpForLevel(Math.min(MAX_LEVEL, p.level + 1));
    const frac = p.level >= MAX_LEVEL ? 1 : Math.min(1, (p.xp - cur) / Math.max(1, next - cur));
    $('xpfill').style.width = `${frac * 100}%`;
    $('xptext').textContent = p.level >= MAX_LEVEL ? `Level ${p.level} (MAX)` : `Level ${p.level}   ${Math.floor(p.xp)} / ${next} XP`;
    $('levelup-hint').classList.toggle('hidden', !p.canLevel);

    // hotbar
    for (let i = 0; i < 10; i++) {
      const h = p.hotbar[i];
      const e = this.hotbarEls[i];
      let stack = null;
      if (h) stack = h.uid ? p.inventory.byUid(h.uid) : p.inventory.find(h.id);
      const id = stack ? stack.id : '';
      const qty = stack ? (h.uid ? (stack.qty > 1 ? stack.qty : '') : p.inventory.count(stack.id)) : '';
      const ammoDef = stack && ITEMS[stack.id].ammo;
      let ammoTxt = '';
      if (ammoDef) {
        const types = Array.isArray(ammoDef) ? ammoDef : [ammoDef];
        ammoTxt = types.reduce((s, t) => s + p.inventory.count(t), 0);
      }
      const key = `${id}|${qty}|${ammoTxt}|${i === p.activeSlot}|${stack && stack.dur !== undefined ? Math.round(stack.dur / stack.maxDur * 20) : ''}`;
      if (key === e.key) continue;
      e.key = key;
      e.el.classList.toggle('active', i === p.activeSlot);
      if (id) { e.img.src = iconURL(id); e.img.style.visibility = 'visible'; } else e.img.style.visibility = 'hidden';
      e.q.textContent = ammoDef ? ammoTxt : qty;
      if (stack && stack.dur !== undefined) {
        e.dur.classList.remove('hidden');
        const f = stack.dur / stack.maxDur;
        e.durFill.style.width = `${f * 100}%`;
        e.durFill.style.background = f < 0.25 ? 'var(--bad)' : 'var(--good)';
      } else e.dur.classList.add('hidden');
    }

    // compass & GPS
    const hasCompass = p.inventory.count('compass') > 0 || p.inventory.count('gps') > 0;
    $('compass').classList.toggle('hidden', !hasCompass);
    if (hasCompass) {
      const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      $('compass').textContent = `${dirs[Math.round(deg / 45) % 8]}  ${deg.toFixed(0)}°`;
    }
    const hasGps = p.inventory.count('gps') > 0;
    $('gps').classList.toggle('hidden', !hasGps);
    if (hasGps) {
      const ll = toLatLon(p.pos.x, p.pos.z);
      $('gps').textContent = `LAT ${ll.lat.toFixed(1)}  LON ${ll.lon.toFixed(1)}`;
    }

    // crafting progress
    const q = p.craftQueue[0];
    const cp = $('craft-progress');
    if (q && !g.ui.isOpen()) {
      cp.classList.remove('hidden');
      const html = `<img src="${iconURL(q.id)}" alt=""><span>${ITEMS[q.id].name}${p.craftQueue.length > 1 ? ` (+${p.craftQueue.length - 1})` : ''}</span><div class="bar"><div style="width:${(1 - q.remaining / q.total) * 100}%"></div></div>`;
      cp.innerHTML = html;
    } else cp.classList.add('hidden');

    // screen effects
    this.dmgFx = Math.max(0, this.dmgFx - dt * 1.5);
    const lowHp = p.health / p.maxHealth < 0.25 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0;
    $('fx-damage').style.opacity = Math.max(this.dmgFx, lowHp);
    $('fx-water').style.opacity = g.cameraUnderwater ? 1 : 0;
    $('fx-blind').style.opacity = Math.min(1, p.blind / 1.5);
    $('fx-ko').style.opacity = p.unconscious ? 0.92 : 0;
  }

  creatureTargetHTML(c) {
    const hpF = Math.max(0, c.hp / c.hpMax);
    let html = `<div>${c.tamed ? `${c.displayName} <span style="color:var(--muted)">(${c.def.name})</span>` : c.def.name} - Lvl ${c.level}</div>`;
    if (c.dead) return `${html}<div style="color:var(--muted)">Dead — harvest it for resources</div>`;
    html += `<div class="bar"><div style="width:${hpF * 100}%;background:#5aff5a"></div></div>`;
    if (c.torpor > 0 && !c.tamed) html += `<div class="bar"><div style="width:${Math.min(1, c.torpor / c.torporMax) * 100}%;background:#b07aff"></div></div>`;
    if (c.ko) html += `<div style="color:#b07aff">Unconscious</div>`;
    if (c.tamed) html += `<div style="color:var(--muted);font-size:14px">${c.follow ? 'Following' : 'Staying'} · ${c.aggression[0].toUpperCase() + c.aggression.slice(1)}${c.saddle ? ' · Saddled' : ''}</div>`;
    return html;
  }

  tameHTML(c, est) {
    const t = c.taming;
    if (!t) return '';
    const torF = Math.min(1, c.torpor / c.torporMax);
    const tamF = Math.min(1, t.affinity / t.required);
    let html = `<div><b>Taming ${c.def.name}</b> — Effectiveness ${Math.round(t.eff * 100)}%</div>`;
    html += `<div class="bar"><div style="width:${tamF * 100}%;background:var(--accent)"></div></div><div style="font-size:13px">Taming ${Math.floor(tamF * 100)}%</div>`;
    html += `<div class="bar"><div style="width:${torF * 100}%;background:#b07aff"></div></div><div style="font-size:13px">Torpor ${Math.floor(c.torpor)} / ${Math.floor(c.torporMax)}</div>`;
    if (est) {
      if (est.have > 0) html += `<div style="font-size:14px">Eating ${ITEMS[est.item].name}: ${est.have}/${est.items} needed · ~${formatTime(est.time)} left</div>`;
      else html += `<div style="font-size:14px;color:var(--warn)">Put ${ITEMS[est.item].name} in its inventory (F) — needs ~${est.items}</div>`;
    }
    return html;
  }
}
