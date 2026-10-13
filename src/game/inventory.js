// Item container used by survivors, creatures and storage structures.
import { ITEMS } from '../data/items.js';
import { uid } from '../core/util.js';

export function makeStack(id, qty = 1, extra = {}) {
  const def = ITEMS[id];
  const s = { uid: uid(), id, qty };
  if (def.durability) { s.dur = def.durability; s.maxDur = def.durability; }
  if (def.spoil) s.spoil = def.spoil;
  if (def.capacity !== undefined) s.water = 0;
  return Object.assign(s, extra);
}

export class Inventory {
  constructor(maxSlots = 300, opts = {}) {
    this.maxSlots = maxSlots;
    this.stacks = [];
    this.spoilMult = opts.spoilMult || 1; // >1 spoils slower
    this.listeners = new Set();
    this.version = 0;
  }

  changed() {
    this.version++;
    for (const fn of this.listeners) fn(this);
  }

  get slotsUsed() { return this.stacks.length; }

  weight() {
    let w = 0;
    for (const s of this.stacks) w += (ITEMS[s.id].weight || 0) * s.qty;
    return w;
  }

  count(id) {
    let n = 0;
    for (const s of this.stacks) if (s.id === id) n += s.qty;
    return n;
  }

  find(id) { return this.stacks.find((s) => s.id === id) || null; }
  byUid(u) { return this.stacks.find((s) => s.uid === u) || null; }

  // Adds items; returns the quantity that did not fit.
  add(id, qty = 1, extra = null) {
    const def = ITEMS[id];
    if (!def || qty <= 0) return qty;
    let left = qty;
    const stackable = def.stack > 1 && !def.durability;
    if (stackable && !extra) {
      for (const s of this.stacks) {
        if (s.id !== id || s.qty >= def.stack) continue;
        const n = Math.min(left, def.stack - s.qty);
        s.qty += n;
        left -= n;
        if (!left) break;
      }
    }
    while (left > 0 && this.stacks.length < this.maxSlots) {
      const n = stackable ? Math.min(left, def.stack) : 1;
      this.stacks.push(makeStack(id, n, extra ? { ...extra } : {}));
      left -= n;
    }
    this.changed();
    return left;
  }

  // Insert an existing stack object (keeps durability etc.). Returns true if stored.
  addStack(stack) {
    const def = ITEMS[stack.id];
    if (def.stack > 1 && !def.durability && stack.water === undefined) {
      const left = this.add(stack.id, stack.qty);
      stack.qty = left;
      return left === 0;
    }
    if (this.stacks.length >= this.maxSlots) return false;
    this.stacks.push(stack);
    this.changed();
    return true;
  }

  remove(id, qty = 1) {
    if (this.count(id) < qty) return false;
    let left = qty;
    // take from the stalest stacks first
    for (let i = this.stacks.length - 1; i >= 0 && left > 0; i--) {
      const s = this.stacks[i];
      if (s.id !== id) continue;
      const n = Math.min(left, s.qty);
      s.qty -= n;
      left -= n;
      if (s.qty <= 0) this.stacks.splice(i, 1);
    }
    this.changed();
    return true;
  }

  removeStack(stack, qty = stack.qty) {
    const i = this.stacks.indexOf(stack);
    if (i < 0) return null;
    if (qty >= stack.qty) {
      this.stacks.splice(i, 1);
      this.changed();
      return stack;
    }
    stack.qty -= qty;
    const part = { ...stack, uid: uid(), qty };
    this.changed();
    return part;
  }

  hasAll(recipe, mult = 1) {
    for (const [id, n] of Object.entries(recipe)) if (this.count(id) < n * mult) return false;
    return true;
  }

  consumeAll(recipe, mult = 1) {
    if (!this.hasAll(recipe, mult)) return false;
    for (const [id, n] of Object.entries(recipe)) this.remove(id, n * mult);
    return true;
  }

  // How many times a recipe can be crafted from this inventory.
  craftableCount(recipe) {
    let n = Infinity;
    for (const [id, c] of Object.entries(recipe)) n = Math.min(n, Math.floor(this.count(id) / c));
    return n === Infinity ? 0 : n;
  }

  // Process spoilage. Returns true if anything changed.
  update(dt) {
    let dirty = false;
    for (let i = this.stacks.length - 1; i >= 0; i--) {
      const s = this.stacks[i];
      if (s.spoil === undefined) continue;
      const def = ITEMS[s.id];
      s.spoil -= dt / this.spoilMult;
      while (s.spoil <= 0 && s.qty > 0) {
        s.qty--;
        s.spoil += def.spoil;
        dirty = true;
        if (def.spoilsTo) this.pendingSpoil = (this.pendingSpoil || 0) + 1;
      }
      if (s.qty <= 0) this.stacks.splice(i, 1);
    }
    if (this.pendingSpoil) {
      const n = this.pendingSpoil;
      this.pendingSpoil = 0;
      this.add('spoiled_meat', n);
    }
    if (dirty) this.changed();
    return dirty;
  }

  serialize() {
    return this.stacks.map((s) => ({ ...s }));
  }

  restore(list) {
    this.stacks = [];
    if (Array.isArray(list)) {
      for (const s of list) if (ITEMS[s.id] && s.qty > 0) this.stacks.push({ ...s, uid: s.uid || uid() });
    }
    this.changed();
  }

  // Sorted view for the UI
  sorted(filter = '') {
    const f = filter.trim().toLowerCase();
    const order = { weapon: 0, tool: 1, armor: 2, saddle: 3, ammo: 4, consumable: 5, resource: 6, structure: 7, misc: 8 };
    return this.stacks
      .filter((s) => !f || ITEMS[s.id].name.toLowerCase().includes(f))
      .sort((a, b) => (order[ITEMS[a.id].cat] ?? 9) - (order[ITEMS[b.id].cat] ?? 9) || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name));
  }
}
