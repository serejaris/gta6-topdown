import * as THREE from 'three';
import { CAR_TYPES } from '/shared/world.js';
import { Builder } from './geo.js';
import { textSprite } from './textures.js';

const HS = 1.6;
const SHIRTS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8338ec', '#ff70a6'];
const PANTS = ['#264653', '#3d405b', '#6b705c', '#1d3557', '#5c4033', '#2b2d42'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

const geoCache = {};
function boxGeo(w, h, d, y = 0) {
  const k = `${w}|${h}|${d}|${y}`;
  if (!geoCache[k]) geoCache[k] = new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
  return geoCache[k];
}
const headGeo = new THREE.SphereGeometry(0.19, 8, 6);
const matCache = {};
function lam(hex) {
  if (!matCache[hex]) matCache[hex] = new THREE.MeshLambertMaterial({ color: hex });
  return matCache[hex];
}

export function makeHuman(T, opts) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.scale.setScalar(HS);
  const shirt = lam(opts.shirt), pants = lam(opts.pants), skin = lam(opts.skin);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.11, 0.85, 0);
  legR.position.set(0.11, 0.85, 0);
  legL.add(new THREE.Mesh(boxGeo(0.16, 0.85, 0.18, -0.42), pants));
  legR.add(new THREE.Mesh(boxGeo(0.16, 0.85, 0.18, -0.42), pants));
  const torso = new THREE.Mesh(boxGeo(0.46, 0.6, 0.26, 1.15), shirt);
  const shoulders = new THREE.Mesh(boxGeo(0.56, 0.14, 0.3, 1.4), shirt);
  const head = new THREE.Mesh(headGeo, skin);
  head.position.y = 1.65;
  const hair = new THREE.Mesh(boxGeo(0.3, 0.1, 0.32, 1.8), lam(opts.hair || '#2b1d14'));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.32, 1.42, 0);
  armR.position.set(0.32, 1.42, 0);
  armL.add(new THREE.Mesh(boxGeo(0.12, 0.6, 0.14, -0.3), shirt));
  armR.add(new THREE.Mesh(boxGeo(0.12, 0.6, 0.14, -0.3), shirt));
  const handL = new THREE.Mesh(boxGeo(0.12, 0.12, 0.12, -0.62), skin);
  const handR = new THREE.Mesh(boxGeo(0.12, 0.12, 0.12, -0.62), skin);
  armL.add(handL);
  armR.add(handR);
  const gun = new THREE.Group();
  gun.position.set(0, -0.62, 0.05);
  armR.add(gun);
  body.add(legL, legR, torso, shoulders, head, hair, armL, armR);
  if (opts.cop) {
    const cap = new THREE.Mesh(boxGeo(0.36, 0.1, 0.42, 1.86), lam('#101a3a'));
    body.add(cap);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false }));
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  g.add(shadow);
  const blood = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.blood, transparent: true, depthWrite: false }));
  blood.position.y = 0.04;
  blood.visible = false;
  blood.renderOrder = 1;
  g.add(blood);
  return { g, body, legL, legR, armL, armR, gun, shadow, blood, phase: Math.random() * 6, w: -1, deadT: 0 };
}

const GUN = [
  null,
  [[0.08, 0.1, 0.32, 0x222222]],
  [[0.09, 0.14, 0.42, 0x333333], [0.05, 0.2, 0.05, 0x222222]],
  [[0.08, 0.08, 0.9, 0x4a3020], [0.09, 0.09, 0.5, 0x222222]],
  [[0.16, 0.16, 1.1, 0x3d5a3d], [0.2, 0.2, 0.2, 0x222222]],
];

function setGun(h, w) {
  if (h.w === w) return;
  h.w = w;
  h.gun.clear();
  const def = GUN[w];
  if (!def) return;
  let z = 0.1;
  for (const [a, b, c, col] of def) {
    const m = new THREE.Mesh(boxGeo(a, b, c), lam('#' + col.toString(16).padStart(6, '0')));
    m.position.z = z + c / 2 - 0.1;
    h.gun.add(m);
  }
}

