import * as THREE from 'three';

/* ---------- shared materials: futuristic armoured aliens ---------- */
// Kept deliberately light and slightly self-lit: these need to read instantly
// against a dark floor, or the fight stops being readable.
const MAT = {
  armour:   new THREE.MeshLambertMaterial({ color: 0x8295a6, emissive: 0x161e26 }),
  armourHi: new THREE.MeshLambertMaterial({ color: 0xa3b7c8, emissive: 0x1a232c }),
  flesh:    new THREE.MeshLambertMaterial({ color: 0x8b9c6e }),
  visor:    new THREE.MeshBasicMaterial({ color: 0xff4d2a }),
  vent:     new THREE.MeshBasicMaterial({ color: 0xff8a3c }),
  heavy:    new THREE.MeshLambertMaterial({ color: 0x9c8368, emissive: 0x241a12 }),
  heavyHi:  new THREE.MeshLambertMaterial({ color: 0xbda182, emissive: 0x2a2016 }),
  heavyVisor: new THREE.MeshBasicMaterial({ color: 0xffd23c }),
};

const ENEMY_STEP = 5.6;          // trench floor is 3 down and the parapet 2.5 up,
                                 // so anything less leaves them jammed in their own line

const PLASMA_GEO = new THREE.SphereGeometry(0.34, 7, 6);
const PLASMA_MAT = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
const PLASMA_MAT_HEAVY = new THREE.MeshBasicMaterial({ color: 0xffd23c });

const TYPES = {
  grunt: {
    hp: 100, speed: 11.5, radius: 0.78, height: 2.4, scale: 1.25,
    range: 34, burst: 3, burstGap: 0.16, cooldown: [1.9, 3.3],
    damage: 10, projSpeed: 54, melee: 14,
    armour: MAT.armour, armourHi: MAT.armourHi, visor: MAT.visor, plasma: PLASMA_MAT,
  },
  heavy: {
    hp: 280, speed: 7.2, radius: 1.15, height: 3.3, scale: 1.7,
    range: 42, burst: 1, burstGap: 0, cooldown: [2.2, 3.4],
    damage: 22, projSpeed: 44, melee: 26,
    armour: MAT.heavy, armourHi: MAT.heavyHi, visor: MAT.heavyVisor, plasma: PLASMA_MAT_HEAVY,
  },
};

/* ---------- model ---------- */

function buildAlien(def) {
  const g = new THREE.Group();
  const s = def.scale;
  const A = def.armour, H = def.armourHi;

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * s, y * s, z * s);
    g.add(m);
    return m;
  };

  // legs (kept as refs so they can swing)
  const legGeo = new THREE.BoxGeometry(0.26, 0.9, 0.3);
  const legL = add(legGeo, A, -0.22, 0.45, 0);
  const legR = add(legGeo, A, 0.22, 0.45, 0);
  legL.geometry.translate(0, -0.45, 0);
  legR.geometry.translate(0, -0.45, 0);
  legL.position.y = 0.9 * s;
  legR.position.y = 0.9 * s;

  // boots
  add(new THREE.BoxGeometry(0.34, 0.18, 0.46), H, -0.22, 0.09, 0.04);
  add(new THREE.BoxGeometry(0.34, 0.18, 0.46), H, 0.22, 0.09, 0.04);

  // torso + chest plate
  add(new THREE.BoxGeometry(0.72, 0.78, 0.44), A, 0, 1.3, 0);
  add(new THREE.BoxGeometry(0.8, 0.46, 0.14), H, 0, 1.42, -0.26);
  add(new THREE.BoxGeometry(0.3, 0.12, 0.1), MAT.vent, 0, 1.2, -0.3);

  // pauldrons
  add(new THREE.BoxGeometry(0.26, 0.3, 0.42), H, -0.49, 1.6, 0);
  add(new THREE.BoxGeometry(0.26, 0.3, 0.42), H, 0.49, 1.6, 0);

  // arms + the weapon it points at you
  const armGeo = new THREE.BoxGeometry(0.2, 0.62, 0.22);
  const armL = add(armGeo, A, -0.48, 1.18, 0);
  const armR = add(armGeo, A, 0.48, 1.18, 0);
  const gun = add(new THREE.BoxGeometry(0.17, 0.17, 0.78), H, 0.48, 1.0, -0.42);
  add(new THREE.BoxGeometry(0.1, 0.1, 0.12), def.visor, 0.48, 1.0, -0.86);

  // head: narrow helmet with a glowing visor band
  add(new THREE.BoxGeometry(0.42, 0.4, 0.42), A, 0, 1.92, 0);
  add(new THREE.BoxGeometry(0.44, 0.1, 0.06), def.visor, 0, 1.96, -0.23);
  add(new THREE.BoxGeometry(0.1, 0.26, 0.1), H, 0, 2.2, 0.1);

  // backpack
  add(new THREE.BoxGeometry(0.5, 0.5, 0.2), H, 0, 1.36, 0.3);

  return { group: g, legL, legR, armL, armR, gun };
}

