export const CFG = {
  BLOCKS: 10,
  BLOCK: 64,
  ROAD: 20,
  SIDEWALK: 4,
  LANE: 3,
};
CFG.CELL = CFG.BLOCK + CFG.ROAD;
CFG.SIZE = CFG.BLOCKS * CFG.CELL + CFG.ROAD;

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  downtown: ['#5b6b7a', '#3d4a57', '#77838f', '#2f3b47', '#8a97a3'],
  vice: ['#ff5fa2', '#3ee0d0', '#ffd166', '#c084fc', '#ff8c5a', '#f4f1de'],
  beach: ['#f4e3c1', '#ffd6a5', '#9bf6ff', '#ffadad', '#fdffb6'],
  suburb: ['#c9ada7', '#e9c46a', '#a3b18a', '#dda15e', '#bcb8b1'],
  industrial: ['#6b705c', '#7f5539', '#582f0e', '#52525b', '#8d99ae'],
  park: ['#3a7d44'],
};

function districtOf(i, j) {
  const n = CFG.BLOCKS;
  if (i >= n - 2) return 'beach';
  if (i >= 3 && i <= 5 && j >= 3 && j <= 6) return 'downtown';
  if (i >= 6 && i <= 7) return 'vice';
  if (j <= 1 && i <= 5) return 'industrial';
  return 'suburb';
}

export function generateWorld(seed = 1) {
  const rnd = mulberry32(seed);
  const { BLOCKS, BLOCK, ROAD, SIDEWALK, CELL, SIZE } = CFG;
  const roads = [];
  for (let i = 0; i <= BLOCKS; i++) roads.push(ROAD / 2 + i * CELL);

  const blocks = [];
  const buildings = [];
  const props = [];
  const grid = [];
  let bid = 0;

  for (let i = 0; i < BLOCKS; i++) {
    grid.push([]);
    for (let j = 0; j < BLOCKS; j++) {
      const x0 = ROAD + i * CELL;
      const z0 = ROAD + j * CELL;
      let district = districtOf(i, j);
      if (district !== 'downtown' && district !== 'beach' && rnd() < 0.1) district = 'park';
      const block = { i, j, x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK, district, buildings: [] };
      blocks.push(block);
      grid[i].push(block);

      const ix0 = x0 + SIDEWALK;
      const iz0 = z0 + SIDEWALK;
      const inner = BLOCK - SIDEWALK * 2;

      if (district === 'park') {
        for (let k = 0; k < 14; k++) {
          props.push({ type: rnd() < 0.5 ? 'palm' : 'tree', x: ix0 + rnd() * inner, z: iz0 + rnd() * inner, s: 0.8 + rnd() * 0.6 });
        }
        continue;
      }

      const nx = district === 'downtown' ? 1 + (rnd() < 0.5 ? 1 : 0) : 2 + (rnd() < 0.4 ? 1 : 0);
      const nz = district === 'downtown' ? 1 + (rnd() < 0.5 ? 1 : 0) : 2;
      const gap = district === 'suburb' ? 7 : 4;
      const lw = (inner - gap * (nx - 1)) / nx;
      const ld = (inner - gap * (nz - 1)) / nz;
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          if (district !== 'downtown' && rnd() < 0.12) {
            props.push({ type: 'palm', x: ix0 + a * (lw + gap) + lw / 2, z: iz0 + b * (ld + gap) + ld / 2, s: 1 });
            continue;
          }
          const shrinkW = district === 'suburb' ? 0.55 + rnd() * 0.3 : 0.8 + rnd() * 0.2;
          const shrinkD = district === 'suburb' ? 0.55 + rnd() * 0.3 : 0.8 + rnd() * 0.2;
          const w = lw * shrinkW;
          const d = ld * shrinkD;
          const cx = ix0 + a * (lw + gap) + lw / 2;
          const cz = iz0 + b * (ld + gap) + ld / 2;
          let h;
          if (district === 'downtown') h = 30 + rnd() * 60;
          else if (district === 'vice') h = 10 + rnd() * 22;
          else if (district === 'beach') h = 8 + rnd() * 26;
          else if (district === 'industrial') h = 7 + rnd() * 8;
          else h = 4 + rnd() * 5;
          const pal = PALETTES[district];
          const bld = {
            id: bid++,
            x: cx, z: cz, w, d, h,
            x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2,
            color: pal[Math.floor(rnd() * pal.length)],
            district,
            neon: district === 'vice' || (district === 'beach' && rnd() < 0.5) || (district === 'downtown' && rnd() < 0.3),
            roof: Math.floor(rnd() * 4),
          };
          buildings.push(bld);
          block.buildings.push(bld);
        }
      }
      if (district === 'beach' || district === 'vice') {
        for (let k = 0; k < 6; k++) {
          const side = Math.floor(rnd() * 4);
          const t = 2 + rnd() * (BLOCK - 4);
          const px = side === 0 ? x0 + 1.5 : side === 1 ? x0 + BLOCK - 1.5 : x0 + t;
          const pz = side === 2 ? z0 + 1.5 : side === 3 ? z0 + BLOCK - 1.5 : z0 + t;
          props.push({ type: 'palm', x: px, z: pz, s: 0.9 + rnd() * 0.4 });
        }
      }
      for (const [cx, cz] of [[x0 + 1, z0 + 1], [x0 + BLOCK - 1, z0 + 1], [x0 + 1, z0 + BLOCK - 1], [x0 + BLOCK - 1, z0 + BLOCK - 1]]) {
        props.push({ type: 'lamp', x: cx, z: cz, s: 1 });
      }
    }
  }

  const spawnPoints = [];
  for (const b of blocks) {
    spawnPoints.push({ x: b.x0 + 2, z: b.z0 + 2 });
    spawnPoints.push({ x: b.x1 - 2, z: b.z1 - 2 });
  }

  return { seed, size: SIZE, cfg: CFG, roads, blocks, grid, buildings, props, spawnPoints };
}

