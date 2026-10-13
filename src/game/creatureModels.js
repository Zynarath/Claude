// Procedural low-poly creature models with simple rigs (pivots) for animation.
// Model space: +Z is forward, Y is up, origin is between the feet on the ground.
import * as THREE from 'three';

const GEO = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  sphereLo: new THREE.SphereGeometry(1, 7, 5),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 7),
  tri: (() => {
    // flat triangle in XZ plane: (0,0,0) (1,0,0) (0,0,1) — used for wing membranes
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
    g.computeVertexNormals();
    return g;
  })(),
};
GEO.cylTaper = new THREE.CylinderGeometry(0.55, 1, 1, 7);

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function part(parent, geo, material, sx, sy, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function eyes(head, m, x, y, z, r = 0.035) {
  part(head, GEO.sphereLo, m, r, r, r, x, y, z);
  part(head, GEO.sphereLo, m, r, r, r, -x, y, z);
}

function makeRig(def, colors) {
  const root = new THREE.Group();
  const body = pivot(root);
  return {
    root, body, legs: [], tail: [], neck: [], head: null, jaw: null, wings: [], arms: [], frill: null,
    hitSpheres: [], gait: 'biped', mats: { a: mat(colors.a), b: mat(colors.b), dark: mat('#151515'), light: mat('#e8e2d0') },
  };
}

// Leg: hip pivot -> upper mesh -> knee pivot -> lower mesh -> foot
function leg(rig, parent, x, y, z, upper, lower, thick, opts = {}) {
  const { a, b } = rig.mats;
  const hip = pivot(parent, x, y, z);
  if (opts.column) {
    // pillar-like limb for quadrupeds
    part(hip, GEO.sphere, opts.upperMat || a, thick * 1.05, thick * 1.1, thick * 1.15, 0, -thick * 0.2, 0);
    part(hip, GEO.cyl, opts.upperMat || a, thick * 0.85, upper * 1.05, thick * 0.9, 0, -upper * 0.5, 0);
  } else {
    part(hip, GEO.sphere, opts.upperMat || a, thick, upper * 0.55, thick * 1.2, 0, -upper * 0.45, opts.thighFwd || 0);
  }
  const knee = pivot(hip, 0, -upper * (opts.column ? 1 : 0.9), opts.kneeZ || 0);
  const lowT = opts.column ? 0.78 : 0.55;
  part(knee, opts.column ? GEO.cyl : GEO.cylTaper, opts.lowerMat || a, thick * lowT, lower, thick * lowT, 0, -lower * 0.5, opts.shinZ || 0, 0, 0, 0);
  if (opts.foot !== false) part(knee, GEO.box, b, thick * 1.1, thick * 0.3, thick * (opts.footLen || 1.8), 0, -lower + thick * 0.12, thick * 0.4);
  const L = { hip, knee, phase: opts.phase || 0, side: Math.sign(x) || 1, front: !!opts.front };
  rig.legs.push(L);
  return L;
}

function tailChain(rig, parent, x, y, z, segs, len, rad, shrink = 0.72, droop = 0.08, material) {
  let p = pivot(parent, x, y, z);
  let l = len, r = rad;
  for (let i = 0; i < segs; i++) {
    p.rotation.x = i === 0 ? droop : droop * 0.5;
    part(p, GEO.sphere, material || rig.mats.a, r, r * 0.95, l * 0.62, 0, 0, -l * 0.5);
    rig.tail.push(p);
    const next = pivot(p, 0, 0, -l * 0.9);
    p = next;
    l *= shrink * 1.08;
    r *= shrink;
  }
  return p;
}

// ---------------------------------------------------------------------------
const BUILDERS = {
  theropod(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const up = m.upright || 0;
    const hipY = 1.0;
    rig.body.position.y = 0;
    const torso = pivot(rig.body, 0, hipY + 0.1, 0.1);
    torso.rotation.x = -0.08 - up;
    part(torso, GEO.sphere, a, 0.36, 0.4, 0.9, 0, 0.05, 0.15);
    part(torso, GEO.sphere, b, 0.28, 0.25, 0.7, 0, -0.16, 0.25); // belly
    if (m.feathers) for (let i = 0; i < 5; i++) part(torso, GEO.box, b, 0.03, 0.12, 0.18, 0, 0.42, 0.5 - i * 0.22, -0.3);
    // legs
    leg(rig, rig.body, 0.24, hipY, 0, 0.55, 0.5, 0.22, { phase: 0, thighFwd: 0.06, kneeZ: 0.1, shinZ: -0.08 });
    leg(rig, rig.body, -0.24, hipY, 0, 0.55, 0.5, 0.22, { phase: Math.PI, thighFwd: 0.06, kneeZ: 0.1, shinZ: -0.08 });
    // arms
    const armLen = m.smallArms ? 0.16 : m.bigHead ? 0.2 : 0.32;
    for (const sx of [1, -1]) {
      const ap = pivot(torso, 0.22 * sx, -0.05, 0.75);
      ap.rotation.x = 0.7;
      part(ap, GEO.box, a, 0.07, armLen, 0.08, 0, -armLen / 2, 0);
      if (m.feathers) part(ap, GEO.box, b, 0.02, armLen * 0.9, 0.12, 0.04 * sx, -armLen / 2, -0.05);
      rig.arms.push(ap);
    }
    // neck & head
    const neck = pivot(torso, 0, 0.18, 0.85);
    neck.rotation.x = -0.75 + up * 0.6;
    part(neck, GEO.sphere, a, 0.17, 0.17, 0.32, 0, 0, 0.2);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.45);
    head.rotation.x = 0.85 - up * 0.4;
    const hs = m.bigHead ? 1.55 : 1;
    if (m.herbivoreHead) {
      part(head, GEO.box, a, 0.24, 0.24, 0.42, 0, 0.05, 0.18);
      part(head, GEO.box, b, 0.2, 0.08, 0.3, 0, -0.04, 0.42); // duck bill
    } else {
      part(head, GEO.box, a, 0.25 * hs, 0.24 * hs, 0.5 * hs, 0, 0.05 * hs, 0.22 * hs);
    }
    eyes(head, dark, 0.12 * hs, 0.12 * hs, 0.18 * hs);
    const jaw = pivot(head, 0, -0.07 * hs, 0.02);
    part(jaw, GEO.box, b, 0.21 * hs, 0.07 * hs, 0.45 * hs, 0, -0.03 * hs, 0.22 * hs);
    if (!m.herbivoreHead) {
      for (let i = 0; i < 4; i++) {
        part(jaw, GEO.cone, light, 0.018 * hs, 0.05 * hs, 0.018 * hs, 0.08 * hs, 0.02 * hs, 0.1 * hs + i * 0.08 * hs);
        part(jaw, GEO.cone, light, 0.018 * hs, 0.05 * hs, 0.018 * hs, -0.08 * hs, 0.02 * hs, 0.1 * hs + i * 0.08 * hs);
      }
    }
    rig.head = head; rig.jaw = jaw;
    if (m.crest === 'dilo') {
      part(head, GEO.box, b, 0.025, 0.14, 0.42, 0.06, 0.2, 0.18);
      part(head, GEO.box, b, 0.025, 0.14, 0.42, -0.06, 0.2, 0.18);
    }
    if (m.crest === 'para') part(head, GEO.cyl, b, 0.06, 0.75, 0.06, 0, 0.32, -0.22, -1.15);
    if (m.horns) {
      part(head, GEO.cone, light, 0.05, 0.22, 0.05, 0.12, 0.25, 0.08, 0, 0, -0.6);
      part(head, GEO.cone, light, 0.05, 0.22, 0.05, -0.12, 0.25, 0.08, 0, 0, 0.6);
    }
    if (m.feathers) part(head, GEO.box, b, 0.02, 0.12, 0.25, 0, 0.2, -0.05);
    if (m.frill) {
      const fr = pivot(neck, 0, 0, 0.42);
      const fm = new THREE.MeshLambertMaterial({ color: '#d8b83a', flatShading: true, side: THREE.DoubleSide });
      part(fr, GEO.cone, fm, 0.5, 0.1, 0.5, 0, 0, 0, Math.PI / 2 + 0.3);
      fr.scale.setScalar(0.01);
      rig.frill = fr;
    }
    tailChain(rig, torso, 0, 0.02, -0.7, 4, 0.55, 0.26, 0.72, 0.12);
    rig.hitSpheres = [
      { z: 0.2, y: 1.15, r: 0.5 }, { z: 0.95, y: 1.55 + up, r: 0.35 * hs }, { z: -0.9, y: 1.05, r: 0.3 }, { z: 0, y: 0.5, r: 0.3 },
    ];
    rig.gait = 'biped';
  },

  dodo(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = pivot(rig.body, 0, 0.42, 0);
    part(torso, GEO.sphere, a, 0.3, 0.3, 0.36, 0, 0, 0);
    part(torso, GEO.sphere, b, 0.12, 0.12, 0.12, 0, 0.12, -0.33); // tail tuft
    for (const sx of [1, -1]) {
      const w = pivot(torso, 0.27 * sx, 0.05, 0.02);
      part(w, GEO.sphere, a, 0.05, 0.12, 0.18, 0, 0, 0);
      rig.wings.push(w);
    }
    const neck = pivot(torso, 0, 0.2, 0.22);
    part(neck, GEO.sphere, a, 0.12, 0.17, 0.12, 0, 0.08, 0);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0.22, 0.04);
    part(head, GEO.sphere, b, 0.13, 0.13, 0.13, 0, 0, 0);
    eyes(head, dark, 0.09, 0.04, 0.07, 0.025);
    part(head, GEO.box, light, 0.08, 0.08, 0.2, 0, -0.01, 0.16);
    const jaw = pivot(head, 0, -0.04, 0.08);
    part(jaw, GEO.box, light, 0.07, 0.03, 0.14, 0, -0.01, 0.06);
    rig.head = head; rig.jaw = jaw;
    leg(rig, rig.body, 0.1, 0.25, 0, 0.14, 0.13, 0.06, { phase: 0, footLen: 1.6 });
    leg(rig, rig.body, -0.1, 0.25, 0, 0.14, 0.13, 0.06, { phase: Math.PI, footLen: 1.6 });
    rig.hitSpheres = [{ z: 0, y: 0.45, r: 0.36 }, { z: 0.25, y: 0.8, r: 0.18 }];
    rig.gait = 'biped';
  },

  quadruped(def, m, rig, o) {
    const { a, b } = rig.mats;
    const torso = pivot(rig.body, 0, o.hipY + o.bodyH * 0.35, 0);
    torso.rotation.x = o.tilt || 0;
    part(torso, GEO.sphere, a, o.bodyW, o.bodyH, o.bodyL, 0, 0, 0);
    if (o.belly !== false) part(torso, GEO.sphere, b, o.bodyW * 0.75, o.bodyH * 0.6, o.bodyL * 0.8, 0, -o.bodyH * 0.35, 0);
    const lx = o.bodyW * 0.62;
    const fz = o.bodyL * 0.62, bz = -o.bodyL * 0.6;
    const fH = o.frontLegH || o.legH, bH = o.backLegH || o.legH;
    const lo = { column: true, foot: !o.noFeet, footLen: 1.2 };
    leg(rig, rig.body, lx, fH, fz, fH * 0.5, fH * 0.5, o.legT, { ...lo, phase: 0, front: true });
    leg(rig, rig.body, -lx, fH, fz, fH * 0.5, fH * 0.5, o.legT, { ...lo, phase: Math.PI, front: true });
    leg(rig, rig.body, lx, bH, bz, bH * 0.5, bH * 0.5, o.legT * 1.05, { ...lo, phase: Math.PI });
    leg(rig, rig.body, -lx, bH, bz, bH * 0.5, bH * 0.5, o.legT * 1.05, { ...lo, phase: 0 });
    rig.gait = 'quad';
    return torso;
  },

  ceratopsian(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 1.1, bodyW: 0.95, bodyH: 0.95, bodyL: 1.9, legH: 1.15, legT: 0.32 });
    const neck = pivot(torso, 0, 0.1, 1.7);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.2);
    part(head, GEO.box, a, 0.75, 0.7, 1.0, 0, 0, 0.45);
    part(head, GEO.box, b, 0.5, 0.35, 0.4, 0, -0.18, 1.0); // beak
    eyes(head, dark, 0.36, 0.15, 0.6, 0.06);
    const frill = new THREE.Mesh(GEO.cyl, b);
    frill.scale.set(1.15, 0.12, 1.0);
    frill.rotation.x = Math.PI / 2 - 0.5;
    frill.position.set(0, 0.55, -0.05);
    frill.castShadow = true;
    head.add(frill);
    part(head, GEO.cone, light, 0.09, 0.9, 0.09, 0.25, 0.45, 0.85, 1.2);
    part(head, GEO.cone, light, 0.09, 0.9, 0.09, -0.25, 0.45, 0.85, 1.2);
    part(head, GEO.cone, light, 0.08, 0.35, 0.08, 0, 0.12, 1.15, 0.9);
    const jaw = pivot(head, 0, -0.3, 0.6);
    part(jaw, GEO.box, b, 0.4, 0.15, 0.5, 0, 0, 0.2);
    rig.head = head; rig.jaw = jaw;
    tailChain(rig, torso, 0, 0.1, -1.7, 3, 0.8, 0.35, 0.65, 0.25);
    rig.hitSpheres = [{ z: 0, y: 1.5, r: 1.15 }, { z: 1.9, y: 1.4, r: 0.75 }, { z: -1.6, y: 1.3, r: 0.6 }];
  },

  stego(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 1.25, bodyW: 1.0, bodyH: 1.15, bodyL: 2.0, frontLegH: 1.0, backLegH: 1.6, legH: 1.3, legT: 0.34, tilt: 0.12 });
    for (let i = 0; i < 7; i++) {
      const z = 1.3 - i * 0.42;
      const s = 0.55 + Math.sin((i / 6) * Math.PI) * 0.45;
      for (const sx of [1, -1]) {
        const plate = part(torso, GEO.box, b, 0.07, 0.8 * s, 0.55 * s, 0.14 * sx, 1.1 + 0.3 * s, z + (sx > 0 ? 0.1 : -0.12), 0.2, 0, 0.15 * sx);
        plate.rotation.y = 0;
      }
    }
    const neck = pivot(torso, 0, -0.15, 1.85);
    neck.rotation.x = 0.35;
    part(neck, GEO.sphere, a, 0.3, 0.3, 0.6, 0, 0, 0.35);
    rig.neck.push(neck);
    const head = pivot(neck, 0, -0.05, 0.85);
    part(head, GEO.box, a, 0.3, 0.3, 0.55, 0, 0, 0.2);
    eyes(head, dark, 0.15, 0.08, 0.25, 0.04);
    const jaw = pivot(head, 0, -0.12, 0.1);
    part(jaw, GEO.box, b, 0.24, 0.08, 0.4, 0, 0, 0.15);
    rig.head = head; rig.jaw = jaw;
    const end = tailChain(rig, torso, 0, 0.3, -1.8, 4, 0.9, 0.42, 0.72, -0.2);
    for (const sx of [1, -1]) {
      part(end, GEO.cone, light, 0.06, 0.7, 0.06, 0.2 * sx, 0.15, 0.4, 0, 0, -1.0 * sx);
      part(end, GEO.cone, light, 0.06, 0.7, 0.06, 0.2 * sx, 0.15, 0.0, 0, 0, -1.0 * sx);
    }
    rig.hitSpheres = [{ z: 0, y: 2.0, r: 1.3 }, { z: 2.4, y: 1.3, r: 0.5 }, { z: -2.0, y: 2.0, r: 0.7 }];
  },

  ankylo(def, m, rig) {
    const { a, b, dark } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 0.8, bodyW: 1.15, bodyH: 0.75, bodyL: 1.8, legH: 0.8, legT: 0.3 });
    for (let i = 0; i < 18; i++) {
      const ang = (i % 6) / 5 * Math.PI - Math.PI / 2;
      const z = 1.2 - Math.floor(i / 6) * 1.0;
      part(torso, GEO.cone, b, 0.12, 0.25, 0.12, Math.sin(ang) * 0.95, Math.cos(ang) * 0.6 + 0.1, z, 0, 0, -ang * 0.9);
    }
    const neck = pivot(torso, 0, -0.1, 1.7);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.2);
    part(head, GEO.box, a, 0.55, 0.4, 0.6, 0, 0, 0.25);
    eyes(head, dark, 0.27, 0.08, 0.35, 0.04);
    const jaw = pivot(head, 0, -0.17, 0.25);
    part(jaw, GEO.box, b, 0.4, 0.08, 0.4, 0, 0, 0.1);
    rig.head = head; rig.jaw = jaw;
    const end = tailChain(rig, torso, 0, 0.0, -1.6, 4, 0.7, 0.32, 0.7, 0.05);
    part(end, GEO.sphere, b, 0.4, 0.28, 0.35, 0, 0, -0.1); // club
    rig.hitSpheres = [{ z: 0, y: 1.2, r: 1.25 }, { z: 2.0, y: 1.0, r: 0.45 }, { z: -2.2, y: 0.9, r: 0.5 }];
  },

  sauropod(def, m, rig) {
    const { a, b, dark } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 4.2, bodyW: 2.4, bodyH: 2.4, bodyL: 4.6, legH: 4.2, legT: 0.9, noFeet: true });
    let p = pivot(torso, 0, 1.0, 3.8);
    p.rotation.x = -0.75;
    for (let i = 0; i < 6; i++) {
      part(p, GEO.sphere, a, 0.8 - i * 0.08, 0.8 - i * 0.08, 1.4, 0, 0, 0.9);
      rig.neck.push(p);
      p = pivot(p, 0, 0, 1.75);
      p.rotation.x = 0.06;
    }
    const head = pivot(p, 0, 0, 0.2);
    head.rotation.x = 0.9;
    part(head, GEO.box, a, 0.55, 0.5, 0.9, 0, 0, 0.35);
    eyes(head, dark, 0.27, 0.12, 0.4, 0.06);
    const jaw = pivot(head, 0, -0.22, 0.2);
    part(jaw, GEO.box, b, 0.45, 0.12, 0.7, 0, 0, 0.25);
    rig.head = head; rig.jaw = jaw;
    tailChain(rig, torso, 0, 0.4, -4.2, 7, 2.0, 1.0, 0.8, 0.2);
    rig.hitSpheres = [{ z: 0, y: 6, r: 3.2 }, { z: -6, y: 4.5, r: 1.4 }, { z: 6, y: 9, r: 1.2 }, { z: 8, y: 12.5, r: 1.0 }];
  },

  mammoth(def, m, rig) {
    const { a, dark, light } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 2.0, bodyW: 1.4, bodyH: 1.5, bodyL: 2.0, legH: 2.0, legT: 0.5, noFeet: true, belly: false });
    part(torso, GEO.sphere, a, 1.1, 0.9, 1.2, 0, 0.7, 0.7); // shoulder hump
    const neck = pivot(torso, 0, 0.6, 1.8);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.3);
    part(head, GEO.sphere, a, 0.85, 0.9, 0.8, 0, 0.1, 0.2);
    eyes(head, dark, 0.55, 0.25, 0.6, 0.06);
    for (const sx of [1, -1]) {
      part(head, GEO.box, a, 0.08, 0.55, 0.45, 0.75 * sx, 0.1, 0.0);
      // tusks: two angled cone segments
      part(head, GEO.cone, light, 0.11, 1.4, 0.11, 0.35 * sx, -0.75, 0.9, 1.7, 0, 0.3 * sx);
      part(head, GEO.cone, light, 0.09, 0.8, 0.09, 0.42 * sx, -0.75, 1.65, -0.6, 0, 0.2 * sx);
    }
    let t = pivot(head, 0, -0.2, 0.85);
    t.rotation.x = 0.4;
    for (let i = 0; i < 5; i++) {
      part(t, GEO.cyl, a, 0.2 - i * 0.025, 0.42, 0.2 - i * 0.025, 0, -0.2, 0);
      rig.tail.push(t); // trunk sways like a tail
      t = pivot(t, 0, -0.38, 0);
      t.rotation.x = 0.15;
    }
    rig.head = head; rig.jaw = null;
    tailChain(rig, torso, 0, 0.6, -1.9, 2, 0.4, 0.12, 0.8, 0.9);
    rig.hitSpheres = [{ z: 0, y: 3.3, r: 1.8 }, { z: 2.3, y: 3.4, r: 0.9 }];
  },

  cat(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 0.8, bodyW: 0.42, bodyH: 0.45, bodyL: 1.0, legH: 0.8, legT: 0.17, frontLegH: 0.85, backLegH: 0.8 });
    const neck = pivot(torso, 0, 0.15, 0.95);
    neck.rotation.x = -0.3;
    part(neck, GEO.sphere, a, 0.25, 0.25, 0.35, 0, 0, 0.15);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0.05, 0.45);
    head.rotation.x = 0.3;
    part(head, GEO.sphere, a, 0.28, 0.25, 0.32, 0, 0, 0.1);
    part(head, GEO.box, b, 0.2, 0.14, 0.2, 0, -0.06, 0.32);
    eyes(head, dark, 0.13, 0.08, 0.3, 0.035);
    part(head, GEO.cone, dark, 0.06, 0.12, 0.04, 0.17, 0.25, 0.0);
    part(head, GEO.cone, dark, 0.06, 0.12, 0.04, -0.17, 0.25, 0.0);
    part(head, GEO.cone, light, 0.035, 0.32, 0.035, 0.07, -0.25, 0.36, Math.PI);
    part(head, GEO.cone, light, 0.035, 0.32, 0.035, -0.07, -0.25, 0.36, Math.PI);
    const jaw = pivot(head, 0, -0.12, 0.15);
    part(jaw, GEO.box, b, 0.16, 0.06, 0.25, 0, 0, 0.1);
    rig.head = head; rig.jaw = jaw;
    tailChain(rig, torso, 0, 0.15, -0.95, 3, 0.35, 0.08, 0.85, 0.5);
    rig.hitSpheres = [{ z: 0, y: 1.05, r: 0.6 }, { z: 1.4, y: 1.25, r: 0.35 }];
  },

  phiomia(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 0.9, bodyW: 0.65, bodyH: 0.65, bodyL: 1.0, legH: 0.9, legT: 0.24 });
    const neck = pivot(torso, 0, 0.15, 0.95);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.2);
    part(head, GEO.sphere, a, 0.42, 0.42, 0.42, 0, 0, 0.15);
    eyes(head, dark, 0.3, 0.12, 0.35, 0.04);
    part(head, GEO.box, a, 0.05, 0.3, 0.3, 0.42, 0.05, 0);
    part(head, GEO.box, a, 0.05, 0.3, 0.3, -0.42, 0.05, 0);
    let t = pivot(head, 0, -0.1, 0.5);
    t.rotation.x = 0.5;
    part(t, GEO.cyl, b, 0.13, 0.35, 0.13, 0, -0.15, 0);
    rig.tail.push(t);
    part(head, GEO.cone, light, 0.05, 0.2, 0.05, 0.15, -0.3, 0.5, 2.6);
    part(head, GEO.cone, light, 0.05, 0.2, 0.05, -0.15, -0.3, 0.5, 2.6);
    rig.head = head; rig.jaw = null;
    tailChain(rig, torso, 0, 0.2, -0.95, 2, 0.25, 0.07, 0.8, 0.8);
    rig.hitSpheres = [{ z: 0, y: 1.3, r: 0.8 }, { z: 1.2, y: 1.3, r: 0.45 }];
  },

  bird(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = pivot(rig.body, 0, 0.9, 0);
    torso.rotation.x = -0.35;
    part(torso, GEO.sphere, a, 0.38, 0.4, 0.7, 0, 0, 0);
    part(torso, GEO.box, a, 0.4, 0.05, 0.5, 0, 0, -0.85); // tail feathers
    rig.tail.push(torso.children[torso.children.length - 1]);
    for (const sx of [1, -1]) {
      const w = pivot(torso, 0.3 * sx, 0.15, 0.15);
      part(w, GEO.box, a, 1.4, 0.06, 0.6, 0.7 * sx, 0, -0.1);
      const w2 = pivot(w, 1.4 * sx, 0, 0);
      part(w2, GEO.box, a, 1.4, 0.04, 0.45, 0.65 * sx, 0, -0.15);
      part(w2, GEO.box, b, 0.6, 0.03, 0.35, 1.2 * sx, 0, -0.2);
      w.userData.tip = w2;
      w.userData.side = sx;
      rig.wings.push(w);
    }
    const neck = pivot(torso, 0, 0.25, 0.6);
    neck.rotation.x = -0.2;
    part(neck, GEO.sphere, light, 0.2, 0.2, 0.3, 0, 0.05, 0.1);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0.1, 0.35);
    head.rotation.x = 0.5;
    part(head, GEO.sphere, b, 0.18, 0.18, 0.22, 0, 0, 0.05);
    eyes(head, dark, 0.11, 0.05, 0.12, 0.03);
    part(head, GEO.cone, dark, 0.07, 0.25, 0.07, 0, -0.03, 0.3, Math.PI / 2 + 0.5);
    rig.head = head; rig.jaw = null;
    leg(rig, rig.body, 0.15, 0.55, -0.05, 0.3, 0.3, 0.1, { phase: 0, footLen: 1.4 });
    leg(rig, rig.body, -0.15, 0.55, -0.05, 0.3, 0.3, 0.1, { phase: Math.PI, footLen: 1.4 });
    rig.hitSpheres = [{ z: 0, y: 0.95, r: 0.6 }, { z: 0.7, y: 1.3, r: 0.25 }];
    rig.gait = 'biped';
    rig.flyer = true;
  },

  ptero(def, m, rig) {
    const { a, b, dark } = rig.mats;
    const torso = pivot(rig.body, 0, 0.9, 0);
    torso.rotation.x = -0.4;
    part(torso, GEO.sphere, a, 0.22, 0.24, 0.55, 0, 0, 0);
    const wm = new THREE.MeshLambertMaterial({ color: rig.mats.a.color, flatShading: true, side: THREE.DoubleSide });
    for (const sx of [1, -1]) {
      const w = pivot(torso, 0.15 * sx, 0.1, 0.25);
      part(w, GEO.box, a, 1.4, 0.05, 0.08, 0.7 * sx, 0, 0);
      const mem = part(w, GEO.tri, wm, 1.4 * sx, 1, -0.9, 0, 0, 0.02);
      mem.castShadow = true;
      const w2 = pivot(w, 1.4 * sx, 0, 0);
      part(w2, GEO.box, a, 1.6, 0.04, 0.06, 0.8 * sx, 0, 0);
      part(w2, GEO.tri, wm, 1.6 * sx, 1, -0.8, 0, 0, 0.02);
      w.userData.tip = w2;
      w.userData.side = sx;
      rig.wings.push(w);
    }
    const neck = pivot(torso, 0, 0.12, 0.5);
    neck.rotation.x = -0.4;
    part(neck, GEO.sphere, a, 0.1, 0.1, 0.3, 0, 0, 0.15);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.4);
    head.rotation.x = 0.7;
    part(head, GEO.sphere, a, 0.12, 0.14, 0.16, 0, 0, 0);
    eyes(head, dark, 0.08, 0.04, 0.05, 0.025);
    part(head, GEO.cone, b, 0.05, 0.8, 0.05, 0, 0.12, -0.35, -1.9);
    const jaw = pivot(head, 0, -0.03, 0.08);
    part(head, GEO.cone, b, 0.05, 0.7, 0.05, 0, 0.0, 0.42, Math.PI / 2);
    part(jaw, GEO.cone, b, 0.04, 0.6, 0.04, 0, -0.03, 0.3, Math.PI / 2);
    rig.head = head; rig.jaw = jaw;
    leg(rig, rig.body, 0.1, 0.55, -0.15, 0.3, 0.28, 0.06, { phase: 0 });
    leg(rig, rig.body, -0.1, 0.55, -0.15, 0.3, 0.28, 0.06, { phase: Math.PI });
    rig.hitSpheres = [{ z: 0, y: 0.95, r: 0.5 }, { z: 0.7, y: 1.4, r: 0.3 }];
    rig.gait = 'biped';
    rig.flyer = true;
  },

  croc(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = BUILDERS.quadruped(def, m, rig, { hipY: 0.45, bodyW: 0.75, bodyH: 0.42, bodyL: 1.6, legH: 0.45, legT: 0.17 });
    for (const L of rig.legs) L.hip.position.x *= 1.25;
    for (let i = 0; i < 7; i++) part(torso, GEO.box, b, 0.4, 0.06, 0.15, 0, 0.4, 1.2 - i * 0.4);
    const neck = pivot(torso, 0, 0, 1.5);
    rig.neck.push(neck);
    const head = pivot(neck, 0, 0, 0.1);
    part(head, GEO.box, a, 0.48, 0.3, 0.5, 0, 0.02, 0.2);
    part(head, GEO.box, a, 0.26, 0.14, 1.5, 0, 0.0, 1.1);
    eyes(head, dark, 0.17, 0.2, 0.25, 0.045);
    const jaw = pivot(head, 0, -0.1, 0.3);
    part(jaw, GEO.box, b, 0.24, 0.08, 1.6, 0, -0.03, 0.8);
    for (let i = 0; i < 6; i++) part(jaw, GEO.cone, light, 0.02, 0.06, 0.02, 0.1, 0.04, 0.2 + i * 0.25);
    rig.head = head; rig.jaw = jaw;
    tailChain(rig, torso, 0, 0.05, -1.5, 5, 0.9, 0.35, 0.78, 0.0);
    rig.hitSpheres = [{ z: 0, y: 0.6, r: 0.85 }, { z: 2.2, y: 0.5, r: 0.45 }, { z: -2.2, y: 0.45, r: 0.45 }];
  },

  turtle(def, m, rig) {
    const { a, b, dark } = rig.mats;
    const torso = pivot(rig.body, 0, 0.5, 0);
    part(torso, GEO.sphere, b, 1.3, 0.75, 1.55, 0, 0.15, 0);
    part(torso, GEO.cyl, a, 1.3, 0.15, 1.55, 0, -0.05, 0);
    for (let i = 0; i < 5; i++) part(torso, GEO.sphere, a, 0.4, 0.15, 0.4, Math.cos(i * 1.256) * 0.6, 0.78, Math.sin(i * 1.256) * 0.7);
    for (const [x, z, ph] of [[1, 1, 0], [-1, 1, Math.PI], [1, -1, Math.PI], [-1, -1, 0]]) {
      const hip = pivot(rig.body, 1.0 * x, 0.45, 0.9 * z);
      part(hip, GEO.sphere, a, 0.25, 0.35, 0.3, 0.1 * x, -0.2, 0);
      rig.legs.push({ hip, knee: null, phase: ph, side: x, front: z > 0 });
    }
    const neck = pivot(torso, 0, 0.0, 1.45);
    rig.neck.push(neck);
    part(neck, GEO.sphere, a, 0.25, 0.25, 0.4, 0, 0, 0.2);
    const head = pivot(neck, 0, 0.05, 0.5);
    part(head, GEO.sphere, a, 0.28, 0.25, 0.35, 0, 0, 0.1);
    eyes(head, dark, 0.18, 0.08, 0.25, 0.04);
    rig.head = head; rig.jaw = null;
    rig.hitSpheres = [{ z: 0, y: 0.8, r: 1.45 }, { z: 1.9, y: 0.6, r: 0.35 }];
    rig.gait = 'quad';
  },

  snake(def, m, rig) {
    const { a, b, dark } = rig.mats;
    let p = pivot(rig.body, 0, 0.35, 3.5);
    rig.head = pivot(p, 0, 0, 0);
    part(rig.head, GEO.box, a, 0.55, 0.35, 0.8, 0, 0.05, 0.35);
    eyes(rig.head, dark, 0.22, 0.17, 0.5, 0.05);
    rig.jaw = pivot(rig.head, 0, -0.1, 0.1);
    part(rig.jaw, GEO.box, b, 0.45, 0.08, 0.7, 0, -0.04, 0.3);
    rig.segments = [];
    for (let i = 0; i < 16; i++) {
      const seg = pivot(rig.body, 0, 0.32, 3.2 - i * 0.5);
      const r = 0.4 * (1 - Math.max(0, i - 9) / 8);
      part(seg, GEO.sphere, i % 3 ? a : b, r, r * 0.85, 0.42, 0, 0, 0);
      rig.segments.push(seg);
    }
    rig.hitSpheres = [{ z: 3.5, y: 0.4, r: 0.5 }, { z: 1.5, y: 0.35, r: 0.5 }, { z: -1, y: 0.35, r: 0.5 }, { z: -3.5, y: 0.3, r: 0.45 }];
    rig.gait = 'snake';
  },

  scorpion(def, m, rig) {
    const { a, b, dark } = rig.mats;
    const torso = pivot(rig.body, 0, 0.55, 0);
    part(torso, GEO.sphere, a, 0.55, 0.28, 0.85, 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      for (const sx of [1, -1]) {
        const hip = pivot(torso, 0.45 * sx, -0.05, 0.4 - i * 0.3);
        hip.rotation.y = sx * (0.3 - i * 0.25);
        part(hip, GEO.box, b, 0.6, 0.06, 0.06, 0.3 * sx, 0.1, 0, 0, 0, 0.5 * sx);
        part(hip, GEO.box, b, 0.06, 0.55, 0.06, 0.6 * sx, -0.15, 0, 0, 0, -0.25 * sx);
        rig.legs.push({ hip, knee: null, phase: (i % 2 ? Math.PI : 0) + (sx > 0 ? 0 : Math.PI), side: sx, insect: true });
      }
    }
    for (const sx of [1, -1]) {
      const arm = pivot(torso, 0.35 * sx, 0, 0.8);
      arm.rotation.y = -0.35 * sx;
      part(arm, GEO.box, a, 0.12, 0.12, 0.6, 0, 0, 0.3);
      part(arm, GEO.sphere, b, 0.2, 0.15, 0.3, 0, 0, 0.75);
      rig.arms.push(arm);
    }
    let t = pivot(torso, 0, 0.1, -0.8);
    t.rotation.x = 0.6;
    for (let i = 0; i < 5; i++) {
      part(t, GEO.sphere, a, 0.17 - i * 0.015, 0.17 - i * 0.015, 0.25, 0, 0, -0.18);
      rig.tail.push(t);
      t = pivot(t, 0, 0, -0.35);
      t.rotation.x = -0.65;
    }
    part(t, GEO.cone, dark, 0.07, 0.3, 0.07, 0, -0.1, 0.05, Math.PI * 0.8);
    rig.head = torso; rig.jaw = null;
    rig.hitSpheres = [{ z: 0, y: 0.6, r: 0.75 }, { z: -0.8, y: 1.3, r: 0.4 }];
    rig.gait = 'insect';
  },

  spider(def, m, rig) {
    const { a, b } = rig.mats;
    const torso = pivot(rig.body, 0, 0.6, 0);
    part(torso, GEO.sphere, a, 0.35, 0.28, 0.38, 0, 0, 0.25);
    part(torso, GEO.sphere, a, 0.55, 0.45, 0.65, 0, 0.15, -0.6);
    part(torso, GEO.box, b, 0.3, 0.05, 0.3, 0, 0.6, -0.6);
    eyes(torso, rig.mats.dark, 0.1, 0.1, 0.6, 0.05);
    for (let i = 0; i < 4; i++) {
      for (const sx of [1, -1]) {
        const hip = pivot(torso, 0.25 * sx, 0.05, 0.4 - i * 0.15);
        hip.rotation.y = sx * (0.6 - i * 0.4);
        part(hip, GEO.box, a, 0.7, 0.06, 0.06, 0.35 * sx, 0.25, 0, 0, 0, 0.7 * sx);
        part(hip, GEO.box, a, 0.06, 0.95, 0.06, 0.75 * sx, 0.05, 0, 0, 0, -0.35 * sx);
        rig.legs.push({ hip, knee: null, phase: (i % 2 ? Math.PI : 0) + (sx > 0 ? 0 : Math.PI), side: sx, insect: true });
      }
    }
    rig.head = torso; rig.jaw = null;
    rig.hitSpheres = [{ z: -0.3, y: 0.7, r: 0.8 }];
    rig.gait = 'insect';
  },

  shark(def, m, rig) {
    const { a, b, dark, light } = rig.mats;
    const torso = pivot(rig.body, 0, 0, 0);
    part(torso, GEO.sphere, a, 0.85, 0.95, 2.6, 0, 0, 0);
    part(torso, GEO.sphere, b, 0.7, 0.55, 2.3, 0, -0.38, 0.1);
    part(torso, GEO.box, a, 0.08, 1.1, 0.8, 0, 1.1, -0.2, -0.5);
    for (const sx of [1, -1]) part(torso, GEO.box, a, 1.0, 0.06, 0.5, 0.95 * sx, -0.35, 0.6, 0, 0.3 * sx, -0.4 * sx);
    const head = pivot(torso, 0, 0, 2.0);
    part(head, GEO.sphere, a, 0.6, 0.6, 0.9, 0, 0.05, 0.4);
    eyes(head, dark, 0.45, 0.15, 0.55, 0.06);
    const jaw = pivot(head, 0, -0.3, 0.2);
    part(jaw, GEO.box, b, 0.6, 0.15, 0.7, 0, 0, 0.25);
    for (let i = 0; i < 6; i++) part(jaw, GEO.cone, light, 0.04, 0.1, 0.04, -0.25 + i * 0.1, 0.1, 0.55);
    rig.head = head; rig.jaw = jaw;
    let t = pivot(torso, 0, 0.05, -2.2);
    part(t, GEO.sphere, a, 0.35, 0.4, 0.8, 0, 0, -0.5);
    rig.tail.push(t);
    t = pivot(t, 0, 0, -1.2);
    part(t, GEO.box, a, 0.08, 1.6, 0.5, 0, 0.3, -0.1, -0.4);
    part(t, GEO.box, a, 0.08, 0.9, 0.4, 0, -0.35, 0, 0.5);
    rig.tail.push(t);
    rig.hitSpheres = [{ z: 0, y: 0, r: 1.2 }, { z: 2.2, y: 0, r: 0.8 }, { z: -2.2, y: 0, r: 0.6 }];
    rig.gait = 'swim';
  },

  fish(def, m, rig) {
    const { a, b, dark } = rig.mats;
    const torso = pivot(rig.body, 0, 0, 0);
    part(torso, GEO.sphere, a, 0.18, 0.25, 0.55, 0, 0, 0);
    part(torso, GEO.box, b, 0.03, 0.2, 0.25, 0, 0.25, 0);
    eyes(torso, dark, 0.13, 0.05, 0.4, 0.03);
    const t = pivot(torso, 0, 0, -0.5);
    part(t, GEO.box, b, 0.03, 0.4, 0.3, 0, 0, -0.15);
    rig.tail.push(t);
    rig.head = torso; rig.jaw = null;
    rig.hitSpheres = [{ z: 0, y: 0, r: 0.45 }];
    rig.gait = 'swim';
  },

  trilobite(def, m, rig) {
    const { a, b } = rig.mats;
    const torso = pivot(rig.body, 0, 0.18, 0);
    part(torso, GEO.sphere, a, 0.45, 0.16, 0.6, 0, 0, 0);
    for (let i = 0; i < 6; i++) part(torso, GEO.box, b, 0.85 - Math.abs(i - 2.5) * 0.12, 0.05, 0.08, 0, 0.12, 0.45 - i * 0.18);
    part(torso, GEO.sphere, b, 0.35, 0.12, 0.2, 0, 0.04, 0.5);
    rig.head = torso; rig.jaw = null;
    rig.hitSpheres = [{ z: 0, y: 0.2, r: 0.6 }];
    rig.gait = 'insect';
  },
};

