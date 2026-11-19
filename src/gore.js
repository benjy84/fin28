import * as THREE from 'three';

const MAX_GIBS    = 280;
const MAX_DECALS  = 240;
const MAX_CORPSES = 32;
const GRAVITY     = -82;

function bloodTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.clearRect(0, 0, s, s);
  // irregular central splat
  const blobs = 7 + (Math.random() * 5 | 0);
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * s * 0.22;
    const x = s / 2 + Math.cos(a) * r;
    const y = s / 2 + Math.sin(a) * r;
    const rad = s * (0.1 + Math.random() * 0.18);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(96,8,10,0.95)');
    grad.addColorStop(0.6, 'rgba(70,5,8,0.7)');
    grad.addColorStop(1, 'rgba(50,2,5,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // flung droplets
  g.fillStyle = 'rgba(86,6,9,0.8)';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = s * (0.2 + Math.random() * 0.28);
    g.beginPath();
    g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, Math.random() * 2.2 + 0.5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function scorchTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(8,6,5,0.92)');
  grad.addColorStop(0.55, 'rgba(18,13,10,0.6)');
  grad.addColorStop(1, 'rgba(20,15,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  return t;
}

export class Gore {
  constructor(game) {
    this.game = game;
    this.gibs = [];
    this.decals = [];
    this.corpses = [];
    this.particles = [];

    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.bloodTextures = [bloodTexture(), bloodTexture(), bloodTexture(), bloodTexture()];
    this.scorchTex = scorchTexture();

    // shared gib shapes — chunks of alien
    this.gibGeos = [
      new THREE.BoxGeometry(0.42, 0.34, 0.5),
      new THREE.BoxGeometry(0.3, 0.6, 0.3),
      new THREE.TetrahedronGeometry(0.34),
      new THREE.BoxGeometry(0.55, 0.22, 0.26),
      new THREE.DodecahedronGeometry(0.26, 0),
    ];
    this.meatMat  = new THREE.MeshLambertMaterial({ color: 0x7a1220 });
    this.meatMat2 = new THREE.MeshLambertMaterial({ color: 0x55101c });
    this.armourMat = new THREE.MeshLambertMaterial({ color: 0x4a5560 });
    this.boneMat  = new THREE.MeshLambertMaterial({ color: 0xcfc6a8 });

    this.sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    this.smokeGeo = new THREE.SphereGeometry(0.6, 5, 4);
    this.fireGeo = new THREE.SphereGeometry(1, 8, 6);

    // Decals all share a handful of materials instead of one each — hundreds of
    // one-off materials is a lot of needless work for the renderer.
    this.decalMats = this.bloodTextures.map((map) => new THREE.MeshLambertMaterial({
      map, transparent: true, opacity: 0.95, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.scorchMat = new THREE.MeshBasicMaterial({
      map: this.scorchTex, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });

    // Fading particles need their own opacity, so those materials are recycled.
    this.fadePools = {};
    this.deadMats = new Map();

    this.flashLight = new THREE.PointLight(0xffa64a, 0, 120, 2);
    game.scene.add(this.flashLight);
  }

  reset() {
    for (const g of this.gibs) this.game.scene.remove(g.mesh);
    for (const d of this.decals) this.game.scene.remove(d);
    for (const c of this.corpses) this.game.scene.remove(c);
    for (const p of this.particles) this.game.scene.remove(p.mesh);
    this.gibs.length = 0;
    this.decals.length = 0;
    this.corpses.length = 0;
    this.particles.length = 0;
    this.flashLight.intensity = 0;
  }

  /* ---------- decals ---------- */

  addDecal(x, z, size, kind = 'blood') {
    const y = this.game.level.groundAt(x, z);
    const mat = kind === 'blood'
      ? this.decalMats[(Math.random() * this.decalMats.length) | 0]
      : this.scorchMat;
    const m = new THREE.Mesh(this.decalGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, y + 0.03 + Math.random() * 0.015, z);
    m.scale.setScalar(size);
    this.game.scene.add(m);
    this.decals.push(m);

    while (this.decals.length > MAX_DECALS) {
      this.game.scene.remove(this.decals.shift());
    }
  }

  bloodPool(pos, size = 5) {
    this.addDecal(pos.x, pos.z, size * (0.8 + Math.random() * 0.6));
    // a couple of satellite splats
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = size * (0.5 + Math.random());
      this.addDecal(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r, size * 0.45);
    }
  }

  /* ---------- particles (sparks, smoke, fire) ---------- */

  sparks(pos, normalish, count = 6) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.copy(pos);
      this.game.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 18 - normalish.x * 6,
          Math.random() * 12,
          (Math.random() - 0.5) * 18 - normalish.z * 6
        ),
        life: 0.25 + Math.random() * 0.25,
        maxLife: 0.5,
        gravity: true,
        fade: false,
      });
    }
    this.trimParticles();
  }

  /** Take a fading material of this colour from the pool, or make one. */
  takeFadeMat(color) {
    const pool = (this.fadePools[color] ||= []);
    const mat = pool.pop();
    if (mat) { mat.opacity = 0.45; return mat; }
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 });
  }

  giveBackFadeMat(mat) {
    const pool = (this.fadePools[mat.color.getHex()] ||= []);
    if (pool.length < 80) pool.push(mat);
    else mat.dispose();
  }

  smokePuff(pos, scale = 1) {
    const m = new THREE.Mesh(this.smokeGeo, this.takeFadeMat(0x5c564c));
    m.position.copy(pos);
    m.scale.setScalar(scale * (0.6 + Math.random() * 0.6));
    this.game.scene.add(m);
    this.particles.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.4 + Math.random(), (Math.random() - 0.5) * 2),
      life: 0.7,
      maxLife: 0.7,
      gravity: false,
      fade: true,
      grow: 2.4,
    });
    this.trimParticles();
  }

  explosion(at) {
    // fireball
    const fire = new THREE.Mesh(this.fireGeo, this.takeFadeMat(0xffb24a));
    fire.position.copy(at);
    fire.scale.setScalar(2.5);
    fire.material.opacity = 1;
    this.game.scene.add(fire);
    this.particles.push({
      mesh: fire, vel: new THREE.Vector3(), life: 0.42, maxLife: 0.42,
      gravity: false, fade: true, grow: 62,
    });

    for (let i = 0; i < 22; i++) this.smokePuff(
      at.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 16
      )), 3.2
    );
    this.sparks(at, new THREE.Vector3(0, -1, 0), 34);

    this.flashLight.position.copy(at);
    this.flashLight.intensity = 22;
    this.flashLight.distance = 180;

    const y = this.game.level.groundAt(at.x, at.z);
    if (at.y - y < 20) this.addDecal(at.x, at.z, 24 + Math.random() * 9, 'scorch');
  }

  trimParticles() {
    while (this.particles.length > 420) {
      const p = this.particles.shift();
      this.game.scene.remove(p.mesh);
    }
  }

  /* ---------- giblets ---------- */

  giblets(pos, dir, count = 14, scale = 1) {
    for (let i = 0; i < count; i++) {
      const geo = this.gibGeos[(Math.random() * this.gibGeos.length) | 0];
      const r = Math.random();
      const mat = r < 0.5 ? this.meatMat : r < 0.72 ? this.meatMat2 : r < 0.9 ? this.armourMat : this.boneMat;
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.position.x += (Math.random() - 0.5) * 1.2;
      m.position.y += (Math.random() - 0.5) * 1.6;
      m.position.z += (Math.random() - 0.5) * 1.2;
      m.scale.setScalar(scale * (0.7 + Math.random() * 0.8));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.game.scene.add(m);

      const spread = 13;
      this.gibs.push({
        mesh: m,
        vel: new THREE.Vector3(
          dir.x * 9 + (Math.random() - 0.5) * spread,
          6 + Math.random() * 16,
          dir.z * 9 + (Math.random() - 0.5) * spread
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 22,
          (Math.random() - 0.5) * 22,
          (Math.random() - 0.5) * 22
        ),
        settled: false,
        bounces: 0,
        bled: false,
      });
    }

    while (this.gibs.length > MAX_GIBS) {
      const old = this.gibs.shift();
      this.game.scene.remove(old.mesh);
    }
  }

  /* ---------- corpses ---------- */

  addCorpse(group, pos, yaw, dir) {
    group.position.set(pos.x, this.game.level.groundAt(pos.x, pos.z) + 0.35, pos.z);
    group.rotation.set(0, yaw, 0);
    // fold it over: face down, slumped, with a bit of a twist from the hit
    group.rotateX(-Math.PI / 2 + (Math.random() - 0.5) * 0.25);
    group.rotateZ((Math.random() - 0.5) * 0.8);
    // One darkened copy per source material, shared by every corpse, rather
    // than cloning a material for each of the ~20 meshes in every body.
    group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      let dead = this.deadMats.get(o.material);
      if (!dead) {
        dead = o.material.clone();
        dead.color.multiplyScalar(0.55);
        if (dead.emissive) dead.emissive.multiplyScalar(0.4);
        this.deadMats.set(o.material, dead);
      }
      o.material = dead;
    });
    this.game.scene.add(group);
    this.corpses.push(group);
    this.bloodPool(pos, 5.5);

    while (this.corpses.length > MAX_CORPSES) {
      const old = this.corpses.shift();
      this.game.scene.remove(old);
    }
  }

  /* ---------- per frame ---------- */

  update(dt) {
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 46);

    // gibs
    for (const g of this.gibs) {
      if (g.settled) continue;
      g.vel.y += GRAVITY * dt;
      g.mesh.position.x += g.vel.x * dt;
      g.mesh.position.y += g.vel.y * dt;
      g.mesh.position.z += g.vel.z * dt;
      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      g.mesh.rotation.z += g.spin.z * dt;

      const ground = this.game.level.groundAt(g.mesh.position.x, g.mesh.position.z) + 0.18;
      if (g.mesh.position.y <= ground) {
        g.mesh.position.y = ground;
        if (!g.bled) {
          g.bled = true;
          if (Math.random() < 0.55) {
            this.addDecal(g.mesh.position.x, g.mesh.position.z, 1.6 + Math.random() * 2.2);
          }
        }
        g.bounces++;
        if (g.bounces > 2 || Math.abs(g.vel.y) < 5) {
          g.settled = true;
          g.vel.set(0, 0, 0);
          g.spin.set(0, 0, 0);
        } else {
          g.vel.y = -g.vel.y * 0.32;
          g.vel.x *= 0.5;
          g.vel.z *= 0.5;
          g.spin.multiplyScalar(0.5);
        }
      }
    }

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.gravity) p.vel.y += GRAVITY * 0.55 * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      if (p.grow) p.mesh.scale.addScalar(p.grow * dt);
      if (p.fade) p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.45);
      if (p.life <= 0) {
        this.game.scene.remove(p.mesh);
        if (p.fade) this.giveBackFadeMat(p.mesh.material);
        this.particles.splice(i, 1);
      }
    }
  }
}
