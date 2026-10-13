// First-person arms/held items and the third-person survivor body.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';

const L = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
};
const cyl = (r1, r2, h, m, x = 0, y = 0, z = 0, seg = 6) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
  mesh.position.set(x, y, z);
  return mesh;
};

export function skinColor(t) {
  return new THREE.Color().setHSL(0.07, 0.45, 0.78 - t * 0.5);
}

const ARMOR_COLORS = { cloth: '#c8b98a', hide: '#8a5a34', chitin: '#2f3a2e', flak: '#5a6066' };

// Build a mesh for an item held in the hand. Origin = grip point; item points along -Z (forward) / +Y (up).
export function buildHeldItem(id) {
  const g = new THREE.Group();
  const wood = L('#7a5432'), stone = L('#8a8a86'), metal = L('#b8c0c8'), dark = L('#3a3a3a'), hide = L('#9a6a44');
  const def = ITEMS[id];
  const metalTool = id.startsWith('metal');
  switch (def && def.equip) {
    case 'pick':
      g.add(cyl(0.025, 0.03, 0.6, wood, 0, 0.18, 0));
      { const head = box(0.42, 0.06, 0.07, metalTool ? metal : stone, 0, 0.46, 0); head.rotation.z = 0.12; g.add(head); }
      break;
    case 'hatchet':
      g.add(cyl(0.025, 0.03, 0.55, wood, 0, 0.16, 0));
      g.add(box(0.05, 0.16, 0.2, metalTool ? metal : stone, 0, 0.4, -0.09));
      break;
    case 'spear':
      g.add(cyl(0.022, 0.025, 1.9, wood, 0, 0.3, 0));
      { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), stone); tip.position.y = 1.35; g.add(tip); }
      break;
    case 'club':
      g.add(cyl(0.03, 0.035, 0.4, wood, 0, 0.1, 0));
      g.add(cyl(0.07, 0.05, 0.4, wood, 0, 0.45, 0));
      break;
    case 'sword':
      g.add(cyl(0.025, 0.025, 0.18, hide, 0, 0, 0));
      g.add(box(0.2, 0.03, 0.05, metal, 0, 0.1, 0));
      g.add(box(0.05, 0.8, 0.015, metal, 0, 0.52, 0));
      break;
    case 'torch': {
      g.add(cyl(0.025, 0.03, 0.55, wood, 0, 0.18, 0));
      g.add(cyl(0.05, 0.04, 0.12, dark, 0, 0.47, 0));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), new THREE.MeshBasicMaterial({ color: '#ffb040' }));
      flame.position.y = 0.62;
      flame.name = 'flame';
      g.add(flame);
      break;
    }
    case 'bow': {
      const curve = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.018, 4, 12, Math.PI * 0.75), wood);
      curve.rotation.z = Math.PI / 2 + Math.PI * 0.125;
      curve.position.x = -0.3;
      g.add(curve);
      const string = box(0.004, 0.8, 0.004, L('#e8e0c8'), -0.13, 0, 0);
      string.name = 'string';
      g.add(string);
      break;
    }
    case 'slingshot': {
      g.add(cyl(0.02, 0.025, 0.2, wood, 0, 0, 0));
      const a = box(0.025, 0.15, 0.025, wood, 0.04, 0.16, 0); a.rotation.z = -0.4; g.add(a);
      const b = box(0.025, 0.15, 0.025, wood, -0.04, 0.16, 0); b.rotation.z = 0.4; g.add(b);
      g.add(box(0.16, 0.02, 0.01, hide, 0, 0.22, 0.03));
      break;
    }
    case 'pistol':
      g.add(box(0.04, 0.12, 0.05, wood, 0, -0.03, 0.02));
      g.add(box(0.035, 0.04, 0.3, dark, 0, 0.04, -0.1));
      break;
    case 'rifle':
      g.add(box(0.05, 0.08, 0.35, wood, 0, -0.02, 0.2));
      g.add(box(0.03, 0.035, 0.9, dark, 0, 0.03, -0.35));
      g.add(cyl(0.02, 0.02, 0.2, dark, 0, 0.09, -0.1));
      g.children[2].rotation.x = Math.PI / 2;
      break;
    case 'spyglass':
      { const t = cyl(0.03, 0.04, 0.35, L('#b8944a'), 0, 0, -0.1); t.rotation.x = Math.PI / 2; g.add(t); }
      break;
    default:
      if (def && def.cat === 'consumable') {
        const color = def.icon ? def.icon.c : '#ff0000';
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), L(color)));
      }
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.skinMat = L('#d8b090');
    this.sleeveMat = L('#c8b98a');
    this.right = this.makeArm(1);
    this.left = this.makeArm(-1);
    this.root.add(this.right.pivot, this.left.pivot);
    this.heldId = null;
    this.held = null;
    this.swing = 0; // 0..1 progress of current swing
    this.swingHand = 1;
    this.bob = 0;
    this.draw = 0;
    this.recoil = 0;
    this.torchLight = new THREE.PointLight(0xffa040, 0, 14, 1.5);
    this.torchLight.position.set(0.3, 0.1, -0.5);
    this.root.add(this.torchLight);
  }

  makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * side, -0.42, -0.24);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), this.skinMat);
    fore.position.z = -0.12;
    pivot.add(fore);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.14), this.sleeveMat);
    sleeve.position.z = 0.02;
    sleeve.visible = false;
    pivot.add(sleeve);
    const hand = new THREE.Group();
    hand.position.z = -0.3;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.09), this.skinMat);
    hand.add(fist);
    pivot.add(hand);
    pivot.rotation.set(0.6, 0.32 * side, 0);
    return { pivot, hand, sleeve, fist };
  }

  setSkin(t) { this.skinMat.color.copy(skinColor(t)); }

  setEquipment(eq) {
    const chest = eq.chest && ITEMS[eq.chest.id];
    this.right.sleeve.visible = this.left.sleeve.visible = !!chest;
    if (chest) this.sleeveMat.color.set(ARMOR_COLORS[chest.set] || '#888');
    const hands = eq.hands && ITEMS[eq.hands.id];
    const handColor = hands ? ARMOR_COLORS[hands.set] : null;
    this.right.fist.material = this.left.fist.material = handColor ? L(handColor) : this.skinMat;
  }

  setHeld(id) {
    if (this.heldId === id) return;
    if (this.held && this.held.parent) this.held.parent.remove(this.held);
    this.held = null;
    this.heldId = id;
    if (!id) return;
    const def = ITEMS[id];
    if (!def || def.cat === 'structure') return;
    this.held = buildHeldItem(id);
    this.held.scale.setScalar(def.equip === 'bow' ? 0.55 : 0.62);
    // orient: tools point up out of the fist and lean forward
    if (['pistol', 'rifle', 'spyglass'].includes(def.equip)) this.held.rotation.set(0, 0, 0);
    else if (def.equip === 'bow') { this.held.rotation.set(0, -Math.PI / 2, 0); this.held.position.set(0, 0.02, 0); }
    else this.held.rotation.set(-1.25, 0.15, -0.25);
    (def.equip === 'bow' ? this.left.hand : this.right.hand).add(this.held);
  }

  startSwing() {
    this.swing = 0.0001;
    this.swingHand = this.heldId ? 1 : -this.swingHand;
  }

  update(dt, s) {
    // s: { moving, sprinting, onGround, torchLit, bowDraw, heldEquip, visible }
    this.root.visible = !!s.visible;
    this.bob += dt * (s.moving ? (s.sprinting ? 11 : 7) : 1.5);
    const bobAmt = s.moving ? (s.sprinting ? 0.03 : 0.015) : 0.004;
    this.root.position.set(Math.cos(this.bob * 0.5) * bobAmt, Math.abs(Math.sin(this.bob * 0.5)) * bobAmt - (s.sprinting ? 0.04 : 0), 0);
    this.root.rotation.x = s.sprinting ? -0.25 : 0;

    const R = this.right.pivot, Lp = this.left.pivot;
    const equip = s.heldEquip;
    // base poses
    R.position.set(0.3, -0.42, -0.24); Lp.position.set(-0.3, -0.42, -0.24);
    R.rotation.set(0.6, 0.32, 0); Lp.rotation.set(0.6, -0.32, 0);
    Lp.visible = !equip || ['bow', 'rifle', 'spear'].includes(equip) || equip === 'fists';
    if (!equip) Lp.visible = true;
    if (equip === 'bow') {
      Lp.visible = true;
      Lp.position.set(-0.16, -0.24, -0.26);
      Lp.rotation.set(0.32, -0.12, 0);
      R.position.set(0.08, -0.27, -0.24 + this.draw * 0.16);
      R.rotation.set(0.45, 0.5, 0);
      const str = this.held && this.held.getObjectByName('string');
      if (str) str.position.x = -0.13 + this.draw * 0.12;
    } else if (equip === 'rifle') {
      R.position.set(0.18, -0.22, -0.15);
      Lp.position.set(-0.05, -0.24, -0.45);
      Lp.rotation.set(0.2, 0.3, 0);
    } else if (equip === 'pistol' || equip === 'spyglass') {
      R.position.set(0.18, -0.22, -0.25);
    }
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 6);
      R.rotation.x += this.recoil * 0.6;
      R.position.z += this.recoil * 0.08;
    }
    // swing animation
    if (this.swing > 0) {
      this.swing += dt * (equip ? 3.2 : 4.5);
      const t = Math.min(1, this.swing);
      const k = Math.sin(t * Math.PI);
      if (!equip) {
        const arm = this.swingHand > 0 ? R : Lp;
        arm.position.z -= k * 0.35;
        arm.position.x -= Math.sign(arm.position.x) * k * 0.12;
        arm.rotation.x -= k * 0.2;
      } else if (equip === 'spear') {
        R.position.z -= k * 0.5;
      } else {
        // overhead chop
        R.rotation.x += (t < 0.35 ? -t / 0.35 * 0.9 : -0.9 + (t - 0.35) / 0.65 * 2.2) * (t < 1 ? 1 : 0);
        R.position.y += k * 0.08;
      }
      if (this.swing >= 1) this.swing = 0;
    }
    // torch light & flame flicker
    const flame = this.held && this.held.getObjectByName('flame');
    if (flame) flame.scale.setScalar(0.85 + Math.random() * 0.3);
    this.torchLight.intensity = s.torchLit ? (5 + Math.random() * 1.5) : 0;
  }
}