export function poseHuman(h, o, dt, t) {
  const sp = Math.min(Math.abs(o.v || 0), 9);
  h.g.position.set(o.x, 0.15, o.z);
  h.g.rotation.y = o.a || 0;
  if (o.dead) {
    h.deadT += dt;
    h.body.rotation.x = -Math.PI / 2;
    h.body.position.set(0, 0.25, -0.9);
    h.legL.rotation.x = 0.2; h.legR.rotation.x = -0.2;
    h.armL.rotation.set(0, 0, -1.4); h.armR.rotation.set(0, 0, 1.2);
    h.blood.visible = true;
    const s = Math.min(2.8, 0.6 + h.deadT * 1.4);
    h.blood.scale.set(s, 1, s);
    h.blood.position.z = -0.6;
    h.shadow.visible = false;
    setGun(h, 0);
    return;
  }
  h.deadT = 0;
  h.blood.visible = false;
  h.shadow.visible = true;
  h.body.rotation.x = 0;
  h.body.position.set(0, 0, 0);
  h.phase += dt * (2 + sp * 1.6);
  const amp = Math.min(0.9, sp * 0.18);
  const s = Math.sin(h.phase) * amp;
  h.legL.rotation.x = s;
  h.legR.rotation.x = -s;
  const w = o.w || 0;
  setGun(h, w);
  h.armL.rotation.set(-s * 0.8, 0, 0);
  if (w > 0) {
    h.armR.rotation.set(-Math.PI / 2 + 0.05, 0, 0.05);
    if (w >= 3) h.armL.rotation.set(-Math.PI / 2 + 0.3, 0, -0.5);
  } else {
    h.armR.rotation.set(s * 0.8, 0, 0);
  }
  h.body.position.y = Math.abs(Math.cos(h.phase)) * amp * 0.06;
}

export function pedLook(kind, id) {
  if (kind === 'cop') return { shirt: '#1f3f8f', pants: '#101a3a', skin: SKIN[hash(id) % SKIN.length], cop: true, hair: '#101010' };
  const k = (typeof kind === 'number' ? kind : 0) % 6;
  const hh = hash(id);
  return { shirt: SHIRTS[k], pants: PANTS[(k + hh) % PANTS.length], skin: SKIN[hh % SKIN.length], hair: ['#2b1d14', '#d9b26a', '#111', '#7a3b1e'][hh % 4] };
}

