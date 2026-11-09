import * as THREE from 'three';
import { mulberry32 } from '/shared/world.js';
import { Builder, patchFade } from './geo.js';

export function renderHeight(h) {
  return h <= 18 ? h : 18 + (h - 18) * 0.32;
}

const NEON = ['#ff2fa0', '#22f0ff', '#b14dff', '#ffe14d', '#ff6a3d', '#39ff88', '#ff4fd8'];

function mergeGeos(list0) {
  const list = list0.map((g) => {
    if (!g.index) return g;
    const ng = g.toNonIndexed();
    ng.userData.color = g.userData.color;
    return ng;
  });
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const c = g.userData.color || new THREE.Color(1, 1, 1);
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b;
    }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function colored(g, hex) {
  g.userData.color = new THREE.Color(hex);
  return g;
}

export function buildCity(scene, world, T) {
  const rnd = mulberry32(world.seed * 7 + 3);
  const { ROAD, BLOCK, CELL } = world.cfg;
  const S = world.size;
  const group = new THREE.Group();
  scene.add(group);
  const animated = [];

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshPhongMaterial({ color: 0x1b8aa6, specular: 0xffb3d9, shininess: 60, map: T.water, emissive: 0x0a2a44 }),
  );
  T.water.repeat.set(300, 300);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  water.receiveShadow = true;
  group.add(water);
  animated.push((t) => { T.water.offset.set(t * 0.004, t * 0.002); });

  const landX0 = -36, landX1 = S + 90, landZ0 = -36, landZ1 = S + 36;
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(landX1 - landX0 + 8, landZ1 - landZ0 + 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4f8, transparent: true, opacity: 0.55, fog: true }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set((landX0 + landX1) / 2, -0.55, (landZ0 + landZ1) / 2);
  group.add(foam);
  animated.push((t) => { foam.material.opacity = 0.4 + Math.sin(t * 1.3) * 0.15; foam.scale.setScalar(1 + Math.sin(t * 1.3) * 0.004); });

  T.sand.repeat.set((landX1 - landX0) / 64, (landZ1 - landZ0) / 64);
  const land = new THREE.Mesh(new THREE.BoxGeometry(landX1 - landX0, 2, landZ1 - landZ0), new THREE.MeshLambertMaterial({ map: T.sand }));
  land.position.set((landX0 + landX1) / 2, -1.02, (landZ0 + landZ1) / 2);
  land.receiveShadow = true;
  group.add(land);

  const roadGeo = new THREE.PlaneGeometry(ROAD, BLOCK);
  roadGeo.rotateX(-Math.PI / 2);
  const nSeg = world.roads.length * world.blocks.length / world.grid.length;
  const roadMesh = new THREE.InstancedMesh(roadGeo, new THREE.MeshLambertMaterial({ map: T.road }), nSeg * 2);
  roadMesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (const r of world.roads) {
    for (let j = 0; j < world.grid.length; j++) {
      const c = ROAD + j * CELL + BLOCK / 2;
      roadMesh.setMatrixAt(k++, m4.compose(v3.set(r, 0.01, c), q.identity(), one));
      roadMesh.setMatrixAt(k++, m4.compose(v3.set(c, 0.01, r), q.setFromAxisAngle(up, Math.PI / 2), one));
    }
  }
  roadMesh.count = k;
  group.add(roadMesh);

  const crossGeo = new THREE.PlaneGeometry(ROAD, ROAD);
  crossGeo.rotateX(-Math.PI / 2);
  const crossMesh = new THREE.InstancedMesh(crossGeo, new THREE.MeshLambertMaterial({ map: T.cross }), world.roads.length ** 2);
  crossMesh.receiveShadow = true;
  k = 0;
  for (const a of world.roads) for (const b of world.roads) crossMesh.setMatrixAt(k++, m4.compose(v3.set(a, 0.01, b), q.identity(), one));
  group.add(crossMesh);

  const blockGeo = new THREE.BoxGeometry(BLOCK, 0.15, BLOCK);
  blockGeo.translate(0, 0.075, 0);
  const byDistrict = {};
  for (const b of world.blocks) (byDistrict[b.district] ||= []).push(b);
  for (const [d, list] of Object.entries(byDistrict)) {
    const mesh = new THREE.InstancedMesh(blockGeo, new THREE.MeshLambertMaterial({ map: T.block[d] }), list.length);
    list.forEach((b, i) => mesh.setMatrixAt(i, m4.compose(v3.set(b.x0 + BLOCK / 2, 0, b.z0 + BLOCK / 2), q.identity(), one)));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const walls = new Builder();
  const roofs = new Builder();
  const trim = new Builder();
  const neon = new Builder();
  const pools = [];
  const pads = [];
  const glows = [];
  const tmpC = new THREE.Color();
  const heights = new Map();

  for (const b of world.buildings) {
    const hr = renderHeight(b.h);
    heights.set(b.id, hr);
    const base = new THREE.Color(b.color);
    const down = b.district === 'downtown';
    const sub = b.district === 'suburb';
    const cw = down ? 2.8 : sub ? 3.6 : 3.2;
    const chh = down ? 3.4 : sub ? 2.8 : 3.1;
    const wallC = base.clone().multiplyScalar(0.92);
    walls.box(b.x0, 0.15, b.z0, b.x1, hr, b.z1, wallC, { cellW: cw * 8, cellH: chh * 8, offU: Math.floor(rnd() * 8) / 8, offV: Math.floor(rnd() * 8) / 8, noTop: true });
    const roofC = tmpC.copy(base).lerp(new THREE.Color('#8a8088'), 0.6).clone();
    roofs.box(b.x0, hr - 0.01, b.z0, b.x1, hr, b.z1, roofC, { noSides: true, roofScale: 8 });
    const pc = base.clone().multiplyScalar(0.7);
    const p = 0.35, ph = sub ? 0.4 : 0.9;
    trim.box(b.x0, hr, b.z0, b.x1, hr + ph, b.z0 + p, pc);
    trim.box(b.x0, hr, b.z1 - p, b.x1, hr + ph, b.z1, pc);
    trim.box(b.x0, hr, b.z0 + p, b.x0 + p, hr + ph, b.z1 - p, pc);
    trim.box(b.x1 - p, hr, b.z0 + p, b.x1, hr + ph, b.z1 - p, pc);
    const mn = Math.min(b.w, b.d);
    let roof = b.roof;
    if (roof === 1 && (mn < 12 || hr < 14)) roof = 0;
    if (roof === 2 && mn < 9) roof = 3;
    if (roof === 1) {
      const s = Math.min(mn * 0.75, 16);
      pads.push([b.x, hr + 0.06, b.z, s]);
    } else if (roof === 2) {
      pools.push([b.x + b.w * 0.08, hr + 0.06, b.z, b.w * 0.5, b.d * 0.55]);
      trim.box(b.x - b.w * 0.38, hr, b.z - 1.2, b.x - b.w * 0.28, hr + 0.3, b.z + 1.2, new THREE.Color('#f2f2f2'));
    } else if (roof === 3) {
      const tx = b.x0 + 2 + rnd() * (b.w - 5), tz = b.z0 + 2 + rnd() * (b.d - 5);
      trim.box(tx, hr, tz, tx + 2.4, hr + 2.8, tz + 2.4, new THREE.Color('#7a5a44'));
      trim.box(tx - 0.1, hr + 2.8, tz - 0.1, tx + 2.5, hr + 3.2, tz + 2.5, new THREE.Color('#5a4030'));
      const sx = b.x1 - 4, sz = b.z1 - 4;
      trim.box(sx, hr, sz, sx + 2.6, hr + 2.4, sz + 2.2, base.clone().multiplyScalar(0.6));
    }
    if (roof === 0 || roof === 3 || roof === 1) {
      const n = sub ? 1 : 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const ax = b.x0 + 1.2 + rnd() * Math.max(0.1, b.w - 3.6), az = b.z0 + 1.2 + rnd() * Math.max(0.1, b.d - 3.4);
        if (roof === 1 && Math.abs(ax - b.x) < 6 && Math.abs(az - b.z) < 6) continue;
        trim.box(ax, hr, az, ax + 1.6, hr + 1.0, az + 1.2, new THREE.Color('#c9c9cf'));
        trim.box(ax + 0.3, hr + 1.0, az + 0.2, ax + 1.1, hr + 1.06, az + 1.0, new THREE.Color('#3a3a40'));
      }
    }
    if (b.neon) {
      const nc = new THREE.Color(NEON[Math.floor(rnd() * NEON.length)]);
      const nc2 = new THREE.Color(NEON[Math.floor(rnd() * NEON.length)]);
      const o = 0.18, t = 0.35;
      const y0 = hr - 1.1, y1 = y0 + t;
      neon.box(b.x0 - o, y0, b.z0 - o, b.x1 + o, y1, b.z0, nc, { noTop: false });
      neon.box(b.x0 - o, y0, b.z1, b.x1 + o, y1, b.z1 + o, nc);
      neon.box(b.x0 - o, y0, b.z0, b.x0, y1, b.z1, nc);
      neon.box(b.x1, y0, b.z0, b.x1 + o, y1, b.z1, nc);
      neon.box(b.x0 - o, hr + ph, b.z0 - o, b.x1 + o, hr + ph + 0.12, b.z0 + 0.1, nc2);
      neon.box(b.x0 - o, hr + ph, b.z1 - 0.1, b.x1 + o, hr + ph + 0.12, b.z1 + o, nc2);
      neon.box(b.x0 - o, hr + ph, b.z0, b.x0 + 0.1, hr + ph + 0.12, b.z1, nc2);
      neon.box(b.x1 - 0.1, hr + ph, b.z0, b.x1 + o, hr + ph + 0.12, b.z1, nc2);
      for (const [cx, cz] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
        neon.box(cx - 0.25, 1.5, cz - 0.25, cx + 0.25, hr - 1.2, cz + 0.25, nc2);
      }
      neon.box(b.x0 - o, 3.2, b.z0 - o, b.x1 + o, 3.5, b.z0, nc);
      neon.box(b.x0 - o, 3.2, b.z1, b.x1 + o, 3.5, b.z1 + o, nc);
      glows.push([b.x, b.z, b.w + 14, b.d + 14, nc]);
    }
  }

  const wallMat = patchFade(new THREE.MeshLambertMaterial({ map: T.facade, emissiveMap: T.facadeEmit, emissive: 0xffffff, emissiveIntensity: 0.95, vertexColors: true }));
  const wallMesh = new THREE.Mesh(walls.geometry(), wallMat);
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  group.add(wallMesh);
  const roofMat = patchFade(new THREE.MeshLambertMaterial({ map: T.roof, vertexColors: true }));
  const roofMesh = new THREE.Mesh(roofs.geometry(), roofMat);
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  group.add(roofMesh);
  const trimMesh = new THREE.Mesh(trim.geometry(), patchFade(new THREE.MeshLambertMaterial({ vertexColors: true })));
  trimMesh.castShadow = trimMesh.receiveShadow = true;
  group.add(trimMesh);
  const neonMat = patchFade(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  neonMat.color.setScalar(1.15);
  const neonMesh = new THREE.Mesh(neon.geometry(), neonMat);
  group.add(neonMesh);
  animated.push((t) => { neonMat.color.setScalar(1.1 + Math.sin(t * 2.1) * 0.06 + (Math.sin(t * 23) > 0.97 ? -0.45 : 0)); });

  const decal = (tex, list, fn, opts = {}) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex, ...opts });
    const mesh = new THREE.InstancedMesh(geo, patchFade(mat), Math.max(1, list.length));
    list.forEach((it, i) => mesh.setMatrixAt(i, fn(it)));
    mesh.count = list.length;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  decal(T.helipad, pads, ([x, y, z, s]) => m4.compose(v3.set(x, y, z), q.identity(), new THREE.Vector3(s, 1, s)));
  const poolMesh = decal(T.pool, pools, ([x, y, z, w, d]) => m4.compose(v3.set(x, y, z), q.identity(), new THREE.Vector3(w, 1, d)), { emissive: 0x0a4a66 });

  const glowGeo = new THREE.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ map: T.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, Math.max(1, glows.length));
  glows.forEach(([x, z, w, d, c], i) => {
    glowMesh.setMatrixAt(i, m4.compose(v3.set(x, 0.2, z), q.identity(), new THREE.Vector3(w, 1, d)));
    glowMesh.setColorAt(i, c);
  });
  glowMesh.count = glows.length;
  glowMesh.renderOrder = 2;
  group.add(glowMesh);

  buildProps(group, world, T, rnd, animated);
  buildBeach(group, world, rnd);

  const near = (x, z, r) => {
    let m = 0;
    const i0 = Math.floor((x - r - ROAD / 2) / CELL), i1 = Math.floor((x + r - ROAD / 2) / CELL);
    const j0 = Math.floor((z - r - ROAD / 2) / CELL), j1 = Math.floor((z + r - ROAD / 2) / CELL);
    for (let i = Math.max(0, i0); i <= Math.min(world.grid.length - 1, i1); i++) {
      for (let j = Math.max(0, j0); j <= Math.min(world.grid.length - 1, j1); j++) {
        for (const b of world.grid[i][j].buildings) {
          const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
          if (dx * dx + dz * dz < r * r) m = Math.max(m, heights.get(b.id));
        }
      }
    }
    return m;
  };

  return {
    group,
    maxHeightNear: near,
    update(t) { for (const f of animated) f(t); },
  };
}