// Simple third-person survivor body.
export class SurvivorBody {
  constructor(scene) {
    this.group = new THREE.Group();
    this.skin = L('#d8b090');
    this.under = L('#6a5a4a');
    this.mats = { head: L('#d8b090'), chest: L('#d8b090'), legs: L('#6a5a4a'), hands: L('#d8b090'), feet: L('#d8b090') };
    const g = this.group;
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    g.add(this.hips);
    this.torso = box(0.46, 0.62, 0.26, this.mats.chest, 0, 0.36, 0);
    this.hips.add(this.torso);
    this.hips.add(box(0.44, 0.18, 0.25, this.under, 0, 0.0, 0));
    this.head = box(0.24, 0.27, 0.26, this.mats.head, 0, 0.82, 0);
    this.hips.add(this.head);
    this.hair = box(0.25, 0.08, 0.27, L('#3a2a1a'), 0, 0.97, 0);
    this.hips.add(this.hair);
    const limb = (x, y, len, w, mat, handMat) => {
      const p = new THREE.Group();
      p.position.set(x, y, 0);
      p.add(box(w, len, w, mat, 0, -len / 2, 0));
      if (handMat) p.add(box(w * 1.05, 0.12, w * 1.05, handMat, 0, -len - 0.04, 0));
      this.hips.add(p);
      return p;
    };
    this.armL = limb(-0.3, 0.64, 0.56, 0.12, this.mats.chest, this.mats.hands);
    this.armR = limb(0.3, 0.64, 0.56, 0.12, this.mats.chest, this.mats.hands);
    this.legL = limb(-0.12, -0.05, 0.86, 0.16, this.mats.legs, this.mats.feet);
    this.legR = limb(0.12, -0.05, 0.86, 0.16, this.mats.legs, this.mats.feet);
    this.heldSlot = new THREE.Group();
    this.heldSlot.position.set(0, -0.6, 0.05);
    this.armR.add(this.heldSlot);
    this.heldId = null;
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    this.phase = 0;
  }

