import * as THREE from 'three';

export const ARENA = 130;
const WALL_H = 16;    // just an earth bank at the edge, not a box to stand in

export const TRENCH_DEPTH = 3.0;
export const FRIENDLY_LINE = 86;    // z of the friendly trench
export const ENEMY_LINE = -86;      // z of the enemy trench
const TRENCH_HALF = 7;              // half-width of a trench
const TRENCH_END = 102;             // trenches run from -END to +END in x

/* ================= textures ================= */

function finish(canvas, { repeatX = 1, repeatY = 1, aniso = 1 }) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  return t;
}

function noiseCanvas(base, speck, size = 256, density = 0.25) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * density; i++) {
    g.fillStyle = speck;
    g.globalAlpha = 0.1 + Math.random() * 0.5;
    const s = Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1;
    g.fillRect(Math.random() * size | 0, Math.random() * size | 0, s, s);
  }
  g.globalAlpha = 0.12;
  for (let i = 0; i < 18; i++) {
    const r = 12 + Math.random() * 46;
    const grd = g.createRadialGradient(
      Math.random() * size, Math.random() * size, 0,
      Math.random() * size, Math.random() * size, r
    );
    grd.addColorStop(0, speck);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  g.globalAlpha = 1;
  return c;
}

/** Churned mud: wet dark hollows, drier ridges, wheel ruts. */
function mudCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3b28';
  g.fillRect(0, 0, size, size);

  // broad wet and dry patches
  for (let i = 0; i < 70; i++) {
    const r = 10 + Math.random() * 54;
    const x = Math.random() * size, y = Math.random() * size;
    const wet = Math.random() < 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, wet ? 'rgba(32,24,16,0.55)' : 'rgba(104,86,60,0.4)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }

  // churned grain
  for (let i = 0; i < size * size * 0.22; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#2e2418' : '#6b5940';
    g.globalAlpha = 0.1 + Math.random() * 0.45;
    g.fillRect(Math.random() * size | 0, Math.random() * size | 0, Math.random() < 0.2 ? 2 : 1, 1);
  }
  g.globalAlpha = 1;

  // ruts gouged across it
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = 'rgba(26,20,13,0.5)';
    g.lineWidth = 2 + Math.random() * 5;
    g.beginPath();
    let x = Math.random() * size, y = 0;
    g.moveTo(x, y);
    while (y < size) { y += 16; x += (Math.random() - 0.5) * 26; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}

function facadeCanvas({ size = 256, base, panel, cols = 4, rows = 4, lit, litChance = 0.1 }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.1; i++) {
    g.fillStyle = panel;
    g.globalAlpha = Math.random() * 0.35;
    g.fillRect(Math.random() * size | 0, Math.random() * size | 0, 1, 1);
  }
  g.globalAlpha = 1;

  const cw = size / cols, ch = size / rows;
  g.strokeStyle = 'rgba(0,0,0,0.42)';
  g.lineWidth = 2;
  for (let i = 0; i <= cols; i++) { const x = Math.round(i * cw) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke(); }
  for (let i = 0; i <= rows; i++) { const y = Math.round(i * ch) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); }

  const emis = document.createElement('canvas');
  emis.width = emis.height = size;
  const e = emis.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, size, size);

  const inset = Math.min(cw, ch) * 0.22;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + inset, y = r * ch + inset;
      const w = cw - inset * 2, h = ch - inset * 2.4;
      const isLit = Math.random() < litChance;
      // most windows in a shelled building are just holes
      g.fillStyle = isLit ? lit : 'rgba(8,8,7,0.95)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 2;
      g.strokeRect(x, y, w, h);
      if (isLit) { e.fillStyle = lit; e.fillRect(x, y, w, h); }
    }
  }

  g.globalAlpha = 0.2;
  g.fillStyle = '#000';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size, w = 2 + Math.random() * 8, y = Math.random() * size * 0.5;
    g.fillRect(x, y, w, size - y);
  }
  g.globalAlpha = 1;
  return { face: c, glow: emis };
}

