import { CFG, generateWorld, isRoad, collideCircle, raycast, WEAPONS, CAR_TYPES } from '../shared/world.js';

export const SEED = 6;
export const TICK_RATE = 20;
export const SNAP_RATE = 10;

const N_CARS = 35;
const N_PEDS = 50;
const N_PICKUPS = 32;
const LANE_IN = 3;
const LANE_OUT = 7;
const PLAYER_COLORS = ['#ff3b6b', '#3ee0d0', '#ffd166', '#c084fc', '#7cff6b', '#ff8c5a', '#5ab0ff', '#ffffff'];
const CAR_COLORS = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557', '#ff5fa2', '#3ee0d0', '#ffd166', '#c084fc', '#2a9d8f', '#e76f51', '#222222', '#bbbbbb'];
const PICKUP_KINDS = ['pistol', 'uzi', 'uzi', 'shotgun', 'shotgun', 'rocket', 'health', 'health', 'armor', 'armor', 'cash', 'cash', 'cash', 'bribe'];
const WEAPON_BY_PICKUP = { pistol: 1, uzi: 2, shotgun: 3, rocket: 4 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CAR_MAX_V = 65;
const FOOT_MAX_V = 12;
const BUDGET_WINDOW = 1;
const MOVE_SLACK = 2;
const ENTER_DIST = 4.5;
const RAM_LEVEL = 3;
const RAM_CD = 4;
const RAM_DMG = 10;
const HIT_CREDIT_T = 5;
const TEMP_PED_T = 30;
const STILL_T = 2;

const rand = Math.random;
const r2 = (n) => Math.round(n * 100) / 100;
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (n) => typeof n === 'number' && Number.isFinite(n);
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const lx = cx - ox;
  const lz = cz - oz;
  const t = lx * dx + lz * dz;
  if (t < -r) return Infinity;
  const p2 = lx * lx + lz * lz - t * t;
  if (p2 > r * r) return Infinity;
  return Math.max(0, t - Math.sqrt(r * r - p2));
}