  setLook(skin, gender) {
    const c = skinColor(skin);
    this.skin.color.copy(c);
    this.baseSkin = c;
    this.torso.scale.set(gender === 'female' ? 0.9 : 1, 1, 1);
    this.hair.scale.y = gender === 'female' ? 2.2 : 1;
    this.hair.position.y = gender === 'female' ? 0.93 : 0.97;
  }

  setEquipment(eq) {
    const skin = this.baseSkin || new THREE.Color('#d8b090');
    for (const slot of ['head', 'chest', 'legs', 'hands', 'feet']) {
      const it = eq[slot] && ITEMS[eq[slot].id];
      if (it) this.mats[slot].color.set(ARMOR_COLORS[it.set] || '#888');
      else if (slot === 'legs') this.mats[slot].color.set('#6a5a4a');
      else this.mats[slot].color.copy(skin);
    }
    this.hair.visible = !eq.head;
  }

  setHeld(id) {
    if (this.heldId === id) return;
    this.heldSlot.clear();
    this.heldId = id;
    if (id && ITEMS[id] && ITEMS[id].cat !== 'structure') {
      const m = buildHeldItem(id);
      m.rotation.x = -Math.PI / 2;
      this.heldSlot.add(m);
    }
  }

  update(dt, s) {
    // s: { pos, yaw, speed, swimming, stance, swing, dead, visible }
    const g = this.group;
    g.visible = !!s.visible;
    if (!s.visible) return;
    g.position.copy(s.pos);
    g.rotation.set(0, s.yaw + Math.PI, 0);
    this.phase += dt * s.speed * 2.2;
    const sw = Math.sin(this.phase) * Math.min(1, s.speed / 3) * 0.7;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;
    if (s.swing > 0) this.armR.rotation.x = -2.2 * Math.sin(s.swing * Math.PI);
    let pitch = 0, y = 0.95;
    if (s.swimming) { pitch = 1.2; y = 0.6; }
    if (s.stance === 'crouch') { y = 0.6; this.legL.rotation.x -= 0.9; this.legR.rotation.x -= 0.9; }
    if (s.stance === 'prone' || s.dead || s.ko) { pitch = Math.PI / 2; y = 0.2; }
    if (s.riding) { y = 0.9; this.legL.rotation.x = this.legR.rotation.x = -1.4; this.legL.rotation.z = 0.4; this.legR.rotation.z = -0.4; }
    else { this.legL.rotation.z = this.legR.rotation.z = 0; }
    this.hips.position.y = y;
    this.hips.rotation.x = pitch;
  }
}