/* ---------- one alien ---------- */

class Enemy {
  constructor(game, kind, x, z) {
    this.game = game;
    this.kind = kind;
    const def = TYPES[kind];
    this.def = def;

    this.hp = def.hp;
    this.maxHp = def.hp;
    this.radius = def.radius * def.scale;
    this.height = def.height * def.scale;
    this.speed = def.speed;

    this.pos = new THREE.Vector3(x, game.level.groundAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.dying = false;
    this.walkPhase = Math.random() * 10;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.fireTimer = 0.8 + Math.random() * 1.6;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.meleeTimer = 0;
    this.hitFlash = 0;

    const built = buildAlien(def);
    this.group = built.group;
    this.parts = built;
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
  }

  center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  damage(amount, dir, at, byPlayer = true) {
    if (this.dying) return;
    this.hp -= amount;
    this.hitFlash = 0.09;

    const hitPoint = at ? at.clone() : this.center();
    this.game.gore.sparks(hitPoint, dir.clone().negate(), 3);
    // a spray of blood off the impact, plus a splat where it lands
    if (Math.random() < 0.3) {
      this.game.gore.addDecal(
        this.pos.x + dir.x * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3,
        this.pos.z + dir.z * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3,
        0.9 + Math.random() * 1.6
      );
    }

    if (this.hp <= 0) this.die(dir, amount, byPlayer);
    else this.game.audio.enemyHit();
  }

  die(dir, overkill = 0, byPlayer = true) {
    this.dying = true;
    const c = this.center();

    // little giblets everywhere
    const chunks = overkill >= 180 ? 24 : 15;
    this.game.gore.giblets(c, dir, chunks, this.def.scale);
    // blood on the ground
    this.game.gore.bloodPool(this.pos, 5 * this.def.scale);
    // and a corpse left behind
    this.game.scene.remove(this.group);
    this.game.gore.addCorpse(this.group, this.pos, this.yaw, dir);

    this.game.audio.enemyDeath();
    this.game.onKill(this, byPlayer);
  }

  shoot() {
    const def = this.def;
    const origin = new THREE.Vector3(
      this.pos.x, this.pos.y + this.height * 0.62, this.pos.z
    );
    let target;
    if (this.aimTarget && !this.aimTarget.dying) {
      target = this.aimTarget.center();
    } else {
      target = this.game.player.camera.position.clone();
      target.y -= 1.2;
    }
    const dir = target.sub(origin).normalize();
    // they're not perfect shots
    dir.x += (Math.random() - 0.5) * 0.11;
    dir.y += (Math.random() - 0.5) * 0.07;
    dir.z += (Math.random() - 0.5) * 0.11;
    dir.normalize();

    // No light on the bolt: adding and removing lights forces Three.js to
    // recompile every shader in the scene, which stalls the frame. The bolt is
    // an unlit material, so it glows on its own.
    const mesh = new THREE.Mesh(PLASMA_GEO, def.plasma);
    mesh.position.copy(origin);
    mesh.scale.setScalar(def.scale * 1.1);
    this.game.scene.add(mesh);

    this.game.enemies.projectiles.push({
      mesh,
      pos: origin.clone(),
      vel: dir.multiplyScalar(def.projSpeed),
      damage: def.damage,
      life: 4,
    });
    this.game.audio.enemyShoot();
  }

  update(dt, player) {
    const level = this.game.level;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toX = dist > 0.01 ? dx / dist : 0;
    const toZ = dist > 0.01 ? dz / dist : 0;

    this.yaw = Math.atan2(toX, toZ) + Math.PI;

    // Shoot at you by default, but switch to one of our soldiers if one is
    // much closer — otherwise the infantry fight would be entirely one-sided.
    this.aimTarget = null;
    const friend = this.game.friendlies ? this.game.friendlies.nearestTo(this.pos, 55) : null;
    if (friend) {
      const fd = Math.hypot(friend.pos.x - this.pos.x, friend.pos.z - this.pos.z);
      if (fd < dist * 0.65) this.aimTarget = friend;
    }

    // --- movement intent ---
    let mx = 0, mz = 0;
    const def = this.def;
    if (!player.dead) {
      if (dist > def.range) {               // close in
        mx = toX; mz = toZ;
      } else if (dist < def.range * 0.45) {  // too close, back off and circle
        mx = -toX * 0.7; mz = -toZ * 0.7;
      }
      // strafe to make them awkward to track
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1.2 + Math.random() * 2.4;
        this.strafeDir *= -1;
      }
      mx += -toZ * this.strafeDir * 0.6;
      mz += toX * this.strafeDir * 0.6;
    }

    // --- keep out of each other's way ---
    for (const o of this.game.enemies.list) {
      if (o === this || o.dying) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const want = this.radius + o.radius + 0.6;
      if (d2 > 0.001 && d2 < want * want) {
        const d = Math.sqrt(d2);
        mx += (ox / d) * 1.4;
        mz += (oz / d) * 1.4;
      }
    }

    const ml = Math.hypot(mx, mz);
    if (ml > 0.001) { mx /= ml; mz /= ml; }

    const sp = this.speed;
    let nx = this.pos.x + mx * sp * dt;
    let nz = this.pos.z + mz * sp * dt;
    const fixed = level.resolveCircle(nx, nz, this.radius, this.pos.y, ENEMY_STEP);
    nx = fixed.x; nz = fixed.z;

    // gravity / standing on blocks
    const ground = level.groundAt(nx, nz, this.pos.y + ENEMY_STEP);
    let ny = this.pos.y;
    if (ny > ground) {
      this.vel.y -= 80 * dt;
      ny += this.vel.y * dt;
      if (ny < ground) { ny = ground; this.vel.y = 0; }
    } else {
      ny = ground;
      this.vel.y = 0;
    }

    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.set(nx, ny, nz);

    // --- shooting ---
    if (!player.dead) {
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.shoot();
          this.burstLeft--;
          this.burstTimer = def.burstGap;
          if (this.burstLeft <= 0) {
            this.fireTimer = def.cooldown[0] + Math.random() * (def.cooldown[1] - def.cooldown[0]);
          }
        }
      } else {
        this.fireTimer -= dt;
        const canFire = this.aimTarget ? true : (dist < def.range * 1.6 && this.hasLineOfSight(player));
        if (this.fireTimer <= 0 && canFire) {
          this.burstLeft = def.burst;
          this.burstTimer = 0;
        }
      }

