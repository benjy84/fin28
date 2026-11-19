import * as THREE from 'three';

/**
 * The frame you're standing in. It lives in the world (not on the camera), turns
 * with your yaw but never with your pitch, so looking down shows your own chest,
 * legs and feet. The camera sits at the cockpit, just above the torso.
 */

const PLATE  = new THREE.MeshLambertMaterial({ color: 0x848f76, emissive: 0x1e2318 });
const DARK   = new THREE.MeshLambertMaterial({ color: 0x51584a, emissive: 0x14170f });
const TRIM   = new THREE.MeshLambertMaterial({ color: 0xaab795, emissive: 0x23281b });
const PISTON = new THREE.MeshLambertMaterial({ color: 0xc2c6b4, emissive: 0x1a1c17 });
const GLOW   = new THREE.MeshBasicMaterial({ color: 0x8dff6a });
const WARN   = new THREE.MeshBasicMaterial({ color: 0xff8a3c });

function shadowTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  return t;
}

export class Mech {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);

    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    /* ----------------------------------------------------------------
       Proportions matter here. The camera sits at 7.2 and is pushed
       forward to the front of the chest (see Player.update), so the torso
       has to stay low and set back — otherwise looking down just fills the
       screen with one flat plate instead of showing you your own machine.
       ---------------------------------------------------------------- */
    add(this.root, box(3.0, 1.2, 2.2), DARK, 0, 3.9, 0.1);        // pelvis
    add(this.root, box(3.4, 1.5, 2.5), PLATE, 0, 5.0, 0.15);      // chest
    add(this.root, box(2.3, 1.0, 0.3), TRIM, 0, 5.1, -1.1);       // chest plate
    add(this.root, box(1.3, 0.18, 0.12), GLOW, 0, 4.5, -1.14);    // status strip
    add(this.root, box(0.45, 0.45, 0.14), WARN, -1.0, 5.2, -1.16);// hazard lamp
    add(this.root, box(2.2, 1.0, 0.8), DARK, 0, 5.0, 1.6);        // reactor pack
    add(this.root, box(0.9, 0.3, 0.2), GLOW, 0, 5.0, 2.0);

    // Shoulders ride high and wide so they frame the edges of your view
    // rather than block it, and sit where the guns appear to hang from.
    for (const side of [-1, 1]) {
      add(this.root, box(1.5, 1.3, 2.0), PLATE, side * 2.5, 5.9, 0.2);
      add(this.root, box(1.1, 0.4, 1.6), TRIM, side * 2.7, 6.6, 0.2);
      add(this.root, box(0.8, 1.6, 0.8), DARK, side * 1.6, 5.3, 0.2);  // shoulder joint
    }

    /* ---------- legs: hip at 3.6, so they reach the floor exactly ---------- */
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 1.2, 3.6, -1.0);   // forward of the torso, under the cockpit
      this.root.add(hip);
      add(hip, box(1.15, 1.15, 1.15), DARK, 0, 0, 0);             // hip joint
      add(hip, box(1.3, 1.9, 1.4), PLATE, 0, -0.95, 0);           // thigh
      add(hip, box(0.3, 1.6, 0.3), PISTON, 0, -0.95, -0.9);       // thigh piston

      const knee = new THREE.Group();
      knee.position.set(0, -1.9, 0);
      hip.add(knee);
      add(knee, box(1.0, 1.0, 1.0), DARK, 0, 0, 0);               // knee joint
      add(knee, box(1.05, 1.4, 1.15), PLATE, 0, -0.7, 0);         // shin
      add(knee, box(0.26, 1.1, 0.26), PISTON, 0, -0.7, -0.75);    // shin piston
      add(knee, box(1.9, 0.4, 2.8), DARK, 0, -1.5, -0.2);         // foot
      add(knee, box(1.7, 0.2, 0.8), TRIM, 0, -1.66, -1.4);        // toe

      this.legs.push({ hip, knee });
    }

    /* ---------- ground shadow ---------- */
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: shadowTexture(), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(11);
    game.scene.add(this.shadow);

    this.swing = 0;
  }

  update(dt, player) {
    // Follow the player, but only a fraction of the camera's bob, so the feet
    // stay roughly planted while the cockpit rides up and down on its suspension.
    this.root.position.set(
      player.pos.x,
      player.pos.y + (player.bobY || 0) * 0.4,
      player.pos.z
    );
    this.root.rotation.y = player.yaw;

    // walk cycle, driven by the same phase as the camera bob
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const moving = player.onGround && speed > 3;
    const target = moving ? Math.sin(player.bob) : 0;
    this.swing += (target - this.swing) * Math.min(1, dt * 12);

    for (let i = 0; i < this.legs.length; i++) {
      const dir = i === 0 ? 1 : -1;
      const s = this.swing * dir;
      const { hip, knee } = this.legs[i];
      hip.rotation.x = s * 0.5;
      // knee only bends as the leg travels backwards
      knee.rotation.x = Math.max(0, -s) * 0.7;
    }

    // airborne: tuck the legs up a little
    if (!player.onGround) {
      for (const { hip, knee } of this.legs) {
        hip.rotation.x += 0.25;
        knee.rotation.x += 0.45;
      }
    }

    const groundY = this.game.level.groundAt(player.pos.x, player.pos.z);
    this.shadow.position.set(player.pos.x, groundY + 0.06, player.pos.z);
    // fades and shrinks as you leave the ground
    const air = Math.max(0, player.pos.y - groundY);
    this.shadow.material.opacity = Math.max(0.15, 1 - air / 22);
    this.shadow.scale.setScalar(11 + air * 0.25);
  }
}