export function hash(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function makeNameTag(name, color) {
  const s = textSprite(name, color || '#ffffff', 40);
  s.scale.set(1.1 * s.userData.aspect, 1.1, 1);
  s.position.y = 3.4;
  return s;
}

export function makeMarker(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  ring.position.y = 0.06;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  arrow.position.set(0, 0.07, 1.9);
  arrow.scale.y = 0.2;
  g.add(ring, arrow);
  g.renderOrder = 3;
  return g;
}

const carGeoCache = {};
function carGeometry(type) {
  if (carGeoCache[type]) return carGeoCache[type];
  const ct = CAR_TYPES[type] || CAR_TYPES[0];
  const L = ct.len, W = ct.wid;
  const paint = new Builder(), fixed = new Builder(), lights = new Builder(), tail = new Builder();
  const C = (h) => new THREE.Color(h);
  const white = C('#ffffff');
  const glass = C('#1b2433'), tire = C('#151515'), chrome = C('#c8c8d0'), dark = C('#2a2a2e');
  const lowr = type === 5, sport = type === 1, van = type === 3;
  const y0 = lowr ? 0.25 : 0.4;
  const bodyH = van ? 1.1 : sport ? 0.55 : 0.65;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wx = sx * (W / 2 - 0.12), wz = sz * (L / 2 - (van ? 0.9 : 0.85));
    fixed.box(wx - 0.16, 0.0, wz - 0.36, wx + 0.16, 0.7, wz + 0.36, tire);
    if (lowr) fixed.box(wx - 0.18, 0.2, wz - 0.18, wx + 0.18, 0.5, wz + 0.18, chrome);
  }
  paint.box(-W / 2, y0, -L / 2, W / 2, y0 + bodyH, L / 2, white);
  fixed.box(-W / 2 - 0.02, y0 - 0.02, L / 2 - 0.15, W / 2 + 0.02, y0 + 0.2, L / 2 + 0.05, sport ? dark : chrome);
  fixed.box(-W / 2 - 0.02, y0 - 0.02, -L / 2 - 0.05, W / 2 + 0.02, y0 + 0.2, -L / 2 + 0.15, sport ? dark : chrome);
  let cabZ0, cabZ1, cabH;
  if (van) { cabZ0 = -L / 2 + 0.1; cabZ1 = L / 2 - 0.9; cabH = 1.0; }
  else if (sport) { cabZ0 = -L * 0.22; cabZ1 = L * 0.12; cabH = 0.45; }
  else if (lowr) { cabZ0 = -L * 0.2; cabZ1 = L * 0.12; cabH = 0.5; }
  else { cabZ0 = -L * 0.25; cabZ1 = L * 0.15; cabH = 0.6; }
  const cy = y0 + bodyH;
  const inset = 0.16;
  fixed.box(-W / 2 + inset, cy, cabZ0, W / 2 - inset, cy + cabH, cabZ1, glass);
  paint.box(-W / 2 + inset + 0.06, cy + cabH, cabZ0 + 0.18, W / 2 - inset - 0.06, cy + cabH + 0.08, cabZ1 - 0.25, white);
  lights.box(-W / 2 + 0.15, y0 + bodyH - 0.3, L / 2 - 0.02, -W / 2 + 0.55, y0 + bodyH - 0.1, L / 2 + 0.04, C('#fff6d8'));
  lights.box(W / 2 - 0.55, y0 + bodyH - 0.3, L / 2 - 0.02, W / 2 - 0.15, y0 + bodyH - 0.1, L / 2 + 0.04, C('#fff6d8'));
  tail.box(-W / 2 + 0.1, y0 + bodyH - 0.28, -L / 2 - 0.04, -W / 2 + 0.5, y0 + bodyH - 0.1, -L / 2 + 0.02, C('#ff1830'));
  tail.box(W / 2 - 0.5, y0 + bodyH - 0.28, -L / 2 - 0.04, W / 2 - 0.1, y0 + bodyH - 0.1, -L / 2 + 0.02, C('#ff1830'));
  if (sport) fixed.box(-W / 2 + 0.1, cy + 0.25, -L / 2 + 0.05, W / 2 - 0.1, cy + 0.33, -L / 2 + 0.45, dark);
  if (type === 2) fixed.box(-0.35, cy + cabH + 0.05, -0.2, 0.35, cy + cabH + 0.35, 0.15, C('#222'));
  if (lowr) fixed.box(-W / 2 - 0.03, y0 + 0.3, -L / 2 + 0.3, W / 2 + 0.03, y0 + 0.36, L / 2 - 0.3, chrome);
  const r = { paint: paint.geometry(), fixed: fixed.geometry(), lights: lights.geometry(), tail: tail.geometry(), roofY: cy + cabH + 0.08, L, W };
  carGeoCache[type] = r;
  return r;
}

const fixedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const wreckMat = new THREE.MeshLambertMaterial({ color: 0x141212 });