      // --- melee when they get under your feet ---
      this.meleeTimer -= dt;
      if (dist < this.radius + 4.2 && this.meleeTimer <= 0) {
        this.meleeTimer = 1.5;
        player.damage(def.melee);
        this.game.audio.melee();
      } else if (this.aimTarget && !this.aimTarget.dying && this.meleeTimer <= 0) {
        const fd = Math.hypot(this.aimTarget.pos.x - this.pos.x, this.aimTarget.pos.z - this.pos.z);
        if (fd < this.radius + 2.6) {
          this.meleeTimer = 1.5;
          this.aimTarget.damage(def.melee * 1.6, new THREE.Vector3(toX, 0.4, toZ).normalize());
          this.game.audio.melee();
        }
      }
    }

    // --- animate ---
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (moved > 0.02) {
      this.walkPhase += dt * 11;
      const sw = Math.sin(this.walkPhase) * 0.75;
      this.parts.legL.rotation.x = sw;
      this.parts.legR.rotation.x = -sw;
      this.parts.armL.rotation.x = -sw * 0.4;
      this.group.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.07 * def.scale;
    } else {
      this.parts.legL.rotation.x *= 0.85;
      this.parts.legR.rotation.x *= 0.85;
    }

    // hit flash
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = this.hitFlash > 0;
      this.group.traverse((o) => {
        if (o.isMesh && o.material === def.armour) o.visible = !on || Math.random() > 0.3;
      });
      if (!on) this.group.traverse((o) => { if (o.isMesh) o.visible = true; });
    }
  }

  hasLineOfSight(player) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.62, this.pos.z);
    const to = player.camera.position;
    const d = new THREE.Vector3().subVectors(to, from);
    const dist = d.length();
    d.normalize();
    for (let t = 2; t < dist - 2; t += 2.2) {
      if (this.game.level.solidAt(from.x + d.x * t, from.y + d.y * t, from.z + d.z * t)) return false;
    }
    return true;
  }
}

/* ---------- pickups ---------- */

