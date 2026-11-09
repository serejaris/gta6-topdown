import * as THREE from 'three';
import { makeTextures } from './render/textures.js';
import { buildCity } from './render/city.js';
import { fadeUniforms } from './render/geo.js';
import { createFx } from './render/fx.js';
import { makeHuman, poseHuman, pedLook, makeNameTag, makeMarker, makeCar, poseCar, makePickup, posePickup, disposeCar, disposePickup, disposeHuman } from './render/actors.js';
import { createQuality } from './render/quality.js';

const FOG = 0x6a3a78;

export function createRenderer(canvas, world) {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !params.has('noshadow');
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(0xb0507e, 60, 260);

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 900);
  camera.up.set(0, 0, -1);

  const hemi = new THREE.HemisphereLight(0xffa6d8, 0x4a2a5a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb070, 2.3);
  const sunDir = new THREE.Vector3(-0.7, 0.75, 0.35).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x6a8cff, 0.45);
  rim.position.set(1, 1, -0.6);
  scene.add(rim);

  const T = makeTextures();
  T.road.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const city = buildCity(scene, world, T);
  const fx = createFx(scene, T);

  const allowBloom = !params.has('nobloom');
  const allowShadow = !params.has('noshadow');
  let composer = null, composerLoading = false, useBloom = false;
  function loadComposer() {
    if (composer || composerLoading || !allowBloom) return;
    composerLoading = true;
    Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]).then(([a, b, c, d]) => {
      const comp = new a.EffectComposer(renderer);
      comp.addPass(new b.RenderPass(scene, camera));
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      const bloom = new c.UnrealBloomPass(new THREE.Vector2(sz.x / 2, sz.y / 2), 0.55, 0.45, 0.82);
      const bloomSetSize = bloom.setSize.bind(bloom);
      bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
      comp.addPass(bloom);
      comp.addPass(new d.OutputPass());
      composer = comp;
      resize();
    }).catch(() => { composer = null; });
  }

  let dprCap = 2;
  function applyQuality(L) {
    dprCap = L.dpr;
    useBloom = allowBloom && L.bloom;
    if (useBloom) loadComposer();
    const cast = allowShadow && L.shadow > 0;
    if (cast && sun.shadow.mapSize.x !== L.shadow) {
      sun.shadow.mapSize.set(L.shadow, L.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    sun.castShadow = cast;
    resize();
  }

  const peds = new Map(), players = new Map(), cars = new Map(), pickups = new Map();
  let marker = null, markerColor = null;
  const cam = { x: world.size / 2, z: world.size / 2, h: 40, ox: 0, oz: 0, init: false };
  const tmp = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let time = 0, stamp = 0;

  function sync(map, list, make, pose, dt, t, dispose) {
    stamp++;
    if (list) for (const o of list) {
      let e = map.get(o.id);
      if (!e) {
        e = make(o);
        if (!e) continue;
        map.set(o.id, e);
        scene.add(e.g);
      }
      e.g.visible = true;
      e.stamp = stamp;
      pose(e, o, dt, t);
    }
    for (const [id, e] of map) {
      if (e.stamp !== stamp) {
        scene.remove(e.g);
        map.delete(id);
        if (dispose) dispose(e);
      }
    }
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fx.setScale((h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360)));
  }
  const quality = createQuality(applyQuality, { bloom: allowBloom, shadow: allowShadow });

  function updateCamera(view, dt) {
    const me = view.me || {};
    let tx = me.x ?? cam.x - cam.ox, tz = me.z ?? cam.z - cam.oz, v = 0, a = me.a || 0;
    if (me.car != null) {
      const c = (view.cars || []).find((c) => c.id === me.car);
      if (c) { tx = c.x; tz = c.z; a = c.a; }
      v = Math.abs(me.v || (c && c.v) || 0);
    }
    const lead = me.car != null ? Math.min(v, 40) * 0.35 : 0;
    const lx = Math.sin(a) * lead, lz = Math.cos(a) * lead;
    let hh = me.car != null ? 45 + Math.min(1, v / 36) * 30 : 38;
    const tall = city.maxHeightNear(tx, tz, 26);
    hh = Math.max(hh, tall + 22);
    if (!cam.init) { cam.ox = lx; cam.oz = lz; cam.h = hh; cam.init = true; }
    const k = 1 - Math.exp(-dt * 4);
    cam.ox += (lx - cam.ox) * k;
    cam.oz += (lz - cam.oz) * k;
    cam.x = tx + cam.ox;
    cam.z = tz + cam.oz;
    cam.h += (hh - cam.h) * (1 - Math.exp(-dt * 1.6));
    const sh = fx.shake;
    const sx = (Math.random() - 0.5) * sh, sz = (Math.random() - 0.5) * sh;
    camera.position.set(cam.x + sx, cam.h, cam.z + sz);
    camera.lookAt(cam.x + sx, 0, cam.z + sz);
    fadeUniforms.uCam.value.copy(camera.position);
    fadeUniforms.uTarget.value.set(tx, 1.2, tz);
    fadeUniforms.uFadeR.value = me.car != null ? 9 : 6.5;
    scene.fog.near = cam.h + 10;
    scene.fog.far = cam.h + 220;
    const snap = 160 / sun.shadow.mapSize.x;
    const fx0 = Math.round(cam.x / snap) * snap, fz0 = Math.round(cam.z / snap) * snap;
    sun.target.position.set(fx0, 0, fz0);
    sun.position.set(fx0 + sunDir.x * 150, sunDir.y * 150, fz0 + sunDir.z * 150);
  }

  function makePed(o) { return makeHuman(T, pedLook(o.kind, o.id)); }
  function posePed(h, o, d, t) { poseHuman(h, o, d, t, o.kind === 'cop' ? 1 : 0); }

  function update(view, rawDt) {
    rawDt = rawDt > 0 ? rawDt : 0.016;
    quality.tick(rawDt);
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    const t = view.time ?? time;
    const me = view.me || {};
    city.update(t);
    updateCamera(view, Math.min(rawDt, 0.5));

    sync(peds, view.peds, makePed, posePed, dt, t);

    sync(players, view.players, (o) => {
      const h = makeHuman(T, { shirt: o.color || '#ffcc00', pants: '#1d2433', skin: '#e0ac69', hair: '#1b1410' });
      h.tag = makeNameTag(o.name || 'player', o.color);
      h.g.add(h.tag);
      return h;
    }, (h, o, d) => {
      const isMe = o.id === me.id;
      const src = isMe ? { ...o, ...me } : o;
      const inCar = src.car != null;
      poseHuman(h, src, d, t);
      h.body.visible = !inCar;
      if (inCar) {
        h.shadow.visible = false;
        h.blood.visible = false;
        const c = (view.cars || []).find((c) => c.id === src.car);
        if (c) h.g.position.set(c.x, 0.15, c.z);
      }
      const off = inCar ? 3.4 : 2.2, ra = h.g.rotation.y;
      h.tag.position.set(Math.sin(ra) * off, 4,-Math.cos(ra) * off);
    }, dt, t, disposeHuman);

    sync(cars, view.cars, (o) => makeCar(T, o.type | 0, o.color, !!o.cop || o.type === 4), (c, o, d) => {
      poseCar(c, o, d, t);
      if (o.wreck) fx.smoke(o.id, o.x, o.z, d, false);
      else if (o.hp != null && o.hp < 30) fx.smoke(o.id, o.x, o.z, d, o.hp < 12);
      if (c.px != null && !o.wreck) {
        const mx = o.x - c.px, mz = o.z - c.pz;
        const sp = Math.hypot(mx, mz) / Math.max(d, 1e-3);
        if (sp > 9) {
          const fwdx = Math.sin(o.a), fwdz = Math.cos(o.a);
          const lat = Math.abs((mx * fwdz - mz * fwdx) / Math.hypot(mx, mz));
          if (lat > 0.28) {
            const rx = -fwdx * 1.4, rz = -fwdz * 1.4, sxv = fwdz * 0.8, szv = -fwdx * 0.8;
            fx.skid(o.x + rx + sxv, o.z + rz + szv, o.a);
            fx.skid(o.x + rx - sxv, o.z + rz - szv, o.a);
          }
        }
      }
      c.px = o.x; c.pz = o.z;
    }, dt, t, disposeCar);

    sync(pickups, view.pickups, (o) => makePickup(T, o.kind), (p, o) => posePickup(p, o, t), dt, t, disposePickup);

    const myColor = (view.players || []).find((p) => p.id === me.id)?.color || '#3cffd0';
    if (!marker || markerColor !== myColor) {
      if (marker) scene.remove(marker);
      marker = makeMarker(myColor);
      markerColor = myColor;
      scene.add(marker);
    }
    let mx = me.x, mz = me.z;
    if (me.car != null) {
      const c = (view.cars || []).find((c) => c.id === me.car);
      if (c) { mx = c.x; mz = c.z; }
    }
    marker.visible = mx != null && !me.dead;
    if (marker.visible) {
      marker.position.set(mx, 0.15, mz);
      marker.rotation.y = me.a || 0;
      const s = (me.car != null ? 2.2 : 1) * (1 + Math.sin(t * 5) * 0.08);
      marker.scale.set(s, 1, s);
      marker.children[1].visible = me.car == null;
    }

    fx.update(dt);
    if (composer && useBloom) composer.render(dt);
    else renderer.render(scene, camera);
  }

  function screenToGround(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = -((clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const hit = ray.ray.intersectPlane(plane, tmp);
    return hit ? { x: hit.x, z: hit.z } : { x: cam.x, z: cam.z };
  }

  window.addEventListener('resize', resize);

  return {
    update,
    resize,
    effect: (ev) => fx.effect(ev),
    screenToGround,
    camera,
    scene,
    renderer,
    quality,
  };
}