function buildProps(group, world, T, rnd, animated) {
  const palms = world.props.filter((p) => p.type === 'palm');
  const trees = world.props.filter((p) => p.type === 'tree');
  const lamps = world.props.filter((p) => p.type === 'lamp');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();

  const PH = 8;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, PH, 6, 4);
  trunkGeo.translate(0, PH / 2, 0);
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) / PH; tp.setX(i, tp.getX(i) + y * y * 1.2); }
  trunkGeo.computeVertexNormals();
  const leaves = new Builder();
  leaves.both = true;
  const green = [new THREE.Color('#2f8f3a'), new THREE.Color('#3fa548'), new THREE.Color('#2a7a35')];
  const topX = 1.2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.3;
    const L = 3.6 + rnd() * 0.8, W = 0.75;
    const dx = Math.sin(a), dz = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
    const pts = [0, 0.35, 0.7, 1].map((t) => [topX + dx * L * t, PH + 0.3 + Math.sin(t * Math.PI * 0.8) * 0.7 - t * t * 1.8, dz * L * t, W * Math.sin(Math.min(1, t * 1.3 + 0.15) * Math.PI) + 0.05]);
    const c = green[i % 3];
    for (let k = 0; k < 3; k++) {
      const [x0, y0, z0, w0] = pts[k], [x1, y1, z1, w1] = pts[k + 1];
      leaves.quad([x0 - px * w0, y0, z0 - pz * w0], [x0 + px * w0, y0, z0 + pz * w0], [x1 + px * w1, y1, z1 + pz * w1], [x1 - px * w1, y1, z1 - pz * w1], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
    }
  }
  leaves.both = false;
  leaves.box(topX - 0.35, PH - 0.3, -0.35, topX + 0.35, PH + 0.3, 0.35, new THREE.Color('#6b4a2a'));
  const crownGeo = leaves.geometry();
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), palms.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, patchFade(new THREE.MeshLambertMaterial({ vertexColors: true })), palms.length);
  palms.forEach((p, i) => {
    e.set(0, rnd() * Math.PI * 2, 0);
    m4.compose(v.set(p.x, 0.15, p.z), q.setFromEuler(e), s.setScalar(p.s));
    trunkMesh.setMatrixAt(i, m4);
    crownMesh.setMatrixAt(i, m4);
    crownMesh.setColorAt(i, col.setHSL(0.28 + rnd() * 0.08, 0.6, 0.45 + rnd() * 0.15));
  });
  trunkMesh.castShadow = crownMesh.castShadow = true;
  group.add(trunkMesh, crownMesh);
  animated.push((t) => { crownMesh.material.color.setScalar(1); });

  const tTrunk = new THREE.CylinderGeometry(0.2, 0.3, 3, 5);
  tTrunk.translate(0, 1.5, 0);
  const crown = new THREE.IcosahedronGeometry(2.4, 0);
  crown.scale(1, 0.8, 1);
  crown.translate(0, 4.2, 0);
  const tm = new THREE.InstancedMesh(tTrunk, new THREE.MeshLambertMaterial({ color: 0x6b4a32 }), trees.length);
  const cm = new THREE.InstancedMesh(crown, patchFade(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), trees.length);
  trees.forEach((p, i) => {
    e.set(0, rnd() * 6, 0);
    m4.compose(v.set(p.x, 0.15, p.z), q.setFromEuler(e), s.setScalar(p.s));
    tm.setMatrixAt(i, m4);
    cm.setMatrixAt(i, m4);
    cm.setColorAt(i, col.setHSL(0.25 + rnd() * 0.1, 0.55, 0.3 + rnd() * 0.12));
  });
  tm.castShadow = cm.castShadow = true;
  group.add(tm, cm);

  const pole = colored(new THREE.CylinderGeometry(0.09, 0.13, 6.5, 6).translate(0, 3.25, 0), '#2d2a33');
  const arm = colored(new THREE.BoxGeometry(2.0, 0.12, 0.12).translate(1.0, 6.4, 0), '#2d2a33');
  const lampGeo = mergeGeos([pole, arm]);
  const headGeo = new THREE.BoxGeometry(0.9, 0.18, 0.45).translate(2.0, 6.3, 0);
  const lm = new THREE.InstancedMesh(lampGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), lamps.length);
  const hm = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), lamps.length);
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pm = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: T.glow, color: 0xffb066, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), lamps.length);
  const { BLOCK } = world.cfg;
  lamps.forEach((p, i) => {
    const bx = Math.floor((p.x - world.cfg.ROAD) / world.cfg.CELL), bz = Math.floor((p.z - world.cfg.ROAD) / world.cfg.CELL);
    const cx = world.cfg.ROAD + bx * world.cfg.CELL + BLOCK / 2, cz = world.cfg.ROAD + bz * world.cfg.CELL + BLOCK / 2;
    const ang = Math.atan2(-(p.z - cz), p.x - cx);
    e.set(0, ang, 0);
    m4.compose(v.set(p.x, 0.15, p.z), q.setFromEuler(e), s.setScalar(1));
    lm.setMatrixAt(i, m4);
    hm.setMatrixAt(i, m4);
    const hx = p.x + Math.cos(ang) * 2, hz = p.z - Math.sin(ang) * 2;
    pm.setMatrixAt(i, new THREE.Matrix4().compose(v.set(hx, 0.22, hz), q.identity(), s.set(13, 1, 13)));
  });
  pm.renderOrder = 2;
  group.add(lm, hm, pm);
}

