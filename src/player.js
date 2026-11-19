import * as THREE from 'three';

export const EYE = 7.2;          // camera height — you are enormous
const COCKPIT_FORWARD = 1.3;     // how far forward of the mech's centre you sit
const RADIUS = 2.6;
const MAX_SPEED = 26;
const ACCEL = 95;                // slow to get going: it weighs tonnes
const FRICTION = 10;
const AIR_CONTROL = 0.22;
const GRAVITY = -78;
const HOP = 26;
export const MAX_HEALTH = 1000;
const STEP_UP = 6;               // you step over sandbags and down into trenches

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 112);
    this.vel = new THREE.Vector3();
    this.yaw = 0;          // face into the arena, not at the wall behind you
    this.pitch = -0.06;
    this.onGround = true;
    this.health = MAX_HEALTH;
    this.dead = false;

    this.bob = 0;
    this.bobX = 0;
    this.bobY = 0;
    this.stepTimer = 0;
    this.shake = 0;
    this.shakeDecay = 7;
    this.recoil = new THREE.Vector2();   // yaw/pitch kick from firing

    this.camera = game.camera;
  }

  reset() {
    this.pos.set(0, 0, 112);
    this.vel.set(0, 0, 0);
    this.yaw = 0;          // face into the arena, not at the wall behind you
    this.pitch = -0.06;
    this.health = MAX_HEALTH;
    this.dead = false;
    this.shake = 0;
    this.recoil.set(0, 0);
  }

  look(dx, dy) {
    if (this.dead) return;
    const s = 0.0022;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  addShake(amount) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  kick(yaw, pitch) {
    this.recoil.x += yaw;
    this.recoil.y += pitch;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.addShake(0.22 + amount * 0.004);
    this.game.hud.flashDamage();
    this.game.audio.hit();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(MAX_HEALTH, this.health + amount);
  }

  update(dt, input) {
    const level = this.game.level;

    // ---- intent ----
    let fwd = 0, strafe = 0;
    if (!this.dead) {
      if (input.has('KeyW') || input.has('ArrowUp')) fwd += 1;
      if (input.has('KeyS') || input.has('ArrowDown')) fwd -= 1;
      if (input.has('KeyD') || input.has('ArrowRight')) strafe += 1;
      if (input.has('KeyA') || input.has('ArrowLeft')) strafe -= 1;
    }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -Z when yaw = 0
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    const control = this.onGround ? 1 : AIR_CONTROL;
    this.vel.x += wx * ACCEL * control * dt;
    this.vel.z += wz * ACCEL * control * dt;

    // ---- friction (ground only) ----
    if (this.onGround && len === 0) {
      const drop = FRICTION * dt;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0.01) {
        const k = Math.max(0, 1 - drop / Math.max(speed, 1) * 3);
        this.vel.x *= k;
        this.vel.z *= k;
      } else {
        this.vel.x = this.vel.z = 0;
      }
    }

    // ---- clamp horizontal speed ----
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > MAX_SPEED) {
      const k = MAX_SPEED / hs;
      this.vel.x *= k;
      this.vel.z *= k;
    }

    // ---- jump ----
    if (!this.dead && input.has('Space') && this.onGround) {
      this.vel.y = HOP;
      this.onGround = false;
      this.game.audio.thruster();
    }

    // ---- integrate ----
    this.vel.y += GRAVITY * dt;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;

    const resolved = level.resolveCircle(nx, nz, RADIUS, this.pos.y, STEP_UP);
    // if we got pushed, bleed the velocity in that direction
    if (Math.abs(resolved.x - nx) > 0.001) this.vel.x *= 0.2;
    if (Math.abs(resolved.z - nz) > 0.001) this.vel.z *= 0.2;
    nx = resolved.x; nz = resolved.z;

    const ground = level.groundAt(nx, nz, this.pos.y + STEP_UP);
    if (ny <= ground) {
      if (!this.onGround && this.vel.y < -24) {
        this.addShake(0.3);
        this.game.audio.land();
      }
      ny = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.pos.set(nx, ny, nz);

    // ---- footsteps: heavy, slow, shake the frame ----
    const moving = this.onGround && hs > 3;
    if (moving) {
      this.stepTimer += dt * (hs / MAX_SPEED);
      this.bob += dt * (hs / MAX_SPEED) * 7.5;
      if (this.stepTimer > 0.42) {
        this.stepTimer = 0;
        this.addShake(0.1);
        this.game.audio.step();
      }
    } else {
      this.stepTimer = 0.42;   // next step lands as soon as you move off
      this.bob += dt * 0.8;    // idle sway
    }

    // ---- camera ----
    this.shake = Math.max(0, this.shake - this.shakeDecay * dt * (0.5 + this.shake));
    this.recoil.multiplyScalar(Math.max(0, 1 - 9 * dt));

    const bobY = moving ? Math.sin(this.bob) * 0.42 : Math.sin(this.bob) * 0.1;
    const bobX = moving ? Math.cos(this.bob * 0.5) * 0.3 : 0;
    this.bobY = bobY;
    this.bobX = bobX;
    const sh = this.shake;
    const sx = (Math.random() - 0.5) * sh * 1.5;
    const sy = (Math.random() - 0.5) * sh * 1.5;

    // The cockpit sits at the front of the chest, not at the mech's centre, so
    // that looking down shows the chassis and legs instead of one flat plate.
    const fx = -Math.sin(this.yaw) * COCKPIT_FORWARD;
    const fz = -Math.cos(this.yaw) * COCKPIT_FORWARD;
    this.camera.position.set(
      this.pos.x + fx + bobX + sx,
      this.pos.y + EYE + bobY + sy,
      this.pos.z + fz
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw + this.recoil.x);
    this.camera.rotateX(this.pitch + this.recoil.y);
    this.camera.rotateZ(Math.sin(this.bob * 0.5) * (moving ? 0.012 : 0.003) + sx * 0.01);
  }

  /** Where shots leave the mech, and which way. */
  muzzleOrigin(side = 1) {
    const dir = this.forward();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    return new THREE.Vector3()
      .copy(this.camera.position)
      .add(right.multiplyScalar(2.0 * side))
      .add(dir.clone().multiplyScalar(2.6))
      .add(new THREE.Vector3(0, -1.1, 0));
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
  }
}