function puddleCanvas(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(26,30,30,0.85)');
  grd.addColorStop(0.7, 'rgba(32,34,30,0.5)');
  grd.addColorStop(1, 'rgba(40,36,28,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ================= level ================= */

export function createLevel(scene, renderer) {
  const aniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  const walls = [];   // solid boxes
  const pits = [];    // rectangular depressions in the ground
  const group = new THREE.Group();
  scene.add(group);

  /* ---------- materials ---------- */
  const mudMat = new THREE.MeshLambertMaterial({
    map: finish(mudCanvas(256), { repeatX: 30, repeatY: 30, aniso }),
  });
  const mudWallMat = new THREE.MeshLambertMaterial({
    map: finish(mudCanvas(128), { repeatX: 10, repeatY: 1, aniso }),
    color: 0xb9a78c,
  });
  const sandbagMat = new THREE.MeshLambertMaterial({
    map: finish(noiseCanvas('#6d6042', '#8a7a55', 128, 0.35), { repeatX: 2, repeatY: 1, aniso }),
  });
  const timberMat = new THREE.MeshLambertMaterial({ color: 0x5a4731 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x474c44 });
  const rustMat = new THREE.MeshLambertMaterial({ color: 0x4e3a28 });
  const wireMat = new THREE.MeshLambertMaterial({ color: 0x6a6354 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
  const puddleMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(puddleCanvas()),
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });

  const STYLES = [
    { base: '#3a352a', panel: '#524b3c', lit: '#ffb15e', cols: 4, rows: 4, litChance: 0.07 },
    { base: '#363a35', panel: '#4b514a', lit: '#ffd08a', cols: 5, rows: 4, litChance: 0.05 },
  ].map(facadeCanvas);

  /* ---------- helpers ---------- */

  function solid(x, z, w, d, h, mat, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    group.add(m);
    walls.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h });
    return m;
  }

  function deco(x, y, z, w, h, d, mat, rotY = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rotY) m.rotation.y = rotY;
    group.add(m);
    return m;
  }

  function groundPlane(minX, maxX, minZ, maxZ, y = 0) {
    const w = maxX - minX, d = maxZ - minZ;
    if (w <= 0 || d <= 0) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mudMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    group.add(m);
  }

  /* ---------- trenches ----------
     A trench is a real depression: the ground inside it is lower, the mud floor
     is cut out of the surrounding ground, and earth walls line the sides.
     Everything taller than a character's step height is solid, so the mech
     strides over the sandbags while infantry has to use the gaps.            */

  function trench(centreZ, friendly) {
    const minZ = centreZ - TRENCH_HALF, maxZ = centreZ + TRENCH_HALF;
    const minX = -TRENCH_END, maxX = TRENCH_END;
    const floorY = -TRENCH_DEPTH;

    pits.push({ minX, maxX, minZ, maxZ, floorY });

    // trench floor and its earth sides
    groundPlane(minX, maxX, minZ, maxZ, floorY + 0.01);
    deco((minX + maxX) / 2, floorY / 2, minZ - 0.5, maxX - minX, TRENCH_DEPTH, 1, mudWallMat);
    deco((minX + maxX) / 2, floorY / 2, maxZ + 0.5, maxX - minX, TRENCH_DEPTH, 1, mudWallMat);
    deco(minX - 0.5, floorY / 2, centreZ, 1, TRENCH_DEPTH, maxZ - minZ, mudWallMat);
    deco(maxX + 0.5, floorY / 2, centreZ, 1, TRENCH_DEPTH, maxZ - minZ, mudWallMat);

    // duckboards along the bottom
    for (let x = minX + 4; x < maxX - 4; x += 9) {
      deco(x, floorY + 0.12, centreZ, 8.4, 0.24, 7, timberMat);
    }

    // revetment posts holding the walls back
    for (let x = minX + 6; x < maxX - 6; x += 16) {
      deco(x, floorY + TRENCH_DEPTH / 2, minZ + 0.4, 0.4, TRENCH_DEPTH, 0.4, timberMat);
      deco(x, floorY + TRENCH_DEPTH / 2, maxZ - 0.4, 0.4, TRENCH_DEPTH, 0.4, timberMat);
    }

    // sandbag parapet along the front lip, with gaps to move through
    const frontZ = friendly ? minZ - 1.4 : maxZ + 1.4;
    for (let x = minX; x < maxX; x += 7) {
      if (Math.random() < 0.16) continue;                 // a gap
      const h = 1.6 + Math.random() * 0.6;
      solid(x + 3.5, frontZ, 6.4, 2.6, h, sandbagMat);
      deco(x + 3.5, h + 0.18, frontZ, 5.6, 0.4, 2.2, sandbagMat);
    }

    // a back lip too, lower
    const backZ = friendly ? maxZ + 1.2 : minZ - 1.2;
    for (let x = minX; x < maxX; x += 11) {
      if (Math.random() < 0.3) continue;
      solid(x + 5, backZ, 7, 2.2, 1.2 + Math.random() * 0.5, sandbagMat);
    }
    return { minX, maxX, minZ, maxZ, floorY, frontZ };
  }

  const friendlyTrench = trench(FRIENDLY_LINE, true);
  const enemyTrench = trench(ENEMY_LINE, false);

  /* ---------- the ground, cut around the trenches ---------- */
  const fT = friendlyTrench, eT = enemyTrench;
  groundPlane(-ARENA, ARENA, fT.maxZ, ARENA);                  // behind our line
  groundPlane(-ARENA, ARENA, eT.maxZ, fT.minZ);                // no man's land
  groundPlane(-ARENA, ARENA, -ARENA, eT.minZ);                 // behind theirs
  for (const t of [fT, eT]) {                                   // the ends of each trench row
    groundPlane(-ARENA, t.minX, t.minZ, t.maxZ);
    groundPlane(t.maxX, ARENA, t.minZ, t.maxZ);
  }

  /* ---------- perimeter ---------- */
  const T = 6;
  solid(0,  ARENA, ARENA * 2 + T * 2, T, WALL_H, mudWallMat);
  solid(0, -ARENA, ARENA * 2 + T * 2, T, WALL_H, mudWallMat);
  solid( ARENA, 0, T, ARENA * 2 + T * 2, WALL_H, mudWallMat);
  solid(-ARENA, 0, T, ARENA * 2 + T * 2, WALL_H, mudWallMat);

  /* ---------- shell craters: raised rims and a dark scar ---------- */
  const craterMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(noiseCanvas('#2a2016', '#3b2d1e', 128, 0.4)),
    transparent: true, opacity: 0.75, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  for (let i = 0; i < 26; i++) {
    const x = (Math.random() - 0.5) * 240;
    const z = -70 + Math.random() * 150;
    if (Math.hypot(x, z - 112) < 26) continue;
    const r = 5 + Math.random() * 9;
    const scar = new THREE.Mesh(new THREE.CircleGeometry(r, 12), craterMat);
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(x, 0.04, z);
    group.add(scar);
    // churned rim
    const lumps = 5 + ((Math.random() * 4) | 0);
    for (let k = 0; k < lumps; k++) {
      const a = (k / lumps) * Math.PI * 2 + Math.random() * 0.4;
      deco(x + Math.cos(a) * r, 0.35, z + Math.sin(a) * r, 2.6, 0.9, 2.6, mudWallMat, a);
    }
  }

  /* ---------- puddles ---------- */
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * 250;
    const z = (Math.random() - 0.5) * 250;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), puddleMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI;
    m.position.set(x, 0.05, z);
    m.scale.set(5 + Math.random() * 13, 4 + Math.random() * 10, 1);
    group.add(m);
  }

  /* ---------- barbed wire belts in front of each line ---------- */
  function wireBelt(z, count) {
    for (let i = 0; i < count; i++) {
      const x = -TRENCH_END + 4 + (i / count) * (TRENCH_END * 2 - 8);
      const jitter = (Math.random() - 0.5) * 3;
      deco(x, 1.5, z + jitter, 0.35, 3.0, 0.35, wireMat);           // picket
      for (let k = 0; k < 2; k++) {
        deco(x + 5.5, 0.9 + k * 1.1, z + jitter, 11.4, 0.1, 0.1, wireMat,
             (Math.random() - 0.5) * 0.25);
      }
    }
  }
  wireBelt(FRIENDLY_LINE - 15, 13);
  wireBelt(ENEMY_LINE + 15, 13);

  /* ---------- wrecks, ruins and debris in no man's land ---------- */
  const WRECKS = [
    [-52, 10], [44, -28], [-18, 44], [70, 22], [-78, -34], [16, -52],
  ];
  for (const w of WRECKS) {
    const rot = Math.random() * Math.PI;
    solid(w[0], w[1], 9, 5.5, 3.4, rustMat);                        // hull
    deco(w[0], 4.2, w[1], 6, 1.6, 4.4, rustMat, rot * 0.1);         // turret/cab
    deco(w[0] - 3.5, 1.2, w[1], 2.2, 2.2, 6.4, metalMat);           // track
    deco(w[0] + 3.5, 1.2, w[1], 2.2, 2.2, 6.4, metalMat);
  }

  // burning hulks: the only bright things out there
  const FIRES = [[-52, 10], [44, -28], [-18, 44], [70, 22], [16, -52]];
  for (const f of FIRES) {
    deco(f[0], 5.4, f[1], 2.2, 1.6, 2.2, emberMat);
    const l = new THREE.PointLight(0xff8534, 2.2, 70, 2);
    l.position.set(f[0], 7, f[1]);
    scene.add(l);
  }

  // shelled buildings around the rim, well back from the fighting
  const RUINS = [
    [-100, 112, 22, 18, 20], [96, 114, 20, 16, 15],
    [-104, -110, 20, 20, 17], [102, -106, 18, 22, 22],
    [-110, 20, 16, 26, 13], [110, -20, 16, 24, 18],
  ];
  for (const r of RUINS) {
    const style = STYLES[(Math.random() * STYLES.length) | 0];
    const repeatX = Math.max(1, Math.round(r[2] / 11));
    const repeatY = Math.max(1, Math.round(r[4] / 11));
    const mat = new THREE.MeshLambertMaterial({
      map: finish(style.face, { repeatX, repeatY, aniso }),
      emissive: 0xffffff,
      emissiveMap: finish(style.glow, { repeatX, repeatY, aniso }),
      emissiveIntensity: 0.8,
    });
    solid(r[0], r[1], r[2], r[3], r[4], mat);
    // broken roofline
    for (let k = 0; k < 4; k++) {
      const cw = r[2] / 4;
      deco(r[0] - r[2] / 2 + cw * (k + 0.5), r[4] + Math.random() * 1.8, r[1],
           cw * 0.9, 1.6 + Math.random() * 2.4, r[3], mudWallMat);
    }
  }

  // sandbag strongpoints and crates behind our line
  for (let i = 0; i < 10; i++) {
    const x = (Math.random() - 0.5) * 200;
    const z = FRIENDLY_LINE + 12 + Math.random() * 26;
    if (Math.hypot(x, z - 112) < 22) continue;
    solid(x, z, 6 + Math.random() * 4, 4, 1.6 + Math.random(), sandbagMat);
  }
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - 0.5) * 230;
    const z = -40 + Math.random() * 180;
    if (Math.hypot(x, z - 112) < 24) continue;
    if (Math.abs(z - FRIENDLY_LINE) < 12 || Math.abs(z - ENEMY_LINE) < 12) continue;
    const long = Math.random() < 0.5;
    solid(x, z, long ? 7 : 4, long ? 4 : 7, 2.6 + Math.random() * 1.6, timberMat);
  }

  /* ---------- weather and light: overcast, smoke-choked ---------- */
  scene.add(new THREE.HemisphereLight(0x9a9684, 0x3a3226, 1.25));
  const sun = new THREE.DirectionalLight(0xffe0b4, 0.8);
  sun.position.set(-40, 90, 70);
  scene.add(sun);

  scene.fog = new THREE.Fog(0x554d3e, 55, 215);
  scene.background = new THREE.Color(0x554d3e);

  /* ================= terrain queries ================= */

  /** Ground height ignoring solid boxes: 0, or lower inside a trench. */
  function baseGroundAt(x, z) {
    for (const p of pits) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return p.floorY;
    }
    return 0;
  }

  /**
   * Push a circle out of solid boxes. Anything whose top is within `stepUp` of
   * the feet is walked over instead — that's what lets the mech stride across
   * sandbags that stop infantry dead.
   */
  function resolveCircle(x, z, r, footY, stepUp = 0.2) {
    for (let pass = 0; pass < 2; pass++) {
      for (const w of walls) {
        if (w.top <= footY + stepUp) continue;
        const cx = Math.max(w.minX, Math.min(x, w.maxX));
        const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) {
          const toMinX = x - w.minX, toMaxX = w.maxX - x;
          const toMinZ = z - w.minZ, toMaxZ = w.maxZ - z;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) x = w.minX - r;
          else if (m === toMaxX) x = w.maxX + r;
          else if (m === toMinZ) z = w.minZ - r;
          else z = w.maxZ + r;
          continue;
        }
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
    const lim = ARENA - r - 1;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return { x, z };
  }

  /** Highest surface under (x,z) at or below ceilY — trench floors included. */
  function groundAt(x, z, ceilY = Infinity) {
    let best = baseGroundAt(x, z);
    for (const w of walls) {
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (w.top > best && w.top <= ceilY + 0.01) best = w.top;
    }
    return best;
  }

  /** Inside anything solid, or below the mud? Used by projectiles. */
  function solidAt(x, y, z) {
    if (Math.abs(x) > ARENA || Math.abs(z) > ARENA) return true;
    if (y < baseGroundAt(x, z)) return true;
    for (const w of walls) {
      if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && y <= w.top) return true;
    }
    return false;
  }

  function clearSpot(x, z, r) {
    if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10) return null;
    const fixed = resolveCircle(x, z, r, groundAt(x, z), 0.2);
    if (Math.abs(fixed.x - x) > 0.05 || Math.abs(fixed.z - z) > 0.05) return null;
    return { x, z };
  }

  /** Somewhere out in front, for the aliens coming over the top. */
  function enemySpawnPoint(r = 1.2) {
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * (TRENCH_END * 2 - 10);
      // in their trench, or in the ground just behind it
      // mostly on open ground: a few in the trench itself for the look of it
      const roll = Math.random();
      const z = roll < 0.2
        ? ENEMY_LINE + (Math.random() - 0.5) * (TRENCH_HALF * 1.4)
        : roll < 0.6
          ? ENEMY_LINE + TRENCH_HALF + 4 + Math.random() * 14
          : ENEMY_LINE - 10 - Math.random() * 24;
      const hit = clearSpot(x, z, r);
      if (hit) return hit;
    }
    return { x: 0, z: ENEMY_LINE };
  }

  /** Somewhere along our own line, for reinforcements. */
  function friendlySpawnPoint(r = 0.8) {
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * (TRENCH_END * 2 - 14);
      const z = FRIENDLY_LINE + 5 + Math.random() * 20;
      const hit = clearSpot(x, z, r);
      if (hit) return hit;
    }
    return { x: 0, z: FRIENDLY_LINE + 12 };
  }

  /** General-purpose clear spot a distance away from a point. */
  function spawnPoint(fromX, fromZ, minDist = 55, r = 1.2) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = minDist + Math.random() * 32;
      const hit = clearSpot(fromX + Math.cos(a) * rad, fromZ + Math.sin(a) * rad, r);
      if (hit) return hit;
    }
    for (let i = 0; i < 90; i++) {
      const x = (Math.random() - 0.5) * 220, z = (Math.random() - 0.5) * 220;
      if (Math.hypot(x - fromX, z - fromZ) < minDist * 0.6) continue;
      const hit = clearSpot(x, z, r);
      if (hit) return hit;
    }
    return { x: Math.max(-ARENA + 14, Math.min(ARENA - 14, fromX + 60)), z: fromZ };
  }

  return {
    group, walls, pits,
    resolveCircle, groundAt, baseGroundAt, solidAt,
    spawnPoint, enemySpawnPoint, friendlySpawnPoint,
    friendlyTrench, enemyTrench,
  };
}
