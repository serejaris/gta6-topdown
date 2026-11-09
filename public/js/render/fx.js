import * as THREE from 'three';
import { textSprite } from './textures.js';

function particleSystem(T, max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: T.particle }, scale: { value: 500 } },
    vertexShader: `attribute vec4 pcolor; attribute float psize; varying vec4 vC; uniform float scale;
void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vC;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 11 : 10;
  const P = [];
  for (let i = 0; i < max; i++) P.push({ life: 0 });
  let next = 0;
  return {
    pts, mat,
    spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, a1, drag = 0, grav = 0) {
      const p = P[next];
      next = (next + 1) % max;
      Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, s0, s1, c0, c1, a0, a1, drag, grav });
    },
    update(dt) {
      let n = 0;
      const c = new THREE.Color();
      for (const p of P) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; p.vz *= 1 - p.drag * dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.1) { p.y = 0.1; p.vy = 0; }
        const k = 1 - p.life / p.max;
        pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
        c.copy(p.c0).lerp(p.c1, k);
        col[n * 4] = c.r; col[n * 4 + 1] = c.g; col[n * 4 + 2] = c.b; col[n * 4 + 3] = p.a0 + (p.a1 - p.a0) * k;
        size[n] = p.s0 + (p.s1 - p.s0) * k;
        n++;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.pcolor.needsUpdate = true;
      geo.attributes.psize.needsUpdate = true;
    },
  };
}

function decalPool(scene, tex, max, opts = {}) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...opts });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  let next = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    mesh,
    add(x, y, z, sx, sz, rot) {
      mesh.setMatrixAt(next, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(sx, 1, sz)));
      next = (next + 1) % max;
      mesh.count = Math.min(max, Math.max(mesh.count, next === 0 ? max : next));
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

const C = (h) => new THREE.Color(h);
const FIRE0 = C('#fff2b0'), FIRE1 = C('#ff4a10'), SMOKE0 = C('#4a3a40'), SMOKE1 = C('#2a2230');
const SPARK0 = C('#fff8d0'), SPARK1 = C('#ff9a20'), BLOOD0 = C('#b0101a'), BLOOD1 = C('#5a0008');

export function createFx(scene, T) {
  const add = particleSystem(T, 2500, true);
  const norm = particleSystem(T, 2500, false);
  scene.add(add.pts, norm.pts);
  const blood = decalPool(scene, T.blood, 120);
  const scorch = decalPool(scene, T.scorch, 40);
  const skid = decalPool(scene, null, 600, { color: 0x101010, opacity: 0.45 });
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffaa55, 0, 30, 1.6);
    scene.add(l);
    lights.push({ l, life: 0, max: 1, peak: 0 });
  }
  let li = 0;
  const flash = (x, y, z, color, peak, life, dist) => {
    const L = lights[li];
    li = (li + 1) % lights.length;
    L.l.position.set(x, y, z);
    L.l.color.set(color);
    L.l.distance = dist;
    Object.assign(L, { life, max: life, peak });
  };
  const tracerGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const tracers = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false;
    m.renderOrder = 12;
    scene.add(m);
    tracers.push({ m, life: 0 });
  }
  let ti = 0;
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false;
    m.renderOrder = 12;
    scene.add(m);
    rings.push({ m, life: 0, r: 1 });
  }
  let ri = 0;
  const texts = [];
  const smokers = new Map();
  let shake = 0;

  const R = Math.random;
  function shot(ev) {
    const a = ev.a || 0, dx = Math.sin(a), dz = Math.cos(a);
    const dist = Math.max(0.5, ev.dist || 20);
    const x0 = ev.x + dx * 1.1, z0 = ev.z + dz * 1.1;
    const n = ev.w === 3 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const tr = tracers[ti];
      ti = (ti + 1) % tracers.length;
      const aa = a + (n > 1 ? (k - 1) * 0.08 : 0);
      tr.m.position.set(x0, 1.3, z0);
      tr.m.rotation.y = aa;
      tr.m.scale.set(ev.w === 4 ? 0.35 : 0.12, 1, dist);
      tr.m.material.color.set(ev.w === 4 ? 0xff8040 : 0xfff0a0);
      tr.m.visible = true;
      tr.life = tr.max = ev.w === 4 ? 0.25 : 0.07;
    }
    for (let k = 0; k < 5; k++) add.spawn(x0, 1.3, z0, dx * (4 + R() * 6) + (R() - 0.5) * 3, R() * 2, dz * (4 + R() * 6) + (R() - 0.5) * 3, 0.06 + R() * 0.05, 1.2, 0.3, FIRE0, FIRE1, 1, 0);
    add.spawn(x0, 1.3, z0, 0, 0, 0, 0.05, 2.2, 1.0, FIRE0, FIRE0, 1, 0);
    norm.spawn(x0, 1.3, z0, dx, 0.6, dz, 0.5, 0.5, 1.6, SMOKE0, SMOKE1, 0.35, 0, 1);
    flash(x0, 2, z0, 0xffcc66, ev.w === 4 ? 30 : 12, 0.06, 14);
  }
  function hit(ev) {
    const fleshy = ev.target === 'ped' || ev.target === 'player';
    const n = fleshy ? 12 : 10;
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, s = 2 + R() * 6;
      if (fleshy) norm.spawn(ev.x, 1.1, ev.z, Math.sin(a) * s * 0.5, 1 + R() * 3, Math.cos(a) * s * 0.5, 0.4 + R() * 0.3, 0.45, 0.3, BLOOD0, BLOOD1, 1, 0.6, 1, 12);
      else add.spawn(ev.x, 1.2, ev.z, Math.sin(a) * s, R() * 4, Math.cos(a) * s, 0.2 + R() * 0.2, 0.35, 0.1, SPARK0, SPARK1, 1, 0, 0.5, 15);
    }
    if (fleshy) blood.add(ev.x + (R() - 0.5), 0.2, ev.z + (R() - 0.5), 0.8 + R() * 0.8, 0.8 + R() * 0.8, R() * 6);
    else norm.spawn(ev.x, 1, ev.z, 0, 0.8, 0, 0.6, 0.4, 1.5, C('#8a8088'), C('#5a5060'), 0.4, 0, 1);
  }
  function explode(ev) {
    const r = ev.r || 7;
    for (let k = 0; k < 90; k++) {
      const a = R() * Math.PI * 2, s = R() * r * 2.2;
      add.spawn(ev.x, 0.8 + R() * 2, ev.z, Math.sin(a) * s, 2 + R() * 9, Math.cos(a) * s, 0.4 + R() * 0.6, 2.5 + R() * 2, 0.8, FIRE0, FIRE1, 1, 0, 2.2, 2);
    }
    for (let k = 0; k < 40; k++) {
      const a = R() * Math.PI * 2, s = R() * r;
      add.spawn(ev.x, 1, ev.z, Math.sin(a) * s * 4, 5 + R() * 12, Math.cos(a) * s * 4, 0.6 + R() * 0.6, 0.35, 0.15, SPARK0, SPARK1, 1, 0.2, 0.6, 18);
    }
    for (let k = 0; k < 45; k++) {
      const a = R() * Math.PI * 2, s = R() * r * 0.8;
      norm.spawn(ev.x + Math.sin(a) * s * 0.3, 1 + R() * 2, ev.z + Math.cos(a) * s * 0.3, Math.sin(a) * s, 3 + R() * 4, Math.cos(a) * s, 1.6 + R() * 1.6, 2.5, 7 + R() * 4, C('#3a2a2a'), C('#1e1a22'), 0.75, 0, 0.8);
    }
    const rg = rings[ri];
    ri = (ri + 1) % rings.length;
    rg.m.position.set(ev.x, 0.3, ev.z);
    rg.m.visible = true;
    rg.life = rg.max = 0.45;
    rg.r = r * 2.2;
    scorch.add(ev.x, 0.18, ev.z, r * 1.6, r * 1.6, R() * 6);
    flash(ev.x, 5, ev.z, 0xff7a30, 260, 0.8, 55);
    shake = Math.min(2.5, shake + 1.6);
  }
  function cash(ev) {
    const s = textSprite(`+$${ev.amount}`, '#5dff7a', 64, '#063010');
    s.scale.set(1.6 * s.userData.aspect, 1.6, 1);
    s.position.set(ev.x, 4, ev.z);
    scene.add(s);
    texts.push({ s, life: 1.6, max: 1.6 });
  }

  return {
    effect(ev) {
      if (!ev) return;
      if (ev.kind === 'shot') shot(ev);
      else if (ev.kind === 'hit') hit(ev);
      else if (ev.kind === 'explode') explode(ev);
      else if (ev.kind === 'cash') cash(ev);
    },
    smoke(id, x, z, dt, heavy) {
      let t = (smokers.get(id) || 0) - dt;
      while (t <= 0) {
        t += heavy ? 0.06 : 0.14;
        norm.spawn(x + (R() - 0.5) * 1.5, 1.2, z + (R() - 0.5) * 1.5, (R() - 0.3) * 1.5, 2.5 + R() * 2, (R() - 0.3) * 1.5, 2.5 + R(), 1, 5, C('#2e2830'), C('#1a1620'), 0.65, 0, 0.3);
        if (heavy && R() < 0.4) add.spawn(x + (R() - 0.5), 1, z + (R() - 0.5), 0, 2 + R() * 2, 0, 0.4, 1.6, 0.5, FIRE0, FIRE1, 0.9, 0);
      }
      smokers.set(id, t);
    },
    skid(x, z, a) {
      skid.add(x, 0.03, z, 0.32, 0.9, a);
    },
    blood(x, z, s) { blood.add(x, 0.2, z, s, s, R() * 6); },
    get shake() { return shake; },
    setScale(s) { add.mat.uniforms.scale.value = s; norm.mat.uniforms.scale.value = s; },
    update(dt) {
      add.update(dt);
      norm.update(dt);
      shake = Math.max(0, shake - dt * 3);
      for (const L of lights) {
        if (L.life > 0) { L.life -= dt; L.l.intensity = Math.max(0, L.peak * (L.life / L.max)); } else L.l.intensity = 0;
      }
      for (const tr of tracers) {
        if (tr.life > 0) { tr.life -= dt; tr.m.material.opacity = Math.max(0, tr.life / tr.max); if (tr.life <= 0) tr.m.visible = false; }
      }
      for (const rg of rings) {
        if (rg.life > 0) {
          rg.life -= dt;
          const k = 1 - rg.life / rg.max;
          rg.m.scale.setScalar(0.5 + rg.r * k);
          rg.m.material.opacity = 1 - k;
          if (rg.life <= 0) rg.m.visible = false;
        }
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life -= dt;
        t.s.position.y += dt * 3;
        t.s.material.opacity = Math.min(1, t.life / 0.5);
        if (t.life <= 0) { t.s.parent.remove(t.s); t.s.material.map.dispose(); t.s.material.dispose(); texts.splice(i, 1); }
      }
    },
  };
}