class Pickup {
  constructor(game, x, z) {
    this.game = game;
    this.pos = new THREE.Vector3(x, game.level.groundAt(x, z) + 1.6, z);
    this.spin = Math.random() * 6;
    this.taken = false;

    this.group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x2f4a2a })
    );
    this.group.add(box);
    for (const axis of ['x', 'y', 'z']) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(axis === 'x' ? 1.8 : 0.4, axis === 'y' ? 1.8 : 0.4, axis === 'z' ? 1.8 : 0.4),
        new THREE.MeshBasicMaterial({ color: 0x8dff6a })
      );
      this.group.add(bar);
    }
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
  }

  update(dt, player) {
    this.spin += dt * 2.2;
    this.group.rotation.y = this.spin;
    this.group.position.y = this.pos.y + Math.sin(this.spin * 1.6) * 0.3;

    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (d < 4.5 && player.health < 1000) {
      this.taken = true;
      player.heal(280);
      this.game.hud.toast('HULL REPAIRED +280');
      this.game.audio.pickup();
      this.game.scene.remove(this.group);
    }
  }
}

/* ---------- waves ---------- */

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.projectiles = [];
    this.pickups = [];
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenWaves = 2.5;
  }

  reset() {
    for (const e of this.list) this.game.scene.remove(e.group);
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    for (const p of this.pickups) this.game.scene.remove(p.group);
    this.list.length = 0;
    this.projectiles.length = 0;
    this.pickups.length = 0;
    this.wave = 0;
    this.spawnQueue.length = 0;
    this.betweenWaves = 2.5;
  }

  get alive() {
    return this.list.length + this.spawnQueue.length;
  }

  startWave() {
    this.wave++;
    const w = this.wave;
    const grunts = 4 + Math.round(w * 1.8);
    const heavies = w < 3 ? 0 : Math.floor((w - 2) * 0.7);

    this.spawnQueue = [];
    for (let i = 0; i < grunts; i++) this.spawnQueue.push('grunt');
    for (let i = 0; i < heavies; i++) this.spawnQueue.push('heavy');
    // shuffle so heavies don't all arrive last
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.spawnTimer = 0;

    if (this.game.friendlies) this.game.friendlies.reinforce();

    this.game.hud.waveBanner(w, `${grunts + heavies} HOSTILES INBOUND`);
    this.game.audio.waveStart();
  }

  spawnOne(kind) {
    // They come over the top of their own trench, not out of thin air behind you.
    const spot = this.game.level.enemySpawnPoint(TYPES[kind].radius * TYPES[kind].scale);
    this.list.push(new Enemy(this.game, kind, spot.x, spot.z));
  }

  dropPickup() {
    // resupply lands behind our own line
    const spot = this.game.level.friendlySpawnPoint(1.5);
    this.pickups.push(new Pickup(this.game, spot.x, spot.z));
  }

  update(dt) {
    const player = this.game.player;

    // wave flow
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.list.length < 34) {
        this.spawnTimer = 0.35 + Math.random() * 0.4;
        this.spawnOne(this.spawnQueue.pop());
      }
    } else if (this.list.length === 0 && !player.dead) {
      this.betweenWaves -= dt;
      if (this.betweenWaves <= 0) {
        this.betweenWaves = 9;
        if (this.wave > 0) {
          this.dropPickup();
          if (this.wave % 2 === 0) this.dropPickup();
        }
        this.startWave();
      }
    }

    // enemies
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dying) { this.list.splice(i, 1); continue; }
      e.update(dt, player);
    }

    // their plasma
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const stepDist = pr.vel.length() * dt;
      const dir = pr.vel.clone().normalize();
      let done = false;

      const steps = Math.max(1, Math.ceil(stepDist / 1.4));
      for (let s = 1; s <= steps && !done; s++) {
        const t = (stepDist * s) / steps;
        const x = pr.pos.x + dir.x * t;
        const y = pr.pos.y + dir.y * t;
        const z = pr.pos.z + dir.z * t;

        // the mech is a big target
        const pdx = x - player.pos.x, pdz = z - player.pos.z;
        if (!player.dead &&
            pdx * pdx + pdz * pdz < 2.9 * 2.9 &&
            y > player.pos.y && y < player.pos.y + 9) {
          player.damage(pr.damage);
          this.game.gore.sparks(new THREE.Vector3(x, y, z), dir, 7);
          done = true;
          break;
        }
        if (this.game.friendlies && this.game.friendlies.hitAt(x, y, z, pr.damage, dir, false)) {
          done = true;
          break;
        }
        if (this.game.level.solidAt(x, y, z)) {
          this.game.gore.sparks(new THREE.Vector3(x, y, z), dir, 5);
          done = true;
          break;
        }
      }

      if (!done) {
        pr.pos.add(dir.multiplyScalar(stepDist));
        pr.mesh.position.copy(pr.pos);
        pr.life -= dt;
        if (pr.life > 0) continue;
      }

      this.game.scene.remove(pr.mesh);
      this.projectiles.splice(i, 1);
    }

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      this.pickups[i].update(dt, player);
      if (this.pickups[i].taken) this.pickups.splice(i, 1);
    }
  }
}