function variedColor(hex, rand, amount = 0.08) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL((hsl.h + (rand() - 0.5) * amount + 1) % 1, Math.min(1, hsl.s * (0.8 + rand() * 0.4)), Math.min(1, hsl.l * (0.85 + rand() * 0.3)));
  return c;
}

export function buildCreatureModel(def, rand = Math.random) {
  const m = def.model;
  const rig = makeRig(def, { a: variedColor(m.color, rand), b: variedColor(m.color2, rand, 0.12) });
  const builder = BUILDERS[m.type];
  if (!builder) throw new Error(`No model builder for ${m.type}`);
  builder(def, m, rig);
  rig.scale = m.scale || 1;
  rig.root.scale.setScalar(rig.scale);
  rig.baseColors = [rig.mats.a.color.clone(), rig.mats.b.color.clone()];
  return rig;
}

// Animate a rig. state: { speed (m/s), moving, attack (0..1), dead, ko, flying, swimming, time }
export function animateRig(rig, def, s, dt) {
  const t = s.time;
  const scale = rig.scale;
  const stride = Math.max(0.0001, (rig.gait === 'quad' ? 1.5 : 1.2) * scale);
  rig.phase = (rig.phase || 0) + (s.speed / stride) * dt * Math.PI;
  const ph = rig.phase;
  const moveAmt = Math.min(1, s.speed / Math.max(0.5, def.walk || 1));
  const amp = 0.55 * Math.min(1.2, moveAmt);

  if (s.dead || s.ko) {
    for (const L of rig.legs) { L.hip.rotation.x = 0.4 * L.side; if (L.knee) L.knee.rotation.x = 0; }
    for (const w of rig.wings) w.rotation.z = 0.2 * (w.userData.side || 1);
    if (rig.jaw) rig.jaw.rotation.x = 0.25;
    return;
  }

  // legs
  for (const L of rig.legs) {
    const sw = Math.sin(ph + L.phase);
    if (L.insect) {
      L.hip.rotation.x = sw * 0.35 * moveAmt;
      L.hip.rotation.z = Math.max(0, Math.cos(ph + L.phase)) * 0.25 * moveAmt * L.side;
    } else {
      L.hip.rotation.x = sw * amp;
      if (L.knee) L.knee.rotation.x = Math.max(0, -Math.cos(ph + L.phase)) * amp * 1.1;
    }
  }
  // body bob
  if (rig.gait === 'biped' || rig.gait === 'quad') {
    rig.body.position.y = Math.abs(Math.sin(ph)) * 0.04 * moveAmt;
  }
  // tail sway
  for (let i = 0; i < rig.tail.length; i++) {
    const p = rig.tail[i];
    const sway = rig.gait === 'swim' ? 0.35 * (0.3 + moveAmt) : 0.08 + 0.1 * moveAmt;
    p.rotation.y = Math.sin(t * (rig.gait === 'swim' ? 6 : 2) + i * 0.7) * sway;
  }
  // snake slither
  if (rig.segments) {
    for (let i = 0; i < rig.segments.length; i++) {
      rig.segments[i].position.x = Math.sin(t * 3 * (0.3 + moveAmt) - i * 0.6) * 0.45;
    }
    rig.head.parent.position.x = Math.sin(t * 3 * (0.3 + moveAmt) + 0.6) * 0.3;
  }
  // head idle look / attack lunge
  const atk = s.attack || 0;
  if (rig.head && rig.neck.length) {
    rig.neck[0].rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - moveAmt);
  }
  if (rig.jaw) rig.jaw.rotation.x = atk > 0 ? Math.sin(atk * Math.PI) * 0.7 : Math.max(0, Math.sin(t * 0.5) * 0.05);
  if (rig.head && atk > 0 && rig.neck.length) rig.neck[0].rotation.x += 0; // lunge handled via body
  rig.body.position.z = atk > 0 ? Math.sin(atk * Math.PI) * 0.25 : 0;
  if (rig.frill) {
    const target = s.aggro ? 1 : 0.01;
    const cur = rig.frill.scale.x;
    rig.frill.scale.setScalar(cur + (target - cur) * Math.min(1, dt * 6));
  }
  for (const a of rig.arms) a.rotation.z = Math.sin(t * 3) * 0.05;
  // wings
  for (const w of rig.wings) {
    const side = w.userData.side || 1;
    if (s.flying) {
      const flap = Math.sin(t * (s.speed > 12 ? 9 : 5)) * 0.55;
      w.rotation.set(0, 0, flap * side);
      if (w.userData.tip) w.userData.tip.rotation.set(0, 0, flap * 0.6 * side);
    } else if (rig.flyer) {
      // folded along the body
      w.rotation.set(0, side * 1.45, -0.35 * side);
      if (w.userData.tip) w.userData.tip.rotation.set(0, side * 2.7, 0);
    } else {
      w.rotation.z = Math.sin(t * 8) * 0.1 * moveAmt * side;
    }
  }
  if (rig.flyer) {
    rig.body.rotation.x = s.flying ? 0.35 : 0;
    for (const L of rig.legs) if (s.flying) { L.hip.rotation.x = -1.2; if (L.knee) L.knee.rotation.x = 0.5; }
  }
}

export function flashRig(rig, amount) {
  // tint the creature red briefly when hit
  const [a, b] = rig.baseColors;
  rig.mats.a.color.copy(a).lerp(new THREE.Color(1, 0.15, 0.1), amount);
  rig.mats.b.color.copy(b).lerp(new THREE.Color(1, 0.15, 0.1), amount);
}
