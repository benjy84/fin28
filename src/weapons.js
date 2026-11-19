import * as THREE from 'three';

/* ---------- tuning ---------- */
export const GAT_CAPACITY   = 7.0;    // seconds of continuous fire
export const GAT_RELOAD     = 7.0;    // seconds
const GAT_RPS               = 13;     // rounds per second
const GAT_DAMAGE            = 26;
const GAT_SPREAD            = 0.016;  // radians
const GAT_RANGE             = 420;

export const RACK_SIZE      = 8;
export const RACK_RELOAD    = 30;     // seconds
const MISSILE_DAMAGE        = 200;    // direct hit
const MISSILE_SPLASH        = 155;    // at the centre of the blast, falls off
const MISSILE_SPLASH_RADIUS = 24;     // wide enough to clear a group
const MISSILE_SELF_RADIUS   = 13;     // you only hurt yourself much closer in
const MISSILE_SPEED         = 115;
const MISSILE_COOLDOWN      = 0.45;

export class Weapons {
  constructor(game) {
    this.game = game;

    this.gatAmmo = GAT_CAPACITY;
    this.gatReloading = false;
    this.gatReloadLeft = 0;
    this.gatCooldown = 0;
    this.barrelSpin = 0;
    this.spinUp = 0;

    this.rack = RACK_SIZE;
    this.rackReloading = false;
    this.rackReloadLeft = 0;
    this.missileCooldown = 0;

    this.missiles = [];
    this.tracers = [];

    this.buildViewmodels();

    this.muzzleLight = new THREE.PointLight(0xffd080, 0, 60, 2);
    game.scene.add(this.muzzleLight);

    // One light that follows whichever missile is in the air, rather than one
    // light per missile — the scene's light count must never change.
    this.missileLight = new THREE.PointLight(0xff9a4a, 0, 42, 2);
    game.scene.add(this.missileLight);

    this.buildTracerPool();
  }

  reset() {
    this.gatAmmo = GAT_CAPACITY;
    this.gatReloading = false;
    this.gatReloadLeft = 0;
    this.rack = RACK_SIZE;
    this.rackReloading = false;
    this.rackReloadLeft = 0;
    this.missileCooldown = 0;
    for (const m of this.missiles) this.game.scene.remove(m.mesh);
    this.missiles.length = 0;
    for (const t of this.tracers) t.mesh.visible = false;
    this.tracers.length = 0;
    this.missileLight.intensity = 0;
    this.updateRackPips();
  }

  /* ---------- the bits you see on screen ---------- */

