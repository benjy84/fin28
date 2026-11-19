import * as THREE from 'three';
import { createLevel } from './level.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Gore } from './gore.js';
import { Mech } from './mech.js';
import { FriendlyForce } from './friendlies.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';

const PIXEL_SCALE = 1.0;        // full resolution; the adaptive step below
const MIN_PIXEL_SCALE = 0.45;   // drops it only if the frame rate can't hold

class Game {
  constructor() {
    this.state = 'menu';            // menu | playing | dead
    this.kills = 0;
    this.aimingAtEnemy = false;

    this.pixelScale = PIXEL_SCALE;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsClock = performance.now();
    this.slowSeconds = 0;
    this.fastSeconds = 0;

    /* ---------- renderer ---------- */
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Render at the display's own pixel density (capped at 2x, which is where
    // the extra pixels stop being visible and start just costing frames).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    document.getElementById('view').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(84, 1, 0.1, 600);
    this.scene.add(this.camera);   // so the gun viewmodels get drawn

    // a lamp on the frame itself, so your own weapons are always readable
    const frameLamp = new THREE.PointLight(0xfff0d2, 1.5, 14, 2);
    frameLamp.position.set(0, 0.4, 0.5);
    this.camera.add(frameLamp);

    /* ---------- systems ---------- */
    this.level = createLevel(this.scene, this.renderer);
    this.audio = new Audio();
    this.player = new Player(this);
    this.mech = new Mech(this);
    this.gore = new Gore(this);
    this.enemies = new EnemyManager(this);
    this.weapons = new Weapons(this);
    this.friendlies = new FriendlyForce(this);
    this.hud = new HUD(this);

    /* ---------- input ---------- */
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.bindInput();

    this.resize();
    window.addEventListener('resize', () => this.resize());

    window.GAME = this;   // handy for poking at the game from the console

    // If Chrome has fallen back to software rendering, nothing else will save
    // the frame rate — worth being able to see that in the console.
    const dbg = this.renderer.getContext().getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      console.log('GPU:', this.renderer.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    }

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(Math.max(320, Math.floor(w * this.pixelScale)),
                          Math.max(200, Math.floor(h * this.pixelScale)), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    const canvas = this.renderer.domElement;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    // Pointer lock is the good way to aim, but don't depend on it: if the
    // browser refuses it, fall back to raw mousemove so the game still plays.
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return;
      this.player.look(e.movementX || 0, e.movementY || 0);
    });

    document.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // click anywhere to deploy / resume / redeploy
    document.addEventListener('click', () => {
      this.audio.start();
      if (this.state === 'dead') { this.restart(); return; }
      if (this.state === 'menu') this.begin();
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.()?.catch(() => {});   // some contexts refuse it; play on regardless
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) {
        this.mouse.left = this.mouse.right = false;
        if (this.state === 'playing') this.pause();
      }
    });

    // Esc pauses even when pointer lock never engaged
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
    });
  }

  pause() {
    this.state = 'menu';
    this.mouse.left = this.mouse.right = false;
    this.keys.clear();
    document.body.classList.remove('playing');
    this.hud.el.start.hidden = false;
    this.hud.el.start.querySelector('.prompt').textContent = 'CLICK TO RESUME';
  }

  begin() {
    this.state = 'playing';
    document.body.classList.add('playing');
    this.hud.hideScreens();
    this.hud.show();
    if (this.enemies.wave === 0) this.enemies.startWave();
  }

  restart() {
    this.kills = 0;
    this.player.reset();
    this.weapons.reset();
    this.enemies.reset();
    this.friendlies.reset();
    this.gore.reset();
    this.hud.hideScreens();
    this.hud.show();
    this.state = 'playing';
    this.enemies.startWave();
    const canvas = this.renderer.domElement;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch(() => {});   // some contexts refuse it; play on regardless
  }

  onKill(enemy, byPlayer = true) {
    // the counter is yours; kills your infantry make are theirs
    if (byPlayer) this.kills++;
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.hud.showDeath(this.enemies.wave, this.kills);
    this.hud.hide();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Rolling frame rate, and drop the render resolution if we can't keep up. */
  measureFrameRate() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.fpsClock;
    if (elapsed < 1000) return;

    this.fps = Math.round((this.frameCount * 1000) / elapsed);
    this.frameCount = 0;
    this.fpsClock = now;

    // A backgrounded tab is throttled to a crawl by the browser; that isn't the
    // game being slow, so don't let it drag the resolution down.
    if (this.state !== 'playing' || document.hidden) {
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      return;
    }

    if (this.fps < 45 && this.pixelScale > MIN_PIXEL_SCALE) {
      this.fastSeconds = 0;
      if (++this.slowSeconds >= 2) {
        this.slowSeconds = 0;
        this.setPixelScale(this.pixelScale - 0.08);
      }
    } else if (this.fps > 58 && this.pixelScale < PIXEL_SCALE) {
      this.slowSeconds = 0;
      // climb back slowly once there's headroom again
      if (++this.fastSeconds >= 6) {
        this.fastSeconds = 0;
        this.setPixelScale(this.pixelScale + 0.06);
      }
    } else {
      this.slowSeconds = 0;
      this.fastSeconds = 0;
    }
  }

  setPixelScale(value) {
    const next = Math.max(MIN_PIXEL_SCALE, Math.min(PIXEL_SCALE, value));
    if (Math.abs(next - this.pixelScale) < 0.001) return;
    this.pixelScale = next;
    this.resize();
    this.hud.toast(`RENDER SCALE ${Math.round(this.pixelScale * 100)}%`);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.measureFrameRate();

    if (this.state === 'playing') {
      this.player.update(dt, this.keys);
      this.mech.update(dt, this.player);
      this.weapons.update(dt, this.keys, this.mouse);
      this.enemies.update(dt);
      this.friendlies.update(dt);
      this.gore.update(dt);

      // is the reticle on something?
      const hit = this.weapons.raycast(this.camera.position, this.player.forward(), 300);
      this.aimingAtEnemy = !!hit.enemy;

      this.hud.update(dt);
    } else if (this.state === 'dead') {
      // keep the world ticking so the gore settles while the death screen is up
      this.gore.update(dt);
      this.weapons.update(dt, new Set(), { left: false, right: false });
      this.enemies.update(dt);
      this.friendlies.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