export function makeCar(T, type, color, cop) {
  const geo = carGeometry(type);
  const g = new THREE.Group();
  const paintMat = new THREE.MeshLambertMaterial({ color: cop ? '#f4f4f4' : color || '#cc3344' });
  const paint = new THREE.Mesh(geo.paint, paintMat);
  const fixed = new THREE.Mesh(geo.fixed, fixedMat);
  const lights = new THREE.Mesh(geo.lights, lightMat);
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const tail = new THREE.Mesh(geo.tail, tailMat);
  paint.castShadow = true;
  paint.receiveShadow = true;
  g.add(paint, fixed, lights, tail);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.glow, color: 0xfff0c8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.scale.set(4, 1, 8);
  beam.position.set(0, 0.05, geo.L / 2 + 4.3);
  beam.renderOrder = 2;
  g.add(beam);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(geo.W + 1.2, geo.L + 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false }));
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  g.add(shadow);
  const car = { g, paint, paintMat, fixed, lights, tail, tailMat, beam, type, cop, color, wreck: false, siren: null, smokeT: 0, px: null, pz: null };
  if (cop) {
    const sb = new THREE.Group();
    const red = new THREE.Mesh(boxGeo(0.55, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0xff1030, toneMapped: false }));
    const blue = new THREE.Mesh(boxGeo(0.55, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0x1060ff, toneMapped: false }));
    red.position.x = -0.32; blue.position.x = 0.32;
    sb.add(red, blue);
    sb.position.y = geo.roofY + 0.1;
    const stripe = new THREE.Mesh(boxGeo(geo.W + 0.04, 0.25, geo.L * 0.5), lam('#111522'));
    stripe.position.y = (type === 1 ? 0.4 : 0.4) + 0.35;
    g.add(sb, stripe);
    const glowR = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.glow, color: 0xff1030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glowB = glowR.clone();
    glowB.material = glowR.material.clone();
    glowB.material.color.set(0x1060ff);
    glowR.position.set(-2.5, 0.06, 0); glowB.position.set(2.5, 0.06, 0);
    glowR.renderOrder = glowB.renderOrder = 2;
    g.add(glowR, glowB);
    car.siren = { red, blue, glowR, glowB, bar: sb };
  }
  return car;
}

export function poseCar(car, o, dt, t) {
  car.g.position.set(o.x, 0, o.z);
  car.g.rotation.y = o.a || 0;
  const wreck = !!o.wreck;
  if (wreck !== car.wreck) {
    car.wreck = wreck;
    car.paint.material = wreck ? wreckMat : car.paintMat;
    car.fixed.material = wreck ? wreckMat : fixedMat;
    car.lights.visible = car.tail.visible = car.beam.visible = !wreck;
    if (car.siren) car.siren.bar.visible = !wreck;
  }
  if (!wreck && o.color && !car.cop && o.color !== car.color) { car.color = o.color; car.paintMat.color.set(o.color); }
  const v = o.v || 0;
  const braking = car.lastV != null && Math.abs(v) < Math.abs(car.lastV) - 0.05;
  car.lastV = v;
  car.tailMat.color.setScalar(braking || v < -0.3 ? 2.2 : 0.7);
  car.beam.visible = !wreck && (o.driver != null);
  if (car.siren && !wreck) {
    const on = !!o.siren;
    const ph = Math.floor(t * 6) % 2;
    car.siren.red.material.color.setScalar(on && ph === 0 ? 3 : 0.35).multiply(new THREE.Color(0xff1030));
    car.siren.blue.material.color.setScalar(on && ph === 1 ? 3 : 0.35).multiply(new THREE.Color(0x1060ff));
    car.siren.glowR.material.opacity = on && ph === 0 ? 0.75 : 0;
    car.siren.glowB.material.opacity = on && ph === 1 ? 0.75 : 0;
  }
}

export function makePickup(T, kind) {
  const g = new THREE.Group();
  const tex = T.pickup[kind] || T.pickup.cash;
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  icon.position.y = 1.2;
  icon.renderOrder = 4;
  const col = new THREE.Color(tex.userData.color);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.glow, color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 0.2;
  glow.renderOrder = 2;
  const beamMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
  ring.position.y = 1.2;
  g.add(glow, icon, ring);
  return { g, icon, glow, ring, beamMat };
}

export function posePickup(p, o, t) {
  p.g.position.set(o.x, 0.15, o.z);
  const ph = t * 2.2 + (o.x + o.z) * 0.1;
  p.icon.rotation.y = ph;
  p.icon.position.y = 1.2 + Math.sin(ph * 1.5) * 0.25;
  p.ring.position.y = p.icon.position.y;
  const s = 1 + Math.sin(ph * 3) * 0.08;
  p.ring.scale.set(s, s, s);
  p.glow.material.opacity = 0.55 + Math.sin(ph * 3) * 0.25;
}
