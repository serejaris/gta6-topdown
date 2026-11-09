import { collideCircle, isRoad, WEAPONS, CAR_TYPES } from '/shared/world.js';

const INTERP_DELAY = 0.12;
const SEND_RATE = 1 / 15;
const FOOT_R = 0.45;
const WALK = 5;
const RUN = 8;
const ENTER_DIST = 3.8;
const TAU = Math.PI * 2;

const wrapAngle = (d) => ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now() / 1000;

function toMap(arr) {
  const m = new Map();
  if (Array.isArray(arr)) for (const e of arr) m.set(e.id, e);
  return m;
}

function interpList(m0, m1, t) {
  const out = [];
  for (const [id, b] of m1) {
    const a = m0 && m0.get(id);
    if (!a) { out.push({ ...b }); continue; }
    const o = { ...b };
    o.x = lerp(a.x, b.x, t);
    o.z = lerp(a.z, b.z, t);
    if (typeof a.a === 'number' && typeof b.a === 'number') o.a = a.a + wrapAngle(b.a - a.a) * t;
    out.push(o);
  }
  return out;
}

function carCircles(c) {
  const type = CAR_TYPES[c.type] || CAR_TYPES[0];
  const r = type.wid / 2 + 0.05;
  const off = Math.max(0, type.len / 2 - r);
  const fx = Math.sin(c.a), fz = Math.cos(c.a);
  return [
    { x: c.x + fx * off, z: c.z + fz * off, r },
    { x: c.x - fx * off, z: c.z - fz * off, r },
  ];
}