function buildBeach(group, world, rnd) {
  const S = world.size;
  const n = 46;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const top = new THREE.ConeGeometry(1.8, 0.7, 8).translate(0, 2.4, 0);
  const stick = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4).translate(0, 1.2, 0);
  const towel = new THREE.BoxGeometry(1, 0.04, 2).translate(1.6, 0.02, 0.5);
  const um = new THREE.InstancedMesh(top, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
  const sm = new THREE.InstancedMesh(stick, new THREE.MeshLambertMaterial({ color: 0xdddddd }), n);
  const tm = new THREE.InstancedMesh(towel, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const cols = ['#ff4f8b', '#22d3ee', '#ffd23f', '#ffffff', '#ff8c3a', '#a78bfa'];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const side = i < 30 ? 0 : 1;
    const x = side === 0 ? S + 12 + rnd() * 60 : -30 + rnd() * 20;
    const z = side === 0 ? 10 + rnd() * (S - 20) : 20 + rnd() * (S - 40);
    m4.compose(v.set(x, -0.02, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), s);
    um.setMatrixAt(i, m4); sm.setMatrixAt(i, m4); tm.setMatrixAt(i, m4);
    um.setColorAt(i, c.set(cols[i % cols.length]));
    tm.setColorAt(i, c.set(cols[(i + 2) % cols.length]));
  }
  um.castShadow = true;
  group.add(um, sm, tm);
}
