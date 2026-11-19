import * as THREE from 'three';
import { FRIENDLY_LINE } from './level.js';

/**
 * Human infantry holding the line with you. They're a third the height of the
 * aliens and a fraction of yours — the point of them is that the battlefield
 * feels occupied, and that you can see what you're fighting for.
 */

// Your own weapons pass harmlessly through your infantry. Set this true if you
// would rather be able to mow down your own side.
export const FRIENDLY_FIRE = false;

const HEIGHT = 1.9;
const RADIUS = 0.5;
const HP = 60;
const SPEED = 7.5;
const STEP_UP = 5.6;             // same reason as the aliens: must clear a parapet
const RANGE = 105;
const BURST = 3;
const BURST_GAP = 0.13;
const SHOT_DAMAGE = 14;
const MAX_ALIVE = 14;

const MAT = {
  fatigue: new THREE.MeshLambertMaterial({ color: 0x666c45, emissive: 0x15170e }),
  webbing: new THREE.MeshLambertMaterial({ color: 0x474b31 }),
  helmet:  new THREE.MeshLambertMaterial({ color: 0x565c3b, emissive: 0x121409 }),
  skin:    new THREE.MeshLambertMaterial({ color: 0xa8855f }),
  rifle:   new THREE.MeshLambertMaterial({ color: 0x33302a }),
  flash:   new THREE.MeshBasicMaterial({ color: 0xffe08a }),
};

function buildSoldier() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const legGeo = box(0.19, 0.78, 0.22);
  legGeo.translate(0, -0.39, 0);
  const legL = add(legGeo, MAT.fatigue, -0.14, 0.82, 0);
  const legR = add(legGeo, MAT.fatigue, 0.14, 0.82, 0);
  add(box(0.24, 0.14, 0.34), MAT.webbing, -0.14, 0.07, 0.03);   // boots
  add(box(0.24, 0.14, 0.34), MAT.webbing, 0.14, 0.07, 0.03);

  add(box(0.5, 0.62, 0.3), MAT.fatigue, 0, 1.13, 0);            // torso
  add(box(0.54, 0.26, 0.34), MAT.webbing, 0, 1.08, 0);          // webbing
  add(box(0.34, 0.38, 0.18), MAT.webbing, 0, 1.18, 0.23);       // pack

  add(box(0.14, 0.44, 0.16), MAT.fatigue, -0.32, 1.18, -0.02);  // arms
  add(box(0.14, 0.44, 0.16), MAT.fatigue, 0.32, 1.18, -0.02);

  add(box(0.19, 0.19, 0.19), MAT.skin, 0, 1.54, 0);             // head
  add(box(0.3, 0.14, 0.32), MAT.helmet, 0, 1.63, 0);            // helmet
  add(box(0.34, 0.05, 0.12), MAT.helmet, 0, 1.58, -0.14);       // brim

  add(box(0.08, 0.08, 0.86), MAT.rifle, 0.26, 1.16, -0.38);     // rifle
  const flash = add(new THREE.SphereGeometry(0.14, 5, 4), MAT.flash, 0.26, 1.16, -0.82);
  flash.visible = false;

  return { group: g, legL, legR, flash };
}

class Friendly {
  constructor(game, x, z) {
    this.game = game;
    this.hp = HP;
    this.height = HEIGHT;
    this.radius = RADIUS;
    this.dying = false;

    this.pos = new THREE.Vector3(x, game.level.groundAt(x, z), z);
    this.velY = 0;
    this.yaw = Math.PI;
    this.walkPhase = Math.random() * 10;

    this.fireTimer = 0.5 + Math.random() * 2;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.flashTimer = 0;
    this.repositionTimer = 1 + Math.random() * 4;
    this.homeX = x;

    const built = buildSoldier();
    this.group = built.group;
    this.parts = built;
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
  }