export function createGame({ world, net, bot = false }) {
  const snaps = [];
  let renderer = null;
  let sendTimer = 0;
  let fireCd = 0;
  let respawnAt = null;
  let respawnSentAt = -10;
  let adoptAfter = 0;
  let lastAdopt = -10;
  let pendingW = null;
  let pendingWUntil = 0;
  let enterSentAt = -10;
  let lastSrv = null;
  let basis = { ux: 0, uz: -1, rx: 1, rz: 0, leftSign: 1, t: -1 };

  const local = {
    have: false,
    x: 0, z: 0, a: 0, v: 0,
    car: null,
    cs: null,
    dead: false,
  };

  const view = {
    time: 0,
    world,
    me: { id: null, x: 0, z: 0, a: 0, v: 0, car: null, hp: 100, armor: 0, w: 1, ammo: 0, money: 0, wanted: 0, kills: 0, deaths: 0, dead: false, name: net?.name || '', aimX: 0, aimZ: 0 },
    players: [],
    cars: [],
    peds: [],
    pickups: [],
    nearCar: null,
    connected: false,
  };

  const botState = {
    target: null, prev: null, stuckT: 0, reverseT: 0, sideT: 0, sideDir: 1,
    lastX: 0, lastZ: 0, carTime: 0, footTime: 0, blacklist: new Map(), wanderTarget: null,
    weaponSet: false, lastEnter: -10, enterCar: null,
  };

  function setWorld(w) { world = w; view.world = w; }
  function setRenderer(r) { renderer = r; }

  function onWelcome(msg) {
    snaps.length = 0;
    local.have = false;
    local.car = null;
    local.cs = null;
    respawnAt = null;
    view.me.id = msg.id;
  }

  function adoptServerPose(srv) {
    local.x = srv.x;
    local.z = srv.z;
    local.a = srv.a || 0;
    local.v = 0;
    local.have = true;
    lastAdopt = now();
  }

  function initCarState(car) {
    local.cs = {
      id: car.id,
      type: car.type ?? 0,
      x: car.x, z: car.z, a: car.a || 0,
      vx: 0, vz: 0, vf: 0,
    };
    local.car = car.id;
  }

  function onSnap(msg) {
    const t = now();
    const s = {
      t,
      players: toMap(msg.players),
      cars: toMap(msg.cars),
      peds: toMap(msg.peds),
      pickups: msg.pickups || [],
    };
    snaps.push(s);
    while (snaps.length > 30) snaps.shift();
    const id = net?.id ?? view.me.id;
    const srv = s.players.get(id);
    if (!srv) return;
    lastSrv = srv;
    local.dead = !!srv.dead;

    if (!local.have || (adoptAfter && t >= adoptAfter && !srv.dead)) {
      adoptServerPose(srv);
      adoptAfter = 0;
      if (!srv.car) { local.car = null; local.cs = null; }
    }

    if (srv.dead) {
      if (respawnAt == null && t - respawnSentAt > 2) respawnAt = t + 3;
      if (local.car != null) { local.car = null; local.cs = null; }
      return;
    }

    if (srv.car != null && local.car !== srv.car) {
      const car = s.cars.get(srv.car);
      if (car) initCarState(car);
    } else if (srv.car == null && local.car != null) {
      const cs = local.cs;
      if (cs) {
        const type = CAR_TYPES[cs.type] || CAR_TYPES[0];
        const lx = Math.cos(cs.a) * basis.leftSign, lz = -Math.sin(cs.a) * basis.leftSign;
        let px = cs.x + lx * (type.wid / 2 + 1);
        let pz = cs.z + lz * (type.wid / 2 + 1);
        const r = collideCircle(world, px, pz, FOOT_R);
        local.x = r.x; local.z = r.z; local.a = cs.a;
      }
      local.car = null;
      local.cs = null;
    } else if (srv.car == null && local.car == null && local.have) {
      const dx = srv.x - local.x, dz = srv.z - local.z;
      if (dx * dx + dz * dz > 30 * 30 && t - lastAdopt > 2 && t - enterSentAt > 1) adoptServerPose(srv);
    }
  }

  function onEvent(ev) {
    const id = net?.id ?? view.me.id;
    if ((ev.kind === 'wasted' || ev.kind === 'busted') && ev.id === id) {
      if (respawnAt == null) respawnAt = now() + 3;
    }
  }

  function updateBasis(w, h) {
    const t = now();
    if (t - basis.t < 0.25 || !renderer?.screenToGround) return;
    basis.t = t;
    try {
      const cx = w / 2, cy = h / 2;
      const g0 = renderer.screenToGround(cx, cy);
      const gu = renderer.screenToGround(cx, cy - 100);
      const gr = renderer.screenToGround(cx + 100, cy);
      if (!g0 || !gu || !gr) return;
      let ux = gu.x - g0.x, uz = gu.z - g0.z;
      let rx = gr.x - g0.x, rz = gr.z - g0.z;
      const ul = Math.hypot(ux, uz), rl = Math.hypot(rx, rz);
      if (!(ul > 1e-6) || !(rl > 1e-6)) return;
      ux /= ul; uz /= ul; rx /= rl; rz /= rl;
      const det = ux * rz - uz * rx;
      basis = { ux, uz, rx, rz, leftSign: det >= 0 ? 1 : -1, t };
    } catch {}
  }

  function interpolate() {
    if (!snaps.length) return null;
    const rt = now() - INTERP_DELAY;
    let s0 = snaps[0], s1 = snaps[0];
    if (rt <= snaps[0].t) {
      s0 = s1 = snaps[0];
    } else if (rt >= snaps[snaps.length - 1].t) {
      s0 = s1 = snaps[snaps.length - 1];
    } else {
      for (let i = 0; i < snaps.length - 1; i++) {
        if (snaps[i].t <= rt && rt < snaps[i + 1].t) { s0 = snaps[i]; s1 = snaps[i + 1]; break; }
      }
    }
    const k = s1.t > s0.t ? clamp((rt - s0.t) / (s1.t - s0.t), 0, 1) : 1;
    return {
      players: interpList(s0.players, s1.players, k),
      cars: interpList(s0.cars, s1.cars, k),
      peds: interpList(s0.peds, s1.peds, k),
      pickups: snaps[snaps.length - 1].pickups,
    };
  }

  function humanIntent(inp) {
    const d = inp.down;
    const up = d.has('KeyW') || d.has('ArrowUp');
    const dn = d.has('KeyS') || d.has('ArrowDown');
    const lf = d.has('KeyA') || d.has('ArrowLeft');
    const rt = d.has('KeyD') || d.has('ArrowRight');
    const my = (up ? 1 : 0) - (dn ? 1 : 0);
    const mx = (rt ? 1 : 0) - (lf ? 1 : 0);
    let moveX = basis.ux * my + basis.rx * mx;
    let moveZ = basis.uz * my + basis.rz * mx;
    const ml = Math.hypot(moveX, moveZ);
    if (ml > 1e-6) { moveX /= ml; moveZ /= ml; }
    let aimX = null, aimZ = null;
    if (inp.mouseMoved && renderer?.screenToGround) {
      try {
        const g = renderer.screenToGround(inp.mouseX, inp.mouseY);
        if (g && Number.isFinite(g.x) && Number.isFinite(g.z)) { aimX = g.x; aimZ = g.z; }
      } catch {}
    }
    let weapon = null;
    for (let i = 1; i <= 5; i++) if (inp.pressed.has('Digit' + i) || inp.pressed.has('Numpad' + i)) weapon = i - 1;
    return {
      moveX, moveZ,
      run: d.has('ShiftLeft') || d.has('ShiftRight'),
      throttle: my,
      turn: ((lf ? 1 : 0) - (rt ? 1 : 0)) * basis.leftSign,
      handbrake: d.has('Space'),
      aimX, aimZ,
      fire: inp.mouseDown,
      enter: inp.pressed.has('KeyF') || inp.pressed.has('Enter') || inp.pressed.has('NumpadEnter'),
      weapon,
      weaponDelta: inp.wheel,
    };
  }

  function stepFoot(dt, it) {
    const speed = it.run ? RUN : WALK;
    const moving = Math.hypot(it.moveX, it.moveZ) > 0.1;
    if (moving) {
      local.x += it.moveX * speed * dt;
      local.z += it.moveZ * speed * dt;
    }
    let r = collideCircle(world, local.x, local.z, FOOT_R);
    local.x = r.x; local.z = r.z;
    for (const c of view.cars) {
      for (const cc of carCircles(c)) {
        const dx = local.x - cc.x, dz = local.z - cc.z;
        const rr = cc.r + FOOT_R;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) {
          const dd = Math.sqrt(d2);
          local.x = cc.x + dx / dd * rr;
          local.z = cc.z + dz / dd * rr;
        }
      }
    }
    r = collideCircle(world, local.x, local.z, FOOT_R);
    local.x = r.x; local.z = r.z;
    local.v = moving ? speed : 0;
    const ax = it.aimX ?? (moving ? local.x + it.moveX : null);
    const az = it.aimZ ?? (moving ? local.z + it.moveZ : null);
    if (ax != null) {
      const dx = ax - local.x, dz = az - local.z;
      if (dx * dx + dz * dz > 0.04) local.a = Math.atan2(dx, dz);
    }
  }

  function stepCar(dt, it) {
    const cs = local.cs;
    const type = CAR_TYPES[cs.type] || CAR_TYPES[0];
    let fx = Math.sin(cs.a), fz = Math.cos(cs.a);
    let lx = Math.cos(cs.a), lz = -Math.sin(cs.a);
    let vf = cs.vx * fx + cs.vz * fz;
    let vl = cs.vx * lx + cs.vz * lz;
    const hb = !!it.handbrake;
    const thr = it.throttle || 0;
    if (thr > 0) {
      if (vf < -0.5) vf += 30 * dt;
      else if (vf < type.maxSpeed) vf = Math.min(type.maxSpeed, vf + type.accel * (1.2 - 0.5 * Math.max(0, vf) / type.maxSpeed) * dt);
    } else if (thr < 0) {
      if (vf > 0.5) vf = Math.max(0, vf - 30 * dt);
      else vf = Math.max(-type.maxSpeed * 0.35, vf - type.accel * 0.6 * dt);
    } else {
      const drag = 3 + Math.abs(vf) * 0.08;
      vf = Math.sign(vf) * Math.max(0, Math.abs(vf) - drag * dt);
    }
    if (hb) vf = Math.sign(vf) * Math.max(0, Math.abs(vf) - 9 * dt);
    vl *= Math.exp(-(hb ? 1.1 : 8) * dt);
    cs.vx = fx * vf + lx * vl;
    cs.vz = fz * vf + lz * vl;

    const sp = Math.abs(vf);
    const steerGain = Math.min(1, sp / 5) * (1 - 0.4 * Math.min(1, sp / type.maxSpeed));
    const turnRate = 2.7 * (hb ? 1.6 : 1) * steerGain * Math.sign(vf || 1);
    cs.a = wrapAngle(cs.a + (it.turn || 0) * turnRate * dt);

    cs.x += cs.vx * dt;
    cs.z += cs.vz * dt;

    fx = Math.sin(cs.a); fz = Math.cos(cs.a);
    for (let pass = 0; pass < 2; pass++) {
      for (const cc of carCircles(cs)) {
        const r = collideCircle(world, cc.x, cc.z, cc.r);
        if (!r.hit) continue;
        cs.x += r.x - cc.x;
        cs.z += r.z - cc.z;
        const vn = cs.vx * r.nx + cs.vz * r.nz;
        if (vn < 0) {
          cs.vx -= 1.35 * vn * r.nx;
          cs.vz -= 1.35 * vn * r.nz;
          const loss = Math.max(0.55, 1 - Math.abs(vn) * 0.03);
          cs.vx *= loss; cs.vz *= loss;
          cs.a = wrapAngle(cs.a + (Math.random() - 0.5) * Math.min(0.25, Math.abs(vn) * 0.02));
        }
      }
    }
    for (const o of view.cars) {
      if (o.id === cs.id) continue;
      const dx0 = o.x - cs.x, dz0 = o.z - cs.z;
      if (dx0 * dx0 + dz0 * dz0 > 100) continue;
      for (const a of carCircles(cs)) {
        for (const b of carCircles(o)) {
          const dx = a.x - b.x, dz = a.z - b.z;
          const rr = a.r + b.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const push = (rr - d) * 0.8;
          cs.x += nx * push;
          cs.z += nz * push;
          const ovx = (o.v || 0) * Math.sin(o.a), ovz = (o.v || 0) * Math.cos(o.a);
          const rvn = (cs.vx - ovx) * nx + (cs.vz - ovz) * nz;
          if (rvn < 0) {
            cs.vx -= 1.2 * rvn * nx;
            cs.vz -= 1.2 * rvn * nz;
            cs.vx *= 0.9; cs.vz *= 0.9;
          }
        }
      }
    }
    fx = Math.sin(cs.a); fz = Math.cos(cs.a);
    cs.vf = cs.vx * fx + cs.vz * fz;
    local.x = cs.x; local.z = cs.z; local.a = cs.a; local.v = cs.vf;
  }

  function findNearCar() {
    if (local.car != null || local.dead) return null;
    let best = null, bd = ENTER_DIST * ENTER_DIST;
    for (const c of view.cars) {
      if (c.wreck) continue;
      const dx = c.x - local.x, dz = c.z - local.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = c.id; }
    }
    return best;
  }

  function nearestRoadNode(x, z) {
    const roads = world.roads;
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < roads.length; i++) {
      const d = Math.abs(roads[i] - x);
      if (d < bd) { bd = d; bi = i; }
    }
    bd = Infinity;
    for (let j = 0; j < roads.length; j++) {
      const d = Math.abs(roads[j] - z);
      if (d < bd) { bd = d; bj = j; }
    }
    return { i: bi, j: bj };
  }

  function nodeAhead(x, z, a) {
    const roads = world.roads;
    const fx = Math.sin(a), fz = Math.cos(a);
    const near = nearestRoadNode(x, z);
    let best = null, bd = Infinity;
    for (let i = Math.max(0, near.i - 2); i <= Math.min(roads.length - 1, near.i + 2); i++) {
      for (let j = Math.max(0, near.j - 2); j <= Math.min(roads.length - 1, near.j + 2); j++) {
        const dx = roads[i] - x, dz = roads[j] - z;
        const along = dx * fx + dz * fz;
        if (along < 6) continue;
        const d = Math.hypot(dx, dz) + Math.abs(dx * fz - dz * fx) * 2;
        if (d < bd) { bd = d; best = { i, j }; }
      }
    }
    return best || near;
  }

  function nextNode(cur, prev) {
    const n = world.roads.length;
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([di, dj]) => ({ i: cur.i + di, j: cur.j + dj }))
      .filter((o) => o.i >= 0 && o.j >= 0 && o.i < n && o.j < n && !(prev && o.i === prev.i && o.j === prev.j));
    if (prev) {
      const si = cur.i + (cur.i - prev.i), sj = cur.j + (cur.j - prev.j);
      const straight = opts.find((o) => o.i === si && o.j === sj);
      if (straight && Math.random() < 0.5) return straight;
    }
    return opts[Math.floor(Math.random() * opts.length)] || prev;
  }

  function nodePoint(node, from) {
    const roads = world.roads;
    let x = roads[node.i], z = roads[node.j];
    if (from) {
      let dx = x - roads[from.i], dz = z - roads[from.j];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      x += -dz * 4;
      z += dx * 4;
    }
    return { x, z };
  }

  function nearestPed(maxD) {
    let best = null, bd = maxD * maxD;
    for (const p of view.peds) {
      if (p.dead) continue;
      const dx = p.x - local.x, dz = p.z - local.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = p; }
    }
    return best;
  }

  function botIntent(dt) {
    const t = now();
    const b = botState;
    const it = { moveX: 0, moveZ: 0, run: true, throttle: 0, turn: 0, handbrake: false, aimX: null, aimZ: null, fire: false, enter: false, weapon: null, weaponDelta: 0 };
    if (local.dead || !local.have) return it;

    if (!b.weaponSet && view.me.w === 0) { it.weapon = 1; b.weaponSet = true; }

    if (local.car != null && local.cs) {
      b.carTime += dt;
      b.footTime = 0;
      const cs = local.cs;
      if (!b.target) {
        b.target = nodeAhead(cs.x, cs.z, cs.a);
        b.prev = nearestRoadNode(cs.x, cs.z);
        if (b.prev.i === b.target.i && b.prev.j === b.target.j) b.prev = null;
      }
      let p = nodePoint(b.target, b.prev);
      let dx = p.x - cs.x, dz = p.z - cs.z;
      if (Math.hypot(dx, dz) < 8) {
        const nx = nextNode(b.target, b.prev);
        b.prev = b.target;
        b.target = nx;
        p = nodePoint(b.target, b.prev);
        dx = p.x - cs.x; dz = p.z - cs.z;
      }
      const want = Math.atan2(dx, dz);
      const diff = wrapAngle(want - cs.a);
      const sp = cs.vf;
      if (b.reverseT > 0) {
        b.reverseT -= dt;
        it.throttle = -1;
        it.turn = -Math.sign(diff);
        if (b.reverseT <= 0) b.target = null;
      } else {
        it.turn = clamp(diff * 2.5, -1, 1);
        it.throttle = Math.abs(diff) > 0.7 && sp > 11 ? -1 : (sp > 22 ? 0 : 1);
        it.handbrake = Math.abs(diff) > 0.9 && sp > 14;
        if (sp < 1.5) b.stuckT += dt; else b.stuckT = 0;
        if (b.stuckT > 1.4) { b.stuckT = 0; b.reverseT = 1.1; }
      }
      const ped = nearestPed(20);
      if (ped) { it.aimX = ped.x; it.aimZ = ped.z; it.fire = Math.random() < 0.5; }
      if (b.carTime > 40 && Math.abs(sp) < 30) { it.enter = true; b.carTime = 0; b.target = null; }
      return it;
    }

    b.carTime = 0;
    b.target = null;
    b.footTime += dt;
    for (const [id, until] of b.blacklist) if (until < t) b.blacklist.delete(id);

    if (b.enterCar != null && t - b.lastEnter > 2) {
      b.blacklist.set(b.enterCar, t + 10);
      b.enterCar = null;
    }

    let goal = null;
    if (b.footTime > 2.5) {
      let bd = 150;
      let car = null;
      for (const c of view.cars) {
        if (c.wreck || b.blacklist.has(c.id)) continue;
        if (c.driver != null && c.driver !== 'npc') continue;
        const d = Math.hypot(c.x - local.x, c.z - local.z);
        const along = (local.x - c.x) * Math.sin(c.a) + (local.z - c.z) * Math.cos(c.a);
        const score = d + (Math.abs(c.v || 0) > 1.5 && along < 2 ? 100 : 0);
        if (score < bd) { bd = score; car = c; }
      }
      if (car) {
        const d = Math.hypot(car.x - local.x, car.z - local.z);
        const sp = Math.abs(car.v || 0);
        const fx = Math.sin(car.a), fz = Math.cos(car.a);
        const along = (local.x - car.x) * fx + (local.z - car.z) * fz;
        if (sp > 1.5 && d > 3) {
          const lead = along > 4 ? along : Math.min(9, 3 + sp * 0.5);
          goal = { x: car.x + fx * lead, z: car.z + fz * lead };
        } else goal = car;
        if (view.nearCar != null && t - b.lastEnter > 1) {
          const nc = view.cars.find((c) => c.id === view.nearCar);
          if (nc && (nc.driver == null || nc.driver === 'npc') && !b.blacklist.has(nc.id)) {
            it.enter = true;
            b.lastEnter = t;
            b.enterCar = nc.id;
          }
        }
      }
    }
    if (!goal) {
      if (!b.wanderTarget || Math.hypot(b.wanderTarget.x - local.x, b.wanderTarget.z - local.z) < 3) {
        const sp = world.spawnPoints[Math.floor(Math.random() * world.spawnPoints.length)];
        b.wanderTarget = { x: sp.x, z: sp.z };
      }
      goal = b.wanderTarget;
    }
    let dx = goal.x - local.x, dz = goal.z - local.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (b.sideT > 0) {
      b.sideT -= dt;
      const sx = -dz * b.sideDir, sz = dx * b.sideDir;
      dx = sx * 0.9 + dx * 0.1; dz = sz * 0.9 + dz * 0.1;
    } else {
      const moved = Math.hypot(local.x - b.lastX, local.z - b.lastZ);
      if (moved < 1.5 * dt) b.stuckT += dt; else b.stuckT = 0;
      if (b.stuckT > 0.6) { b.stuckT = 0; b.sideT = 0.9; b.sideDir = Math.random() < 0.5 ? 1 : -1; }
    }
    b.lastX = local.x; b.lastZ = local.z;
    it.moveX = dx; it.moveZ = dz;
    const ped = nearestPed(14);
    if (ped) { it.aimX = ped.x; it.aimZ = ped.z; it.fire = true; }
    return it;
  }

  function update(dt, inp, screenW, screenH) {
    const t = now();
    view.time += dt;
    view.connected = !!net?.connected;
    updateBasis(screenW || innerWidth, screenH || innerHeight);

    const ip = interpolate();
    const id = net?.id ?? view.me.id;
    view.me.id = id;
    if (ip) {
      view.peds = ip.peds;
      view.pickups = ip.pickups;
      view.cars = ip.cars;
      view.players = ip.players;
    }

    const steps = Math.max(1, Math.ceil(dt / 0.034));
    const sdt = dt / steps;
    let it = null;
    for (let s = 0; s < steps; s++) {
      const si = bot ? botIntent(sdt) : (it ? { ...it, enter: false, weapon: null, weaponDelta: 0 } : humanIntent(inp));
      if (!it) it = si;
      else if (bot) it = { ...si, enter: it.enter || si.enter, weapon: it.weapon ?? si.weapon };
      if (local.have && !local.dead) {
        if (local.car != null && local.cs) stepCar(sdt, si);
        else stepFoot(sdt, si);
      }
    }
    if (!bot && inp && inp.mouseMoved && it.aimX == null && view.me.aimX) { it.aimX = view.me.aimX; it.aimZ = view.me.aimZ; }

    let aimX = it.aimX, aimZ = it.aimZ;
    if (aimX == null) {
      aimX = local.x + Math.sin(local.a) * 10;
      aimZ = local.z + Math.cos(local.a) * 10;
    }
    view.me.aimX = aimX;
    view.me.aimZ = aimZ;

    view.nearCar = findNearCar();

    if (it.enter && local.have && !local.dead) {
      if (local.car != null) net?.send({ t: 'exit' });
      else if (view.nearCar != null) { net?.send({ t: 'enter', car: view.nearCar }); enterSentAt = t; }
    }

    const srvW = lastSrv?.w ?? view.me.w ?? 1;
    let curW = pendingW != null && t < pendingWUntil ? pendingW : srvW;
    let newW = null;
    if (it.weapon != null) newW = it.weapon;
    else if (it.weaponDelta) newW = ((curW + it.weaponDelta) % WEAPONS.length + WEAPONS.length) % WEAPONS.length;
    if (newW != null && newW !== curW) {
      net?.send({ t: 'weapon', w: newW });
      pendingW = newW;
      pendingWUntil = t + 0.6;
      curW = newW;
    }

    fireCd -= dt;
    if (it.fire && fireCd <= 0 && local.have && !local.dead) {
      const wpn = WEAPONS[curW] || WEAPONS[1];
      const ammo = lastSrv?.ammo;
      if (curW === 0 || ammo == null || ammo > 0) {
        const a = Math.atan2(aimX - local.x, aimZ - local.z);
        net?.send({ t: 'shoot', x: local.x, z: local.z, a, w: curW });
        fireCd = wpn.rate;
      }
    }

    if (respawnAt != null && t >= respawnAt) {
      net?.send({ t: 'respawn' });
      respawnSentAt = t;
      respawnAt = null;
      adoptAfter = t + 0.25;
    }

    sendTimer -= dt;
    if (sendTimer <= 0 && local.have && !local.dead) {
      sendTimer = SEND_RATE;
      net?.send({ t: 'st', x: +local.x.toFixed(2), z: +local.z.toFixed(2), a: +local.a.toFixed(3), v: +local.v.toFixed(2) });
    }

    const me = view.me;
    if (lastSrv) {
      for (const k of ['hp', 'armor', 'ammo', 'money', 'wanted', 'kills', 'deaths', 'name', 'color']) if (lastSrv[k] !== undefined) me[k] = lastSrv[k];
    }
    me.w = curW;
    me.dead = local.dead;
    me.car = local.car;
    me.x = local.x; me.z = local.z; me.a = local.a; me.v = local.v;

    if (id != null) {
      let found = false;
      for (let i = 0; i < view.players.length; i++) {
        if (view.players[i].id === id) {
          view.players[i] = { ...view.players[i], x: me.x, z: me.z, a: me.a, v: me.v, car: me.car, w: me.w };
          found = true;
        }
      }
      if (!found && lastSrv) view.players.push({ ...lastSrv, x: me.x, z: me.z, a: me.a, v: me.v, car: me.car, w: me.w });
    }
    if (local.cs) {
      const cs = local.cs;
      let found = false;
      for (let i = 0; i < view.cars.length; i++) {
        if (view.cars[i].id === cs.id) {
          view.cars[i] = { ...view.cars[i], x: cs.x, z: cs.z, a: cs.a, v: cs.vf, driver: id };
          found = true;
        }
      }
      if (!found) view.cars.push({ id: cs.id, x: cs.x, z: cs.z, a: cs.a, v: cs.vf, type: cs.type, color: '#ff5fa2', hp: 100, driver: id, cop: false, siren: false, wreck: false });
    }
    return view;
  }

  return { view, local, setWorld, setRenderer, onWelcome, onSnap, onEvent, update, isRoad: (x, z) => isRoad(world, x, z) };
}