export function createSim(broadcast, send = () => {}) {
  const world = generateWorld(SEED);
  const roads = world.roads;
  const NR = roads.length;
  const { CELL } = CFG;
  const S = world.size;

  let now = 0;
  let nextId = 1;
  const players = new Map();
  const cars = [];
  const peds = [];
  const cops = [];
  const pickups = [];
  const pairCd = new Map();
  let policeTimer = 0;
  let trafficTimer = 0;

  const ev = (kind, data) => broadcast({ t: 'ev', kind, ...data });

  function pairReady(key, cd) {
    const t = pairCd.get(key);
    if (t != null && t > now) return false;
    pairCd.set(key, now + cd);
    return true;
  }

  function lanePoint(i, j, dx, dz, s, lane) {
    return { x: roads[i] + dx * s - dz * lane, z: roads[j] + dz * s + dx * lane };
  }
  function validDir(i, j, dx, dz) {
    return i + dx >= 0 && i + dx < NR && j + dz >= 0 && j + dz < NR;
  }

  function chooseNext(car) {
    const i1 = car.i + car.dx;
    const j1 = car.j + car.dz;
    const opts = DIRS.filter(([ex, ez]) => !(ex === -car.dx && ez === -car.dz) && validDir(i1, j1, ex, ez));
    if (!opts.length) return [-car.dx, -car.dz];
    const tgt = car.target != null ? players.get(car.target) : null;
    if (tgt && !tgt.dead) {
      let best = opts[0];
      let bd = Infinity;
      for (const o of opts) {
        const d = dist2(roads[i1 + o[0]], roads[j1 + o[1]], tgt.x, tgt.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    const weighted = [];
    for (const o of opts) {
      weighted.push(o);
      if (o[0] === car.dx && o[1] === car.dz) weighted.push(o, o);
    }
    return weighted[Math.floor(rand() * weighted.length)];
  }

  function cornerS(car) {
    return CELL + car.lane * (-car.ez * car.dx + car.ex * car.dz);
  }

  function snapToGrid(car) {
    const ki = clamp(Math.round((car.x - roads[0]) / CELL), 0, NR - 1);
    const kj = clamp(Math.round((car.z - roads[0]) / CELL), 0, NR - 1);
    const offX = Math.abs(car.x - roads[ki]);
    const offZ = Math.abs(car.z - roads[kj]);
    const fx = Math.sin(car.a);
    const fz = Math.cos(car.a);
    if (offX <= offZ) {
      let dz = fz >= 0 ? 1 : -1;
      let j = dz > 0 ? Math.floor((car.z - roads[0]) / CELL) : Math.ceil((car.z - roads[0]) / CELL);
      j = clamp(j, 0, NR - 1);
      if (!validDir(ki, j, 0, dz)) dz = -dz;
      car.i = ki; car.j = j; car.dx = 0; car.dz = dz;
    } else {
      let dx = fx >= 0 ? 1 : -1;
      let i = dx > 0 ? Math.floor((car.x - roads[0]) / CELL) : Math.ceil((car.x - roads[0]) / CELL);
      i = clamp(i, 0, NR - 1);
      if (!validDir(i, kj, dx, 0)) dx = -dx;
      car.i = i; car.j = kj; car.dx = dx; car.dz = 0;
    }
    car.lane = LANE_IN;
    const [ex, ez] = chooseNext(car);
    car.ex = ex; car.ez = ez;
  }

  function makeCar(type, opts = {}) {
    const T = CAR_TYPES[type];
    const car = {
      id: nextId++, x: 0, z: 0, a: 0, v: 0, type,
      color: opts.color || (type === 2 ? '#ffcc00' : type === 4 ? '#f2f2f2' : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]),
      hp: T.hp, driver: 'npc', cop: !!opts.cop, siren: !!opts.cop, wreck: false,
      i: 0, j: 0, dx: 1, dz: 0, ex: 1, ez: 0, lane: LANE_IN,
      cruise: opts.cop ? 24 : 8 + rand() * 5, panicUntil: 0, stuckT: 0, ghostUntil: 0,
      burning: false, burnAt: 0, lastHitBy: null, lastHitAt: 0, ramCd: 0, laneAt: -10, movedAt: now, wreckAt: 0, target: opts.target ?? null, idleSince: now, ram: false,
    };
    return car;
  }

  function placeOnSegment(car, i, j, dx, dz, s) {
    car.i = i; car.j = j; car.dx = dx; car.dz = dz; car.lane = LANE_IN;
    const p = lanePoint(i, j, dx, dz, s, LANE_IN);
    car.x = p.x; car.z = p.z;
    car.a = Math.atan2(dx, dz);
    const [ex, ez] = chooseNext(car);
    car.ex = ex; car.ez = ez;
  }

  function farFromPlayers(x, z, d) {
    for (const p of players.values()) if (dist2(x, z, p.x, p.z) < d * d) return false;
    return true;
  }
  function clearOfCars(x, z, d) {
    for (const c of cars) if (dist2(x, z, c.x, c.z) < d * d) return false;
    return true;
  }

  function spawnTraffic(far) {
    const types = [0, 0, 0, 1, 2, 2, 3, 5];
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.floor(rand() * NR);
      const j = Math.floor(rand() * NR);
      const d = DIRS[Math.floor(rand() * 4)];
      if (!validDir(i, j, d[0], d[1])) continue;
      const s = 15 + rand() * 50;
      const p = lanePoint(i, j, d[0], d[1], s, LANE_IN);
      if (far && !farFromPlayers(p.x, p.z, 110)) continue;
      if (!clearOfCars(p.x, p.z, 12)) continue;
      const car = makeCar(types[Math.floor(rand() * types.length)]);
      placeOnSegment(car, i, j, d[0], d[1], s);
      car.v = car.cruise * 0.6;
      cars.push(car);
      return car;
    }
    return null;
  }

  function spawnCopCar(target) {
    for (let tries = 0; tries < 60; tries++) {
      const ci = clamp(Math.round((target.x - roads[0]) / CELL), 0, NR - 1);
      const cj = clamp(Math.round((target.z - roads[0]) / CELL), 0, NR - 1);
      const i = clamp(ci + Math.floor(rand() * 5) - 2, 0, NR - 1);
      const j = clamp(cj + Math.floor(rand() * 5) - 2, 0, NR - 1);
      const d = DIRS[Math.floor(rand() * 4)];
      if (!validDir(i, j, d[0], d[1])) continue;
      const s = 10 + rand() * 60;
      const p = lanePoint(i, j, d[0], d[1], s, LANE_IN);
      const dd = dist(p.x, p.z, target.x, target.z);
      const lo = tries < 40 ? 60 : 40;
      const hi = tries < 40 ? 90 : 130;
      if (dd < lo || dd > hi) continue;
      if (!clearOfCars(p.x, p.z, 8)) continue;
      const car = makeCar(4, { cop: true, target: target.id });
      placeOnSegment(car, i, j, d[0], d[1], s);
      car.v = 12;
      cars.push(car);
      return car;
    }
    return null;
  }

  function ringRect(b) {
    return { x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z1 - 2 };
  }
  function ringLen(b) {
    const r = ringRect(b);
    return 2 * (r.x1 - r.x0) + 2 * (r.z1 - r.z0);
  }
  function ringPos(b, p) {
    const r = ringRect(b);
    const w = r.x1 - r.x0;
    const h = r.z1 - r.z0;
    const L = 2 * w + 2 * h;
    p = ((p % L) + L) % L;
    if (p < w) return { x: r.x0 + p, z: r.z0 };
    if (p < w + h) return { x: r.x1, z: r.z0 + (p - w) };
    if (p < 2 * w + h) return { x: r.x1 - (p - w - h), z: r.z1 };
    return { x: r.x0, z: r.z1 - (p - 2 * w - h) };
  }
  function ringNearest(b, x, z) {
    const r = ringRect(b);
    const w = r.x1 - r.x0;
    const h = r.z1 - r.z0;
    const cx = clamp(x, r.x0, r.x1);
    const cz = clamp(z, r.z0, r.z1);
    const dl = cx - r.x0, dr = r.x1 - cx, dt = cz - r.z0, db = r.z1 - cz;
    const m = Math.min(dl, dr, dt, db);
    if (m === dt) return cx - r.x0;
    if (m === dr) return w + (cz - r.z0);
    if (m === db) return w + h + (r.x1 - cx);
    return 2 * w + h + (r.z1 - cz);
  }
  function blockNear(x, z) {
    const i = clamp(Math.floor((x - CFG.ROAD / 2) / CELL), 0, CFG.BLOCKS - 1);
    const j = clamp(Math.floor((z - CFG.ROAD / 2) / CELL), 0, CFG.BLOCKS - 1);
    return world.grid[i][j];
  }
  function cornerNeighbors(b, corner) {
    const { i, j } = b;
    const list = [
      [[i, j - 1, 3], [i - 1, j, 1]],
      [[i, j - 1, 2], [i + 1, j, 0]],
      [[i, j + 1, 1], [i + 1, j, 3]],
      [[i, j + 1, 0], [i - 1, j, 2]],
    ][corner];
    return list.filter(([a, c]) => a >= 0 && c >= 0 && a < CFG.BLOCKS && c < CFG.BLOCKS);
  }
  function cornerP(b, corner) {
    const r = ringRect(b);
    const w = r.x1 - r.x0;
    const h = r.z1 - r.z0;
    return [0, w, w + h, 2 * w + h][corner];
  }

  function placePed(ped, far) {
    for (let tries = 0; tries < 30; tries++) {
      const b = world.blocks[Math.floor(rand() * world.blocks.length)];
      const p = rand() * ringLen(b);
      const pos = ringPos(b, p);
      if (far && !farFromPlayers(pos.x, pos.z, 60) && tries < 25) continue;
      ped.bi = b.i; ped.bj = b.j; ped.p = p; ped.x = pos.x; ped.z = pos.z;
      return;
    }
  }

  function makePed(far) {
    const ped = {
      id: nextId++, kind: Math.floor(rand() * 6), x: 0, z: 0, a: 0, v: 0, hp: 20, dead: false, deadAt: 0,
      bi: 0, bj: 0, p: 0, dir: rand() < 0.5 ? 1 : -1, speed: 1.2 + rand() * 0.5, fleeUntil: 0, cross: null, pause: 0,
    };
    placePed(ped, far);
    return ped;
  }

  function spawnFreePed(x, z, kind) {
    const ped = {
      id: nextId++, kind, x, z, a: 0, v: 0, hp: 20, dead: false, deadAt: 0,
      bi: 0, bj: 0, p: 0, dir: 1, speed: 1.4, fleeUntil: now + 6, cross: null, pause: 0, temp: true, bornAt: now,
    };
    const b = blockNear(x, z);
    const p = ringNearest(b, x, z);
    const pos = ringPos(b, p);
    ped.cross = { tx: pos.x, tz: pos.z, bi: b.i, bj: b.j, p };
    peds.push(ped);
    return ped;
  }

  function spawnCopPed(target, near) {
    for (let tries = 0; tries < 30; tries++) {
      let x, z;
      if (near) {
        const ang = rand() * Math.PI * 2;
        x = near.x + Math.sin(ang) * 3;
        z = near.z + Math.cos(ang) * 3;
      } else {
        const ang = rand() * Math.PI * 2;
        const d = 30 + rand() * 20;
        x = target.x + Math.sin(ang) * d;
        z = target.z + Math.cos(ang) * d;
      }
      if (x < 2 || z < 2 || x > S - 2 || z > S - 2) continue;
      if (collideCircle(world, x, z, 0.5).hit) continue;
      const cop = { id: nextId++, kind: 'cop', x, z, a: 0, v: 0, hp: 40, dead: false, deadAt: 0, target: target.id, lastShot: now + 1 };
      cops.push(cop);
      return cop;
    }
    return null;
  }

  function placePickup(pk) {
    for (let tries = 0; tries < 20; tries++) {
      const b = world.blocks[Math.floor(rand() * world.blocks.length)];
      const pos = ringPos(b, rand() * ringLen(b));
      if (collideCircle(world, pos.x, pos.z, 0.6).hit) continue;
      pk.x = pos.x; pk.z = pos.z;
      break;
    }
    pk.kind = PICKUP_KINDS[Math.floor(rand() * PICKUP_KINDS.length)];
    pk.active = true;
  }

  for (let k = 0; k < N_CARS; k++) spawnTraffic(false);
  for (let k = 0; k < N_PEDS; k++) peds.push(makePed(false));
  for (let k = 0; k < N_PICKUPS; k++) {
    const pk = { id: nextId++, x: 0, z: 0, kind: 'cash', active: true, respawnAt: 0 };
    placePickup(pk);
    pickups.push(pk);
  }

  const carById = (id) => cars.find((c) => c.id === id);
  const level = (p) => Math.min(5, Math.floor(p.wanted + 1e-6));

  function crime(p, amount) {
    if (!p) return;
    p.wanted = Math.min(5, p.wanted + amount);
    p.lastCrime = now;
  }

  function creditKill(killer, victimId, victimName, how, money, wanted) {
    if (killer) {
      killer.money += money;
      killer.kills += 1;
      crime(killer, wanted);
      killer.killTimes = killer.killTimes.filter((t) => t > now - 6);
      killer.killTimes.push(now);
      if (killer.killTimes.length >= 3) ev('frenzy', { id: killer.id, count: killer.killTimes.length });
    }
    ev('kill', {
      killer: killer ? killer.id : null,
      killerName: killer ? killer.name : how === 'cop' ? 'police' : 'city',
      victim: victimId, victimName, how,
    });
  }

  function scarePeds(x, z, r) {
    for (const ped of peds) {
      if (ped.dead) continue;
      if (dist2(ped.x, ped.z, x, z) < r * r) {
        ped.fleeUntil = now + 6 + rand() * 3;
        ped.fleeFrom = { x, z };
      }
    }
  }

  function damagePed(ped, dmg, by, how) {
    if (ped.dead) return;
    ped.hp -= dmg;
    ped.fleeUntil = now + 8;
    if (ped.hp > 0) return;
    ped.dead = true;
    ped.deadAt = now;
    ped.v = 0;
    ped.cross = null;
    if (by) ev('cash', { id: by.id, amount: 10, x: r2(ped.x), z: r2(ped.z) });
    creditKill(by, null, 'pedestrian', how, 10, 0.5);
  }

  function damageCop(cop, dmg, by, how) {
    if (cop.dead) return;
    cop.hp -= dmg;
    if (by && !players.get(cop.target)) cop.target = by.id;
    if (cop.hp > 0) return;
    cop.dead = true;
    cop.deadAt = now;
    cop.v = 0;
    if (by) ev('cash', { id: by.id, amount: 100, x: r2(cop.x), z: r2(cop.z) });
    creditKill(by, null, 'cop', how, 100, 1.5);
  }

  function killPlayer(p, by, how) {
    if (p.dead) return;
    p.hp = 0;
    p.dead = true;
    p.deadAt = now;
    p.deaths += 1;
    if (p.car != null) {
      const car = carById(p.car);
      if (car && car.driver === p.id) { car.driver = null; car.v = 0; car.idleSince = now; }
      p.car = null;
    }
    ev('wasted', { id: p.id });
    const killer = by && by !== p ? by : null;
    if (killer) ev('cash', { id: killer.id, amount: 500, x: r2(p.x), z: r2(p.z) });
    creditKill(killer, p.id, p.name, how, 500, 1);
  }

  function damagePlayer(p, dmg, by, how) {
    if (p.dead) return;
    if (p.armor > 0) {
      const ab = Math.min(p.armor, dmg);
      p.armor -= ab;
      dmg -= ab;
    }
    p.hp -= dmg;
    if (by && by !== p) p.lastHitBy = by.id;
    if (p.hp <= 0) killPlayer(p, by, how);
  }

  function damageCar(car, dmg, by) {
    if (car.wreck) return;
    if (by) { car.lastHitBy = by.id; car.lastHitAt = now; }
    if (car.driver === 'npc' && !car.cop) car.panicUntil = now + 10;
    car.hp -= dmg;
    if (car.hp <= 0 && !car.burning) {
      car.hp = 0;
      car.burning = true;
      car.burnAt = now + 2;
    }
  }

  function explosion(x, z, r, dmg, byId) {
    ev('explode', { x: r2(x), z: r2(z), r });
    const by = byId != null ? players.get(byId) || null : null;
    for (const ped of peds) {
      if (ped.dead) continue;
      const d = dist(ped.x, ped.z, x, z);
      if (d < r) damagePed(ped, dmg * (1 - d / r) + 20, by, 'explosion');
    }
    for (const cop of cops) {
      if (cop.dead) continue;
      const d = dist(cop.x, cop.z, x, z);
      if (d < r) damageCop(cop, dmg * (1 - d / r) + 20, by, 'explosion');
    }
    for (const p of players.values()) {
      if (p.dead || p.car != null) continue;
      const d = dist(p.x, p.z, x, z);
      if (d < r) damagePlayer(p, dmg * (1 - d / r), by, 'explosion');
    }
    for (const c of cars) {
      if (c.wreck) continue;
      const d = dist(c.x, c.z, x, z);
      if (d < r) damageCar(c, dmg * (1 - d / r) * 1.2, by);
    }
    scarePeds(x, z, 35);
  }

  function explodeCar(car) {
    car.wreck = true;
    car.burning = false;
    car.v = 0;
    car.siren = false;
    car.wreckAt = now;
    car.target = null;
    if (now - car.lastHitAt > HIT_CREDIT_T) car.lastHitBy = null;
    const by = car.lastHitBy != null ? players.get(car.lastHitBy) || null : null;
    if (typeof car.driver === 'number') {
      const p = players.get(car.driver);
      car.driver = null;
      if (p) {
        p.car = null;
        killPlayer(p, by, 'explosion');
      }
    } else if (car.driver === 'npc') {
      car.driver = null;
      if (by) creditKill(by, null, car.cop ? 'cop' : 'pedestrian', 'explosion', car.cop ? 100 : 10, car.cop ? 1.5 : 0.5);
    }
    explosion(car.x, car.z, 7, 100, car.lastHitBy);
  }

  function carCircles(c) {
    const T = CAR_TYPES[c.type];
    const off = T.len / 4;
    const fx = Math.sin(c.a);
    const fz = Math.cos(c.a);
    const r = T.wid / 2 + 0.25;
    return [[c.x + fx * off, c.z + fz * off, r], [c.x - fx * off, c.z - fz * off, r]];
  }

  function fire(p, msg) {
    if (p.dead) return;
    let w = p.w;
    if (Number.isInteger(msg.w) && msg.w >= 0 && msg.w < WEAPONS.length && (msg.w === 0 || p.ammo[msg.w] > 0)) w = msg.w;
    p.w = w;
    const W = WEAPONS[w];
    if (now - p.lastShot < W.rate * 0.7) return;
    if (w !== 0 && p.ammo[w] <= 0) return;
    if (!fin(msg.a)) return;
    p.lastShot = now;
    if (w !== 0) p.ammo[w] -= 1;
    const myCar = p.car != null ? carById(p.car) : null;
    let ox = myCar ? myCar.x : p.x;
    let oz = myCar ? myCar.z : p.z;
    if (fin(msg.x) && fin(msg.z) && dist2(msg.x, msg.z, ox, oz) < 36) { ox = msg.x; oz = msg.z; }
    const pellets = W.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const ang = msg.a + (rand() * 2 - 1) * W.spread;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      let bestT = raycast(world, ox, oz, dx, dz, W.range);
      let hitType = bestT < W.range ? 'wall' : null;
      let hitObj = null;
      for (const ped of peds) {
        if (ped.dead) continue;
        const t = rayCircle(ox, oz, dx, dz, ped.x, ped.z, 0.55);
        if (t < bestT) { bestT = t; hitType = 'ped'; hitObj = ped; }
      }
      for (const cop of cops) {
        if (cop.dead) continue;
        const t = rayCircle(ox, oz, dx, dz, cop.x, cop.z, 0.6);
        if (t < bestT) { bestT = t; hitType = 'cop'; hitObj = cop; }
      }
      for (const q of players.values()) {
        if (q === p || q.dead || q.car != null) continue;
        const t = rayCircle(ox, oz, dx, dz, q.x, q.z, 0.7);
        if (t < bestT) { bestT = t; hitType = 'player'; hitObj = q; }
      }
      for (const c of cars) {
        if (c === myCar) continue;
        if (dist2(c.x, c.z, ox, oz) > (W.range + 4) * (W.range + 4)) continue;
        for (const [cx, cz, r] of carCircles(c)) {
          const t = rayCircle(ox, oz, dx, dz, cx, cz, r);
          if (t < bestT) { bestT = t; hitType = 'car'; hitObj = c; }
        }
      }
      const hx = ox + dx * bestT;
      const hz = oz + dz * bestT;
      ev('shot', { by: p.id, x: r2(ox), z: r2(oz), a: r2(ang), w, dist: r2(bestT) });
      if (W.explosive) {
        explosion(hx, hz, W.radius, W.dmg, p.id);
        continue;
      }
      if (!hitType) continue;
      ev('hit', { x: r2(hx), z: r2(hz), target: hitType === 'cop' ? 'ped' : hitType });
      const how = W.name.toLowerCase();
      if (hitType === 'ped') damagePed(hitObj, W.dmg, p, how);
      else if (hitType === 'cop') damageCop(hitObj, W.dmg, p, how);
      else if (hitType === 'player') damagePlayer(hitObj, W.dmg, p, how);
      else if (hitType === 'car') damageCar(hitObj, W.dmg * 0.6, p);
    }
    scarePeds(ox, oz, 25);
  }

  function tryEnter(p, id) {
    if (p.dead || p.car != null) return;
    const car = carById(id);
    if (!car || car.wreck || car.burning) return;
    if (typeof car.driver === 'number' && players.has(car.driver)) return;
    if (dist(p.x, p.z, car.x, car.z) > ENTER_DIST) return;
    if (car.driver === 'npc') {
      const fx = Math.sin(car.a), fz = Math.cos(car.a);
      const ex = car.x + fz * 2.4, ez = car.z - fx * 2.4;
      if (car.cop) {
        const tgt = { id: p.id, x: p.x, z: p.z };
        const cp = spawnCopPed(tgt, { x: ex, z: ez });
        if (!cp) spawnFreePed(ex, ez, 0);
      } else {
        spawnFreePed(ex, ez, Math.floor(rand() * 6));
      }
      p.money += 50;
      crime(p, car.cop ? 1 : 0.5);
      ev('carjack', { by: p.id, car: car.id });
      ev('cash', { id: p.id, amount: 50, x: r2(car.x), z: r2(car.z) });
    }
    car.driver = p.id;
    car.target = null;
    car.siren = false;
    car.ram = false;
    p.car = car.id;
    p.x = car.x;
    p.z = car.z;
    p.v = car.v;
  }

  function doExit(p) {
    if (p.car == null) return;
    const car = carById(p.car);
    p.car = null;
    if (!car) return;
    if (car.driver === p.id) { car.driver = null; car.idleSince = now; }
    const fx = Math.sin(car.a), fz = Math.cos(car.a);
    let ex = car.x + fz * 2.4, ez = car.z - fx * 2.4;
    const res = collideCircle(world, ex, ez, 0.5);
    p.x = res.x; p.z = res.z; p.v = 0; p.a = car.a;
  }

  function respawn(p) {
    const sp = world.spawnPoints[Math.floor(rand() * world.spawnPoints.length)];
    p.x = sp.x; p.z = sp.z; p.a = 0; p.v = 0;
    p.hp = 100; p.armor = 0; p.car = null; p.w = 1;
    p.ammo = [Infinity, 60, 0, 0, 0];
    p.wanted = 0; p.dead = false; p.busted = false;
    p.forceUntil = now + 1.5;
    p.budget = 0;
    p.budgetAt = Date.now() / 1000;
    for (const c of cops) if (c.target === p.id) c.target = null;
  }

  function bust(p) {
    if (p.dead) return;
    if (p.car != null) {
      const car = carById(p.car);
      if (car && car.driver === p.id) { car.driver = null; car.v = 0; car.idleSince = now; }
      p.car = null;
    }
    p.money = Math.floor(p.money / 2);
    p.ammo = [Infinity, 0, 0, 0, 0];
    p.w = 0;
    p.wanted = 0;
    p.dead = true;
    p.busted = true;
    p.deadAt = now;
    ev('busted', { id: p.id });
  }

  function correctPose(p, x, z, a) {
    const t = Date.now();
    if (t - (p.lastPosMsg || 0) < 500) return;
    p.lastPosMsg = t;
    send(p.id, { t: 'pos', x: r2(x), z: r2(z), a: r2(a), car: p.car });
  }

  function handleSt(p, msg) {
    if (p.dead) return;
    if (!fin(msg.x) || !fin(msg.z)) return;
    let x = clamp(msg.x, 0, S);
    let z = clamp(msg.z, 0, S);
    const car = p.car != null ? carById(p.car) : null;
    const cx = car ? car.x : p.x;
    const cz = car ? car.z : p.z;
    const t = Date.now() / 1000;
    const vmax = car ? CAR_MAX_V : FOOT_MAX_V;
    p.budget = Math.min(vmax * BUDGET_WINDOW + MOVE_SLACK, (p.budget || 0) + vmax * Math.max(0, t - (p.budgetAt || t)));
    p.budgetAt = t;
    const jump = dist(x, z, cx, cz);
    const allowed = p.budget + MOVE_SLACK;
    if (jump > allowed) {
      if (now < p.forceUntil || jump > allowed + 30) { correctPose(p, cx, cz, car ? car.a : p.a); return; }
      const k = allowed / jump;
      x = cx + (x - cx) * k;
      z = cz + (z - cz) * k;
      p.budget = 0;
      correctPose(p, x, z, fin(msg.a) ? msg.a : p.a);
    } else p.budget = Math.max(0, p.budget - jump);
    const a = fin(msg.a) ? msg.a : p.a;
    const v = fin(msg.v) ? clamp(msg.v, -60, 60) : 0;
    const moved = dist(x, z, cx, cz) > 0.2 || Math.abs(v) > 0.5;
    if (car && car.driver === p.id && !car.wreck) {
      car.x = x; car.z = z; car.a = a; car.v = car.burning ? v * 0.5 : v;
      if (moved) car.movedAt = now;
    }
    if (moved) p.movedAt = now;
    p.x = x; p.z = z; p.a = a; p.v = v;
  }

  function stepNpcCar(car, dt) {
    const T = CAR_TYPES[car.type];
    const tgt = car.target != null ? players.get(car.target) : null;
    if (car.target != null && (!tgt || tgt.dead || level(tgt) === 0)) {
      car.target = null;
      car.siren = false;
      car.cruise = 10;
    }
    if (car.burning) {
      car.v = Math.max(0, car.v - 10 * dt);
      car.x += Math.sin(car.a) * car.v * dt;
      car.z += Math.cos(car.a) * car.v * dt;
      return;
    }
    let desired;
    let targetSpeed;
    let segS = null, segC = 0;
    const tdist = tgt ? dist(tgt.x, tgt.z, car.x, car.z) : Infinity;
    if (tgt && tdist < 28) {
      car.ram = true;
      desired = Math.atan2(tgt.x - car.x, tgt.z - car.z);
      const ramming = tgt.car != null && level(tgt) >= RAM_LEVEL && now >= car.ramCd;
      targetSpeed = ramming ? 26 : clamp((tdist - (tgt.car != null ? 9 : 7)) * 1.5, 0, 22);
      if (tgt.car == null && tdist < 12 && car.v < 3 && !car.dropped) {
        car.dropped = true;
        const fx0 = Math.sin(car.a), fz0 = Math.cos(car.a);
        spawnCopPed(tgt, { x: car.x - fz0 * 2.4, z: car.z + fx0 * 2.4 });
      }
    } else {
      if (car.ram) { car.ram = false; snapToGrid(car); }
      let s = (car.x - roads[car.i]) * car.dx + (car.z - roads[car.j]) * car.dz;
      let sc = cornerS(car);
      let guard = 0;
      while (s >= sc && guard++ < 3) {
        car.i += car.dx; car.j += car.dz;
        car.dx = car.ex; car.dz = car.ez;
        car.lane = LANE_IN;
        const [ex, ez] = chooseNext(car);
        car.ex = ex; car.ez = ez;
        s = (car.x - roads[car.i]) * car.dx + (car.z - roads[car.j]) * car.dz;
        sc = cornerS(car);
      }
      if (s < -30 || s > CELL + 30) { snapToGrid(car); s = (car.x - roads[car.i]) * car.dx + (car.z - roads[car.j]) * car.dz; sc = cornerS(car); }
      segS = s; segC = sc;
      const L = 5 + Math.abs(car.v) * 0.45;
      let tx, tz;
      if (s + L < sc) {
        const pt = lanePoint(car.i, car.j, car.dx, car.dz, s + L, car.lane);
        tx = pt.x; tz = pt.z;
      } else {
        const i1 = car.i + car.dx, j1 = car.j + car.dz;
        const cxp = roads[i1] - car.dz * car.lane - car.ez * car.lane;
        const czp = roads[j1] + car.dx * car.lane + car.ex * car.lane;
        tx = cxp + car.ex * (s + L - sc);
        tz = czp + car.ez * (s + L - sc);
      }
      desired = Math.atan2(tx - car.x, tz - car.z);
      targetSpeed = now < car.panicUntil ? 18 : car.cruise;
      if (tgt) targetSpeed = 24;
      const turning = car.ex !== car.dx || car.ez !== car.dz;
      if (turning && sc - s < 16 && !tgt) targetSpeed = Math.min(targetSpeed, 6.5);
    }

    const fx = Math.sin(car.a), fz = Math.cos(car.a);
    const rx = -fz, rz = fx;
    const look = 5 + Math.abs(car.v) * 1.1;
    let block = Infinity;
    let staticBlock = false;
    const ghost = now < car.ghostUntil;
    const consider = (ox, oz, isStatic, isPlayer, halfW) => {
      const lx = ox - car.x, lz = oz - car.z;
      const along = lx * fx + lz * fz;
      if (along <= 0 || along > look + 4) return;
      let lat = Math.abs(lx * rx + lz * rz);
      if (segS != null) {
        const os = (ox - roads[car.i]) * car.dx + (oz - roads[car.j]) * car.dz;
        if (os < segC - 2) lat = Math.abs((ox - roads[car.i]) * -car.dz + (oz - roads[car.j]) * car.dx - car.lane);
      }
      if (lat > halfW) return;
      if (ghost && !isPlayer) return;
      if (along < block) { block = along; staticBlock = isStatic; }
    };
    if (!car.ram) {
      for (const o of cars) {
        if (o === car) continue;
        if (dist2(o.x, o.z, car.x, car.z) > 900) continue;
        const isStatic = o.wreck || (o.driver === null && Math.abs(o.v) < 0.5) || (typeof o.driver === 'number' && Math.abs(o.v) < 0.5 && now - o.movedAt > STILL_T);
        consider(o.x, o.z, isStatic, typeof o.driver === 'number', 2.3);
      }
      for (const p of players.values()) {
        if (p.dead || p.car != null) continue;
        consider(p.x, p.z, now - p.movedAt > STILL_T, true, 1.8);
      }
      for (const ped of peds) {
        if (!ped.cross || ped.dead) continue;
        consider(ped.x, ped.z, false, false, 1.6);
      }
      for (const c of cops) {
        if (c.dead) continue;
        consider(c.x, c.z, false, false, 1.6);
      }
    }
    if (block < Infinity) {
      if (staticBlock && block < 25 && now - car.laneAt > 1.5) { car.lane = car.lane === LANE_IN ? LANE_OUT : LANE_IN; car.laneAt = now; }
      else targetSpeed = Math.min(targetSpeed, Math.max(0, (block - 5.5) * 1.4));
    }
    const diff = wrapAngle(desired - car.a);
    const turnRate = 2.4 * clamp(Math.abs(car.v) / 4, 0.25, 1);
    car.a = wrapAngle(car.a + clamp(diff, -turnRate * dt, turnRate * dt));
    if (Math.abs(diff) > 1.2 && !car.ram) targetSpeed = Math.min(targetSpeed, 4);
    if (car.v < targetSpeed) car.v = Math.min(targetSpeed, car.v + T.accel * 0.6 * dt);
    else car.v = Math.max(targetSpeed, car.v - 16 * dt);
    car.x += Math.sin(car.a) * car.v * dt;
    car.z += Math.cos(car.a) * car.v * dt;
    if (car.ram) {
      const res = collideCircle(world, car.x, car.z, 1.2);
      if (res.hit) { car.x = res.x; car.z = res.z; car.v *= 0.6; }
    }
    if (car.v < 0.5) {
      car.stuckT += dt;
      if (car.stuckT > 4) { car.ghostUntil = now + 1.5; car.stuckT = 0; }
    } else car.stuckT = 0;
  }

  function stepCars(dt) {
    for (const car of cars) {
      if (car.burning && now >= car.burnAt) explodeCar(car);
      if (car.wreck) continue;
      if (car.driver === 'npc') stepNpcCar(car, dt);
      else if (car.driver === null) {
        car.v *= Math.max(0, 1 - 3 * dt);
        if (Math.abs(car.v) > 0.05) {
          car.x += Math.sin(car.a) * car.v * dt;
          car.z += Math.cos(car.a) * car.v * dt;
        }
      }
    }
    for (let a = 0; a < cars.length; a++) {
      const A = cars[a];
      for (let b = a + 1; b < cars.length; b++) {
        const B = cars[b];
        const d2 = dist2(A.x, A.z, B.x, B.z);
        if (d2 > 25) continue;
        const ca = carCircles(A), cb = carCircles(B);
        let hit = false;
        let px = 0, pz = 0, depth = 0;
        for (const [ax, az, ar] of ca) for (const [bx, bz, br] of cb) {
          const dd = dist(ax, az, bx, bz);
          const m = ar + br - dd;
          if (m > depth) { depth = m; hit = true; const inv = dd > 1e-6 ? 1 / dd : 0; px = (bx - ax) * inv; pz = (bz - az) * inv; if (!inv) { px = 1; pz = 0; } }
        }
        if (!hit) continue;
        if (now < A.ghostUntil || now < B.ghostUntil) continue;
        const aP = typeof A.driver === 'number';
        const bP = typeof B.driver === 'number';
        const aMov = !A.wreck && !aP;
        const bMov = !B.wreck && !bP;
        if (aMov && bMov) {
          A.x -= px * depth * 0.5; A.z -= pz * depth * 0.5;
          B.x += px * depth * 0.5; B.z += pz * depth * 0.5;
        } else if (bMov) { B.x += px * depth; B.z += pz * depth; }
        else if (aMov) { A.x -= px * depth; A.z -= pz * depth; }
        if (aP || bP || A.ram || B.ram) {
          const rvx = Math.sin(A.a) * A.v - Math.sin(B.a) * B.v;
          const rvz = Math.cos(A.a) * A.v - Math.cos(B.a) * B.v;
          const impact = Math.sqrt(rvx * rvx + rvz * rvz);
          if (impact > 7 && pairReady(`c${A.id}-${B.id}`, 0.6)) {
            const dmg = (impact - 7) * 2.2;
            const byA = aP ? players.get(A.driver) : null;
            const byB = bP ? players.get(B.driver) : null;
            const aRam = A.ram && A.cop && bP;
            const bRam = B.ram && B.cop && aP;
            if (aRam) A.ramCd = now + RAM_CD;
            if (bRam) B.ramCd = now + RAM_CD;
            damageCar(A, bRam ? Math.min(dmg, RAM_DMG) : dmg, aRam ? null : byB);
            damageCar(B, aRam ? Math.min(dmg, RAM_DMG) : dmg, bRam ? null : byA);
            if (A.ram) A.v *= 0.3;
            if (B.ram) B.v *= 0.3;
            if (!aP && !A.wreck) A.v *= 0.4;
            if (!bP && !B.wreck) B.v *= 0.4;
          }
        }
      }
    }
    for (const car of cars) {
      if (car.wreck || car.burning) continue;
      const speed = Math.abs(car.v);
      if (speed < 6) continue;
      const driver = typeof car.driver === 'number' ? players.get(car.driver) : null;
      const circles = carCircles(car);
      const touches = (x, z, r) => circles.some(([cx, cz, cr]) => dist2(cx, cz, x, z) < (cr + r) * (cr + r));
      if (driver) {
        for (const ped of peds) {
          if (ped.dead || !touches(ped.x, ped.z, 0.4)) continue;
          ev('hit', { x: r2(ped.x), z: r2(ped.z), target: 'ped' });
          damagePed(ped, 999, driver, 'runover');
        }
        for (const cop of cops) {
          if (cop.dead || !touches(cop.x, cop.z, 0.4)) continue;
          ev('hit', { x: r2(cop.x), z: r2(cop.z), target: 'ped' });
          damageCop(cop, 999, driver, 'runover');
        }
      }
      for (const q of players.values()) {
        if (q.dead || q.car != null || q === driver) continue;
        if (!touches(q.x, q.z, 0.5)) continue;
        if (!pairReady(`r${car.id}-${q.id}`, 1)) continue;
        ev('hit', { x: r2(q.x), z: r2(q.z), target: 'player' });
        damagePlayer(q, speed * (driver ? 4 : 2.5), driver, 'runover');
      }
    }
    for (let k = cars.length - 1; k >= 0; k--) {
      const c = cars[k];
      if (c.wreck && now - c.wreckAt > 40 && farFromPlayers(c.x, c.z, 80)) { cars.splice(k, 1); continue; }
      if (c.driver === null && !c.wreck && now - c.idleSince > 90 && farFromPlayers(c.x, c.z, 150)) { cars.splice(k, 1); continue; }
      if (c.cop && c.driver === 'npc' && c.target == null && farFromPlayers(c.x, c.z, 120)) { cars.splice(k, 1); continue; }
      if (c.x < -50 || c.z < -50 || c.x > S + 50 || c.z > S + 50) cars.splice(k, 1);
    }
  }

  function stepPeds(dt) {
    for (let k = peds.length - 1; k >= 0; k--) {
      const ped = peds[k];
      if (!ped.temp) continue;
      const old = now - ped.bornAt;
      if ((ped.dead && now - ped.deadAt > 15) || (!ped.dead && ((old > TEMP_PED_T && farFromPlayers(ped.x, ped.z, 60)) || old > TEMP_PED_T * 3))) peds.splice(k, 1);
    }
    for (const ped of peds) {
      if (ped.dead) {
        if (now - ped.deadAt > 15) {
          ped.dead = false; ped.hp = 20; ped.kind = Math.floor(rand() * 6); ped.cross = null; ped.fleeUntil = 0;
          ped.id = nextId++;
          placePed(ped, true);
        }
        continue;
      }
      const fleeing = now < ped.fleeUntil;
      const speed = fleeing ? 5 : ped.speed;
      if (ped.cross) {
        const c = ped.cross;
        const d = dist(ped.x, ped.z, c.tx, c.tz);
        const step = speed * dt;
        if (d <= step) {
          ped.x = c.tx; ped.z = c.tz;
          ped.bi = c.bi; ped.bj = c.bj; ped.p = c.p;
          ped.cross = null;
        } else {
          ped.a = Math.atan2(c.tx - ped.x, c.tz - ped.z);
          ped.x += (c.tx - ped.x) / d * step;
          ped.z += (c.tz - ped.z) / d * step;
        }
        ped.v = speed;
        continue;
      }
      if (!fleeing && ped.pause > 0) { ped.pause -= dt; ped.v = 0; continue; }
      if (!fleeing && rand() < 0.002) { ped.pause = 1 + rand() * 3; continue; }
      const b = world.grid[ped.bi][ped.bj];
      if (fleeing && ped.fleeFrom) {
        const ahead = ringPos(b, ped.p + ped.dir * 2);
        const back = ringPos(b, ped.p - ped.dir * 2);
        if (dist2(back.x, back.z, ped.fleeFrom.x, ped.fleeFrom.z) > dist2(ahead.x, ahead.z, ped.fleeFrom.x, ped.fleeFrom.z) + 0.5) ped.dir = -ped.dir;
        ped.fleeFrom = null;
      }
      const L = ringLen(b);
      const side = L / 4;
      const oldP = ((ped.p % L) + L) % L;
      let newP = oldP + ped.dir * speed * dt;
      const oldSeg = Math.floor(oldP / side);
      const newSegRaw = Math.floor(newP / side);
      if (newSegRaw !== oldSeg && !fleeing && rand() < 0.3) {
        const corner = ped.dir > 0 ? ((oldSeg + 1) % 4) : oldSeg;
        const nbs = cornerNeighbors(b, corner);
        if (nbs.length) {
          const [ni, nj, nc] = nbs[Math.floor(rand() * nbs.length)];
          const nb = world.grid[ni][nj];
          const np = cornerP(nb, nc);
          const pos = ringPos(nb, np);
          ped.cross = { tx: pos.x, tz: pos.z, bi: ni, bj: nj, p: np };
          const cp = ringPos(b, cornerP(b, corner));
          ped.x = cp.x; ped.z = cp.z;
          ped.p = cornerP(b, corner);
          continue;
        }
      }
      newP = ((newP % L) + L) % L;
      ped.p = newP;
      const pos = ringPos(b, newP);
      if (Math.abs(pos.x - ped.x) + Math.abs(pos.z - ped.z) > 1e-4) ped.a = Math.atan2(pos.x - ped.x, pos.z - ped.z);
      ped.x = pos.x; ped.z = pos.z;
      ped.v = speed;
    }
  }

  function stepCops(dt) {
    for (const cop of cops) {
      if (cop.dead) continue;
      const tgt = cop.target != null ? players.get(cop.target) : null;
      if (!tgt || tgt.dead || level(tgt) === 0) { cop.v = 0; continue; }
      const d = dist(cop.x, cop.z, tgt.x, tgt.z);
      const lv = level(tgt);
      let speed = d > 1.1 ? 5.2 : 0;
      if (lv >= 3 && d < 20 && d > 6) speed = 2;
      if (speed > 0) {
        const nx = (tgt.x - cop.x) / d, nz = (tgt.z - cop.z) / d;
        let x = cop.x + nx * speed * dt;
        let z = cop.z + nz * speed * dt;
        const res = collideCircle(world, x, z, 0.45);
        if (res.hit && Math.abs(res.x - x) + Math.abs(res.z - z) > 0) {
          const tx = -res.nz, tz = res.nx;
          const sgn = tx * nx + tz * nz >= 0 ? 1 : -1;
          x = res.x + tx * sgn * speed * dt * 0.8;
          z = res.z + tz * sgn * speed * dt * 0.8;
        } else { x = res.x; z = res.z; }
        cop.x = x; cop.z = z;
      }
      cop.a = Math.atan2(tgt.x - cop.x, tgt.z - cop.z);
      cop.v = speed;
      if (tgt.car == null && d < 1.6) { bust(tgt); continue; }
      if (lv >= 3 && d < 25 && now - cop.lastShot > 1.3) {
        const ang = Math.atan2(tgt.x - cop.x, tgt.z - cop.z) + (rand() * 2 - 1) * 0.08;
        const wall = raycast(world, cop.x, cop.z, Math.sin(ang), Math.cos(ang), d);
        if (wall < d - 0.5) continue;
        cop.lastShot = now;
        const hitIt = rand() < 0.45;
        ev('shot', { by: 'cop', x: r2(cop.x), z: r2(cop.z), a: r2(ang), w: 1, dist: r2(hitIt ? d : Math.min(30, d + 6)) });
        if (hitIt) {
          if (tgt.car != null) {
            const car = carById(tgt.car);
            ev('hit', { x: r2(tgt.x), z: r2(tgt.z), target: 'car' });
            if (car) damageCar(car, 6, null);
          } else {
            ev('hit', { x: r2(tgt.x), z: r2(tgt.z), target: 'player' });
            damagePlayer(tgt, 8, null, 'cop');
          }
        }
        scarePeds(cop.x, cop.z, 20);
      }
    }
    for (let k = cops.length - 1; k >= 0; k--) {
      const c = cops[k];
      if (c.dead && now - c.deadAt > 15) { cops.splice(k, 1); continue; }
      if (c.dead) continue;
      const tgt = c.target != null ? players.get(c.target) : null;
      if ((!tgt || tgt.dead || level(tgt) === 0) && farFromPlayers(c.x, c.z, 40)) { cops.splice(k, 1); continue; }
      if (tgt && dist(c.x, c.z, tgt.x, tgt.z) > 160) cops.splice(k, 1);
    }
  }

  function stepPolice(dt) {
    for (const p of players.values()) {
      if (p.dead || p.wanted <= 0) continue;
      let seen = false;
      for (const c of cops) if (!c.dead && dist2(c.x, c.z, p.x, p.z) < 900) { seen = true; break; }
      if (!seen) for (const c of cars) if (c.cop && c.driver === 'npc' && !c.wreck && dist2(c.x, c.z, p.x, p.z) < 900) { seen = true; break; }
      if (seen) p.decayFrom = now;
      if (now - Math.max(p.lastCrime, p.decayFrom) >= 25) {
        p.wanted = Math.max(0, p.wanted - 1);
        p.decayFrom = now;
      }
    }
    policeTimer -= dt;
    if (policeTimer > 0) return;
    policeTimer = 1;
    for (const p of players.values()) {
      const lv = level(p);
      if (p.dead || lv === 0) continue;
      const myCars = cars.filter((c) => c.target === p.id && !c.wreck && c.driver === 'npc').length;
      if (myCars < Math.min(6, lv) && now - (p.lastCopCar || 0) > 2.5) {
        if (spawnCopCar(p)) p.lastCopCar = now;
      }
      const myCops = cops.filter((c) => c.target === p.id && !c.dead).length;
      if (myCops < Math.min(5, lv) && now - (p.lastCopPed || 0) > 2) {
        if (spawnCopPed(p)) p.lastCopPed = now;
      }
    }
  }

  function stepPickups() {
    for (const pk of pickups) {
      if (!pk.active) {
        if (now >= pk.respawnAt) placePickup(pk);
        continue;
      }
      for (const p of players.values()) {
        if (p.dead) continue;
        const r = p.car != null ? 2.6 : 1.6;
        if (dist2(p.x, p.z, pk.x, pk.z) > r * r) continue;
        if (pk.kind === 'health' && p.hp >= 100) continue;
        if (pk.kind === 'armor' && p.armor >= 100) continue;
        if (pk.kind === 'bribe' && p.wanted <= 0) continue;
        const w = WEAPON_BY_PICKUP[pk.kind];
        if (w != null) {
          p.ammo[w] = Math.min(999, p.ammo[w] + WEAPONS[w].ammo);
          if (p.w === 0 || p.ammo[p.w] <= 0) p.w = w;
        } else if (pk.kind === 'health') p.hp = 100;
        else if (pk.kind === 'armor') p.armor = 100;
        else if (pk.kind === 'bribe') p.wanted = 0;
        else if (pk.kind === 'cash') {
          const amount = 100 + Math.floor(rand() * 5) * 100;
          p.money += amount;
          ev('cash', { id: p.id, amount, x: r2(pk.x), z: r2(pk.z) });
        }
        ev('pickup', { id: pk.id, kind: pk.kind, by: p.id });
        pk.active = false;
        pk.respawnAt = now + 25;
        break;
      }
    }
  }

  function stepPlayers() {
    for (const p of players.values()) {
      if (p.dead) continue;
      if (p.car != null) {
        const car = carById(p.car);
        if (!car || car.driver !== p.id) { p.car = null; continue; }
        p.x = car.x; p.z = car.z;
      }
      if (p.w !== 0 && p.ammo[p.w] <= 0) {
        let best = 0;
        for (let w = WEAPONS.length - 1; w > 0; w--) if (p.ammo[w] > 0) { best = w; break; }
        p.w = best;
      }
    }
  }

  function maintainTraffic(dt) {
    trafficTimer -= dt;
    if (trafficTimer > 0) return;
    trafficTimer = 0.5;
    const civil = cars.filter((c) => !c.cop && !c.wreck).length;
    if (civil < N_CARS) spawnTraffic(players.size > 0);
    for (const [k, t] of pairCd) if (t < now - 5) pairCd.delete(k);
  }

  return {
    world,
    join(name) {
      const clean = String(typeof name === 'string' ? name : '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || `Player${nextId}`;
      const id = nextId++;
      const p = {
        id, name: clean, x: 0, z: 0, a: 0, v: 0, hp: 100, armor: 0, car: null, w: 1,
        ammo: [Infinity, 60, 0, 0, 0], money: 0, wanted: 0, kills: 0, deaths: 0, dead: false, busted: false,
        color: PLAYER_COLORS[players.size % PLAYER_COLORS.length],
        lastShot: 0, lastCrime: 0, decayFrom: 0, killTimes: [], forceUntil: 0, deadAt: 0, movedAt: 0, budget: 0, budgetAt: 0, lastPosMsg: 0,
      };
      players.set(id, p);
      respawn(p);
      ev('join', { id, name: clean });
      return p;
    },
    leave(id) {
      const p = players.get(id);
      if (!p) return;
      if (p.car != null) {
        const car = carById(p.car);
        if (car && car.driver === id) { car.driver = null; car.v = 0; car.idleSince = now; }
      }
      players.delete(id);
      for (const c of cars) if (c.target === id) { c.target = null; c.siren = false; }
      for (const c of cops) if (c.target === id) c.target = null;
      ev('leave', { id, name: p.name });
    },
    handle(id, msg) {
      const p = players.get(id);
      if (!p) return;
      switch (msg.t) {
        case 'st': handleSt(p, msg); break;
        case 'enter': if (Number.isInteger(msg.car)) tryEnter(p, msg.car); break;
        case 'exit': doExit(p); break;
        case 'shoot': fire(p, msg); break;
        case 'weapon':
          if (Number.isInteger(msg.w) && msg.w >= 0 && msg.w < WEAPONS.length && (msg.w === 0 || p.ammo[msg.w] > 0)) p.w = msg.w;
          break;
        case 'respawn':
          if (p.dead && now - p.deadAt > 2) respawn(p);
          break;
        case 'chat': {
          if (typeof msg.text !== 'string') break;
          const text = msg.text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
          if (text && pairReady(`chat${id}`, 0.4)) ev('chat', { from: id, name: p.name, text });
          break;
        }
        default: break;
      }
    },
    step(dt) {
      now += dt;
      stepPlayers();
      stepCars(dt);
      stepPeds(dt);
      stepCops(dt);
      stepPolice(dt);
      stepPickups();
      maintainTraffic(dt);
    },
    snapshot() {
      const pl = [];
      for (const p of players.values()) {
        pl.push({
          id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), a: r2(p.a), v: r2(p.v), hp: Math.max(0, Math.round(p.hp)), armor: Math.round(p.armor),
          car: p.car, w: p.w, ammo: p.w === 0 ? -1 : p.ammo[p.w], money: p.money, wanted: level(p), kills: p.kills, deaths: p.deaths,
          dead: p.dead, color: p.color,
        });
      }
      const cs = cars.map((c) => ({
        id: c.id, x: r2(c.x), z: r2(c.z), a: r2(c.a), v: r2(c.v), type: c.type, color: c.color, hp: Math.max(0, Math.round(c.hp)),
        driver: c.driver, cop: c.cop, siren: c.siren, wreck: c.wreck,
      }));
      const ps = [];
      for (const ped of peds) ps.push({ id: ped.id, x: r2(ped.x), z: r2(ped.z), a: r2(ped.a), v: r2(ped.v), kind: ped.kind, dead: ped.dead });
      for (const c of cops) ps.push({ id: c.id, x: r2(c.x), z: r2(c.z), a: r2(c.a), v: r2(c.v), kind: 'cop', dead: c.dead });
      const pk = pickups.filter((q) => q.active).map((q) => ({ id: q.id, x: r2(q.x), z: r2(q.z), kind: q.kind }));
      return { t: 'snap', time: r2(now), players: pl, cars: cs, peds: ps, pickups: pk };
    },
  };
}