  buildViewmodels() {
    const cam = this.game.camera;

    const steel = new THREE.MeshLambertMaterial({ color: 0x9aa08e });
    const dark  = new THREE.MeshLambertMaterial({ color: 0x575e4c });
    const hot   = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });

    // --- gatling gun, right hand ---
    this.gatGroup = new THREE.Group();
    this.gatGroup.position.set(0.92, -0.6, -1.9);
    this.gatGroup.scale.setScalar(0.74);
    cam.add(this.gatGroup);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.75), dark);
    housing.position.z = 0.25;
    this.gatGroup.add(housing);

    this.barrels = new THREE.Group();
    this.barrels.position.z = -0.3;
    this.gatGroup.add(this.barrels);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 1.15, 6), steel);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0);
      this.barrels.add(b);
    }
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), dark);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = 0.02;
    this.gatGroup.add(shroud);

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 })
    );
    this.flash.position.z = -0.95;
    this.gatGroup.add(this.flash);

    // --- missile rack, left shoulder ---
    this.rackGroup = new THREE.Group();
    this.rackGroup.position.set(-1.02, -0.46, -1.8);
    this.rackGroup.scale.setScalar(0.8);
    this.rackGroup.rotation.y = 0.14;
    cam.add(this.rackGroup);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), dark);
    this.rackGroup.add(plate);

    this.tubes = [];
    for (let i = 0; i < RACK_SIZE; i++) {
      const col = i % 4, row = (i / 4) | 0;
      const t = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, 0.3, 6),
        new THREE.MeshBasicMaterial({ color: 0xff7a3c })
      );
      t.rotation.x = Math.PI / 2;
      t.position.set(-0.21 + col * 0.14, 0.09 - row * 0.17, -0.28);
      this.rackGroup.add(t);
      this.tubes.push(t);

      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.12, 6), hot);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(t.position.x, t.position.y, -0.22);
      this.rackGroup.add(hole);
    }
    this.updateRackPips();
  }

  updateRackPips() {
    for (let i = 0; i < this.tubes.length; i++) {
      this.tubes[i].visible = i < this.rack;
    }
  }

  /* ---------- firing ---------- */

  tryFireGatling(dt) {
    if (this.gatReloading || this.gatAmmo <= 0) return;
    this.spinUp = Math.min(1, this.spinUp + dt * 6);
    this.gatAmmo = Math.max(0, this.gatAmmo - dt);
    if (this.gatAmmo <= 0) this.startGatReload();

    this.gatCooldown -= dt;
    while (this.gatCooldown <= 0) {
      this.gatCooldown += 1 / GAT_RPS;
      this.fireRound();
    }
  }

  fireRound() {
    const p = this.game.player;
    // Aim from the camera so the shots land where the crosshair is, but draw the
    // tracer from the barrel — otherwise the gun's offset makes every round miss.
    const eye = p.camera.position;
    const muzzle = p.muzzleOrigin(1);
    const dir = p.forward();
    dir.x += (Math.random() - 0.5) * GAT_SPREAD * 2;
    dir.y += (Math.random() - 0.5) * GAT_SPREAD * 2;
    dir.z += (Math.random() - 0.5) * GAT_SPREAD * 2;
    dir.normalize();

    const hit = this.raycast(eye, dir, GAT_RANGE);
    this.spawnTracer(muzzle, hit.point);

    if (hit.enemy) {
      hit.enemy.damage(GAT_DAMAGE, dir, hit.point);
    } else {
      this.game.gore.sparks(hit.point, dir, 4);
    }

    this.flash.material.opacity = 0.95;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleLight.intensity = 3.2;

    p.kick((Math.random() - 0.5) * 0.004, 0.0032);
    p.addShake(0.035);
    this.game.audio.gatling();
  }

  tryFireMissile() {
    if (this.rackReloading || this.rack <= 0 || this.missileCooldown > 0) return;
    this.rack--;
    this.missileCooldown = MISSILE_COOLDOWN;
    this.updateRackPips();
    if (this.rack <= 0) {
      this.rackReloading = true;
      this.rackReloadLeft = RACK_RELOAD;
      this.game.hud.toast('MISSILE RACK EMPTY — RELOADING');
    }

    const p = this.game.player;
    const origin = p.muzzleOrigin(-1);
    // point it at whatever the crosshair is on, so it converges with your aim
    const aimPoint = this.raycast(p.camera.position, p.forward(), 400).point;
    const dir = aimPoint.clone().sub(origin).normalize();

    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 2.3, 7),
      new THREE.MeshLambertMaterial({ color: 0xb8bcae })
    );
    body.rotation.x = Math.PI / 2;
    mesh.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.8, 7),
      new THREE.MeshLambertMaterial({ color: 0xff5a2a })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -1.5;
    mesh.add(nose);
    const burn = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc46a })
    );
    burn.position.z = 1.3;
    mesh.add(burn);

    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.game.scene.add(mesh);

    this.missiles.push({
      mesh,
      burn,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(MISSILE_SPEED),
      life: 5,
      smoke: 0,
    });

    p.kick((Math.random() - 0.5) * 0.01, 0.02);
    p.addShake(0.3);
    this.game.audio.missileLaunch();
  }

  startGatReload() {
    if (this.gatReloading) return;
    this.gatReloading = true;
    this.gatReloadLeft = GAT_RELOAD;
    this.game.audio.reload();
  }

  manualReload() {
    if (!this.gatReloading && this.gatAmmo < GAT_CAPACITY) this.startGatReload();
  }

  /* ---------- hitscan ---------- */

  /** Nearest of (enemy cylinder, level geometry) along the ray. */
  raycast(origin, dir, maxDist) {
    let best = maxDist;
    let enemy = null;

    for (const e of this.game.enemies.list) {
      if (e.dying) continue;
      const ox = origin.x - e.pos.x;
      const oz = origin.z - e.pos.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-6) continue;
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - e.radius * e.radius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0) t = (-b + sq) / (2 * a);
      if (t < 0.5 || t >= best) continue;
      const y = origin.y + dir.y * t;
      if (y < e.pos.y || y > e.pos.y + e.height) continue;
      best = t;
      enemy = e;
    }

    // march for walls
    const step = 1.6;
    for (let t = step; t < Math.min(best, maxDist); t += step) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (this.game.level.solidAt(x, y, z)) {
        // step back for a cleaner impact point
        return {
          point: new THREE.Vector3(
            origin.x + dir.x * (t - step * 0.5),
            origin.y + dir.y * (t - step * 0.5),
            origin.z + dir.z * (t - step * 0.5)
          ),
          enemy: null,
          dist: t,
        };
      }
    }

    return {
      point: new THREE.Vector3().copy(origin).add(dir.clone().multiplyScalar(best)),
      enemy,
      dist: best,
    };
  }

  /* ---------- tracers ---------- */

  /** Tracers are reused from a fixed pool — building geometry 13 times a
   *  second and throwing it away was churning GPU buffers for no reason. */
  buildTracerPool() {
    const geo = new THREE.CylinderGeometry(0.055, 0.055, 1, 4, 1, true);
    this.tracerPool = [];
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9 })
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.game.scene.add(mesh);
      this.tracerPool.push(mesh);
    }
    this.tracerNext = 0;
  }

  spawnTracer(from, to) {
    const d = new THREE.Vector3().subVectors(to, from);
    const len = d.length();
    if (len < 0.5) return;

    const mesh = this.tracerPool[this.tracerNext];
    this.tracerNext = (this.tracerNext + 1) % this.tracerPool.length;

    mesh.scale.set(1, len, 1);
    mesh.position.copy(from).add(d.multiplyScalar(0.5));
    mesh.lookAt(to);
    mesh.rotateX(Math.PI / 2);
    mesh.material.opacity = 0.9;
    mesh.visible = true;

    const existing = this.tracers.find((t) => t.mesh === mesh);
    if (existing) existing.life = 0.055;
    else this.tracers.push({ mesh, life: 0.055 });
  }

  /* ---------- explosion ---------- */

  explode(at) {
    const enemies = this.game.enemies.list;
    for (const e of enemies) {
      if (e.dying) continue;
      const cx = e.pos.x - at.x;
      const cy = (e.pos.y + e.height * 0.5) - at.y;
      const cz = e.pos.z - at.z;
      const d = Math.hypot(cx, cy, cz);
      if (d > MISSILE_SPLASH_RADIUS + e.radius) continue;
      // Squared falloff: near-full damage across the inner half of the blast,
      // tailing off towards the edge, rather than fading linearly from zero.
      const t = Math.min(1, Math.max(0, d - e.radius) / MISSILE_SPLASH_RADIUS);
      const falloff = 1 - t * t;
      const dmg = d < e.radius + 1.5 ? MISSILE_DAMAGE : MISSILE_SPLASH * falloff;
      const dir = new THREE.Vector3(cx, cy + 1, cz).normalize();
      e.damage(dmg, dir, e.center());
    }

    // player can be caught by their own blast — but it's a big frame, so it's light
    const p = this.game.player;
    const pd = Math.hypot(p.pos.x - at.x, (p.pos.y + 4) - at.y, p.pos.z - at.z);
    if (pd < MISSILE_SELF_RADIUS) {
      p.damage(Math.round(32 * (1 - pd / MISSILE_SELF_RADIUS)));
    }

    // your own blast only touches our infantry if friendly fire is switched on
    this.game.friendlies.splash(at, MISSILE_SPLASH_RADIUS, MISSILE_SPLASH, true);

    this.game.gore.explosion(at);
    this.game.audio.explosion();
    const dist = p.pos.distanceTo(at);
    p.addShake(Math.max(0.1, 1.15 - dist / 130));
  }

  /* ---------- per frame ---------- */

  update(dt, input, mouse) {
    const p = this.game.player;

    if (!p.dead) {
      if (mouse.left) this.tryFireGatling(dt);
      else this.spinUp = Math.max(0, this.spinUp - dt * 3);

      if (mouse.right) this.tryFireMissile();
      if (input.has('KeyR')) this.manualReload();
    } else {
      this.spinUp = Math.max(0, this.spinUp - dt * 3);
    }

    this.missileCooldown = Math.max(0, this.missileCooldown - dt);

    // reloads
    if (this.gatReloading) {
      this.gatReloadLeft -= dt;
      this.gatAmmo = GAT_CAPACITY * (1 - this.gatReloadLeft / GAT_RELOAD);
      if (this.gatReloadLeft <= 0) {
        this.gatReloading = false;
        this.gatAmmo = GAT_CAPACITY;
        this.game.audio.reloadDone();
      }
    }
    if (this.rackReloading) {
      this.rackReloadLeft -= dt;
      if (this.rackReloadLeft <= 0) {
        this.rackReloading = false;
        this.rack = RACK_SIZE;
        this.updateRackPips();
        this.game.hud.toast('MISSILE RACK READY');
        this.game.audio.reloadDone();
      }
    }

    // the one missile light follows the newest missile in the air
    if (this.missiles.length > 0) {
      this.missileLight.position.copy(this.missiles[this.missiles.length - 1].pos);
      this.missileLight.intensity = 2.2;
    } else {
      this.missileLight.intensity = 0;
    }

    // barrels
    this.barrelSpin += dt * (12 + this.spinUp * 42);
    this.barrels.rotation.z = this.barrelSpin;

    // gun sway/recoil
    const kick = this.spinUp * 0.045;
    this.gatGroup.position.z = -1.9 + Math.sin(this.barrelSpin * 3) * kick;
    this.gatGroup.position.y = -0.6 + Math.sin(p.bob) * 0.035 + (this.gatReloading ? -0.3 : 0);
    this.rackGroup.position.y = -0.46 + Math.sin(p.bob + 1) * 0.03 + (this.rackReloading ? -0.42 : 0);

    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 14);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 26);

    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.055) * 0.9;
      if (t.life <= 0) {
        t.mesh.visible = false;
        this.tracers.splice(i, 1);
      }
    }

    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      const stepDist = MISSILE_SPEED * dt;
      const dir = m.vel.clone().normalize();
      let hitPoint = null;

      // check along the path this frame so fast missiles don't tunnel
      const steps = Math.max(1, Math.ceil(stepDist / 1.5));
      for (let s = 1; s <= steps; s++) {
        const t = (stepDist * s) / steps;
        const x = m.pos.x + dir.x * t;
        const y = m.pos.y + dir.y * t;
        const z = m.pos.z + dir.z * t;
        if (this.game.level.solidAt(x, y, z)) {
          hitPoint = new THREE.Vector3(
            m.pos.x + dir.x * (t - 0.8),
            m.pos.y + dir.y * (t - 0.8),
            m.pos.z + dir.z * (t - 0.8)
          );
          break;
        }
        let struck = null;
        for (const e of this.game.enemies.list) {
          if (e.dying) continue;
          const dx = x - e.pos.x, dz = z - e.pos.z;
          if (dx * dx + dz * dz > (e.radius + 0.5) ** 2) continue;
          if (y < e.pos.y - 0.5 || y > e.pos.y + e.height + 0.5) continue;
          struck = e;
          break;
        }
        if (struck) { hitPoint = new THREE.Vector3(x, y, z); break; }
      }

      if (hitPoint) {
        this.explode(hitPoint);
        this.game.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        continue;
      }

      m.pos.add(dir.multiplyScalar(stepDist));
      m.mesh.position.copy(m.pos);
      m.burn.scale.setScalar(0.8 + Math.random() * 0.5);

      m.smoke += dt;
      if (m.smoke > 0.045) {
        m.smoke = 0;
        this.game.gore.smokePuff(m.pos);
      }

      m.life -= dt;
      if (m.life <= 0) {
        this.explode(m.pos.clone());
        this.game.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }
}