function blockAt(world, x, z) {
  const { ROAD, CELL, BLOCKS } = CFG;
  const i = Math.floor((x - ROAD / 2) / CELL);
  const j = Math.floor((z - ROAD / 2) / CELL);
  if (i < 0 || j < 0 || i >= BLOCKS || j >= BLOCKS) return null;
  return world.grid[i][j];
}

export function isRoad(world, x, z) {
  const { ROAD, CELL, BLOCK } = CFG;
  if (x < 0 || z < 0 || x > world.size || z > world.size) return false;
  const lx = (x % CELL + CELL) % CELL;
  const lz = (z % CELL + CELL) % CELL;
  return lx < ROAD || lz < ROAD || lx > ROAD + BLOCK || lz > ROAD + BLOCK;
}

export function collideCircle(world, x, z, r) {
  let hit = false;
  let nx = 0;
  let nz = 0;
  for (let pass = 0; pass < 2; pass++) {
    const seen = new Set();
    for (const [ox, oz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const blk = blockAt(world, x + ox, z + oz);
      if (!blk || seen.has(blk)) continue;
      seen.add(blk);
      for (const b of blk.buildings) {
        const cx = Math.max(b.x0, Math.min(x, b.x1));
        const cz = Math.max(b.z0, Math.min(z, b.z1));
        let dx = x - cx;
        let dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          dx /= d; dz /= d;
          x = cx + dx * r;
          z = cz + dz * r;
          nx = dx; nz = dz;
        } else {
          const pl = x - b.x0, pr = b.x1 - x, pt = z - b.z0, pb = b.z1 - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) { x = b.x0 - r; nx = -1; nz = 0; }
          else if (m === pr) { x = b.x1 + r; nx = 1; nz = 0; }
          else if (m === pt) { z = b.z0 - r; nx = 0; nz = -1; }
          else { z = b.z1 + r; nx = 0; nz = 1; }
        }
      }
    }
  }
  const S = world.size;
  if (x < r) { x = r; hit = true; nx = 1; nz = 0; }
  if (z < r) { z = r; hit = true; nx = 0; nz = 1; }
  if (x > S - r) { x = S - r; hit = true; nx = -1; nz = 0; }
  if (z > S - r) { z = S - r; hit = true; nx = 0; nz = -1; }
  return { x, z, hit, nx, nz };
}

export function raycast(world, ox, oz, dx, dz, max) {
  let best = max;
  for (const b of world.buildings) {
    let tmin = 0;
    let tmax = best;
    if (Math.abs(dx) < 1e-9) {
      if (ox < b.x0 || ox > b.x1) continue;
    } else {
      let t1 = (b.x0 - ox) / dx;
      let t2 = (b.x1 - ox) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (oz < b.z0 || oz > b.z1) continue;
    } else {
      let t1 = (b.z0 - oz) / dz;
      let t2 = (b.z1 - oz) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best) best = tmin;
  }
  return best;
}

export const WEAPONS = [
  { id: 0, name: 'Fists', dmg: 15, range: 2, rate: 0.45, auto: false, ammo: Infinity, spread: 0 },
  { id: 1, name: 'Pistol', dmg: 25, range: 45, rate: 0.3, auto: false, ammo: 60, spread: 0.02 },
  { id: 2, name: 'Uzi', dmg: 12, range: 40, rate: 0.08, auto: true, ammo: 150, spread: 0.07 },
  { id: 3, name: 'Shotgun', dmg: 14, range: 22, rate: 0.8, auto: false, ammo: 24, spread: 0.2, pellets: 6 },
  { id: 4, name: 'Rocket', dmg: 120, range: 60, rate: 1.4, auto: false, ammo: 5, spread: 0, explosive: true, radius: 7 },
];

export const CAR_TYPES = [
  { id: 0, name: 'Sedan', len: 4.4, wid: 2.0, maxSpeed: 26, accel: 14, hp: 100 },
  { id: 1, name: 'Sport', len: 4.2, wid: 1.9, maxSpeed: 38, accel: 22, hp: 80 },
  { id: 2, name: 'Taxi', len: 4.5, wid: 2.0, maxSpeed: 27, accel: 14, hp: 100 },
  { id: 3, name: 'Van', len: 5.2, wid: 2.2, maxSpeed: 22, accel: 10, hp: 140 },
  { id: 4, name: 'Police', len: 4.6, wid: 2.0, maxSpeed: 34, accel: 20, hp: 130 },
  { id: 5, name: 'Lowrider', len: 4.8, wid: 2.0, maxSpeed: 28, accel: 15, hp: 100 },
];