  center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + HEIGHT * 0.6, this.pos.z);
  }

  damage(amount, dir) {
    if (this.dying) return;
    this.hp -= amount;
    const at = this.center();
    this.game.gore.sparks(at, dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0), 2);
    if (this.hp <= 0) this.die(dir || new THREE.Vector3(0, 1, 0));
  }

  die(dir) {
    this.dying = true;
    this.game.gore.giblets(this.center(), dir, 9, 0.6);
    this.game.gore.bloodPool(this.pos, 3.2);
    this.game.scene.remove(this.group);
    this.game.gore.addCorpse(this.group, this.pos, this.yaw, dir);
    this.game.audio.enemyDeath();
    this.game.friendlies.losses++;
  }

  shoot(target) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.18, this.pos.z);
    const to = target.center();
    const dir = to.clone().sub(from).normalize();
    dir.x += (Math.random() - 0.5) * 0.07;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.z += (Math.random() - 0.5) * 0.07;
    dir.normalize();

    // trace to whatever it actually hits, so misses splash off the mud
    const hit = this.game.weapons.raycast(from, dir, RANGE);
    this.game.weapons.spawnTracer(from, hit.point);
    if (hit.enemy) hit.enemy.damage(SHOT_DAMAGE, dir, hit.point, false);
    else this.game.gore.sparks(hit.point, dir, 2);

    this.parts.flash.visible = true;
    this.flashTimer = 0.05;
    this.game.audio.rifle();
  }

  update(dt, enemies) {
    const level = this.game.level;

    // nearest alien we can actually see
    let target = null;
    let bestD = RANGE;
    for (const e of enemies) {
      if (e.dying) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d >= bestD) continue;
      if (!this.canSee(e)) continue;
      bestD = d;
      target = e;
    }

    // ---- movement: hold the line, back off if something gets on top of you ----
    let mx = 0, mz = 0;
    if (target && bestD < 16) {
      mx = (this.pos.x - target.pos.x) / bestD;
      mz = (this.pos.z - target.pos.z) / bestD;
    } else {
      this.repositionTimer -= dt;
      if (this.repositionTimer <= 0) {
        this.repositionTimer = 3 + Math.random() * 5;
        this.homeX = this.pos.x + (Math.random() - 0.5) * 30;
      }
      const dx = this.homeX - this.pos.x;
      if (Math.abs(dx) > 1.5) mx = Math.sign(dx) * 0.7;
    }

    // never drift forward of our own wire, never wander off behind
    const front = FRIENDLY_LINE - 4;
    const back = FRIENDLY_LINE + 30;
    if (this.pos.z < front) mz += 1;
    if (this.pos.z > back) mz -= 1;

    // keep out of each other
    for (const o of this.game.friendlies.list) {
      if (o === this || o.dying) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const want = RADIUS * 2 + 0.8;
      if (d2 > 0.001 && d2 < want * want) {
        const d = Math.sqrt(d2);
        mx += (ox / d) * 1.2;
        mz += (oz / d) * 1.2;
      }
    }

    const ml = Math.hypot(mx, mz);
    if (ml > 0.001) { mx /= ml; mz /= ml; }

    let nx = this.pos.x + mx * SPEED * dt;
    let nz = this.pos.z + mz * SPEED * dt;
    const fixed = level.resolveCircle(nx, nz, RADIUS, this.pos.y, STEP_UP);
    nx = fixed.x; nz = fixed.z;

    const ground = level.groundAt(nx, nz, this.pos.y + STEP_UP);
    let ny = this.pos.y;
    if (ny > ground) {
      this.velY -= 80 * dt;
      ny += this.velY * dt;
      if (ny < ground) { ny = ground; this.velY = 0; }
    } else {
      ny = ground;
      this.velY = 0;
    }

    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.set(nx, ny, nz);

    // ---- face and fire ----
    if (target) {
      this.yaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z) + Math.PI;
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.shoot(target);
          this.burstLeft--;
          this.burstTimer = BURST_GAP;
          if (this.burstLeft <= 0) this.fireTimer = 0.9 + Math.random() * 1.8;
        }
      } else {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) { this.burstLeft = BURST; this.burstTimer = 0; }
      }
    } else {
      this.yaw = Math.PI;   // face the enemy line and wait
    }

    // ---- animate ----
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (moved > 0.01) {
      this.walkPhase += dt * 13;
      const sw = Math.sin(this.walkPhase) * 0.7;
      this.parts.legL.rotation.x = sw;
      this.parts.legR.rotation.x = -sw;
    } else {
      this.parts.legL.rotation.x *= 0.8;
      this.parts.legR.rotation.x *= 0.8;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.parts.flash.visible = false;
    }
  }

  canSee(e) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.18, this.pos.z);
    const to = e.center();
    const d = new THREE.Vector3().subVectors(to, from);
    const dist = d.length();
    d.normalize();
    for (let t = 1.5; t < dist - 1.5; t += 2.0) {
      if (this.game.level.solidAt(from.x + d.x * t, from.y + d.y * t, from.z + d.z * t)) return false;
    }
    return true;
  }
}

export class FriendlyForce {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.losses = 0;
  }

  reset() {
    for (const f of this.list) this.game.scene.remove(f.group);
    this.list.length = 0;
    this.losses = 0;
  }

  get alive() { return this.list.length; }

  /** Send up however many bring us back to strength. */
  reinforce(to = MAX_ALIVE) {
    const want = Math.min(MAX_ALIVE, to) - this.list.length;
    for (let i = 0; i < want; i++) {
      const spot = this.game.level.friendlySpawnPoint(RADIUS);
      this.list.push(new Friendly(this.game, spot.x, spot.z));
    }
  }

  /** Nearest living soldier to a point, within maxDist. */
  nearestTo(pos, maxDist = 40) {
    let best = null, bestD = maxDist;
    for (const f of this.list) {
      if (f.dying) continue;
      const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  /** A shot or a blast landing here. Returns true if it struck somebody. */
  hitAt(x, y, z, damage, dir, fromPlayer = false) {
    if (fromPlayer && !FRIENDLY_FIRE) return false;
    for (const f of this.list) {
      if (f.dying) continue;
      const dx = x - f.pos.x, dz = z - f.pos.z;
      if (dx * dx + dz * dz > (f.radius + 0.4) ** 2) continue;
      if (y < f.pos.y - 0.3 || y > f.pos.y + HEIGHT + 0.3) continue;
      f.damage(damage, dir);
      return true;
    }
    return false;
  }

  /** Blast damage in a radius — only from the player if friendly fire is on. */
  splash(at, radius, damage, fromPlayer = false) {
    if (fromPlayer && !FRIENDLY_FIRE) return;
    for (const f of this.list) {
      if (f.dying) continue;
      const d = f.center().distanceTo(at);
      if (d > radius) continue;
      const t = Math.min(1, d / radius);
      f.damage(damage * (1 - t * t), new THREE.Vector3(
        f.pos.x - at.x, 1, f.pos.z - at.z
      ).normalize());
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.dying) { this.list.splice(i, 1); continue; }
      f.update(dt, this.game.enemies.list);
    }
  }
}
