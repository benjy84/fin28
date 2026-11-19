import { MAX_HEALTH } from './player.js';
import { GAT_CAPACITY, GAT_RELOAD, RACK_SIZE, RACK_RELOAD } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'),
      healthBlock: $('health-block'),
      healthNum: $('health-num'),
      healthFill: $('health-fill'),
      weaponsBlock: $('weapons-block'),
      gatFill: $('gat-fill'),
      gatState: $('gat-state'),
      pips: $('pips'),
      missileState: $('missile-state'),
      waveNum: $('wave-num'),
      aliveNum: $('alive-num'),
      killNum: $('kill-num'),
      allyNum: $('ally-num'),
      fpsNum: $('fps-num'),
      banner: $('wave-banner'),
      damage: $('damage'),
      toast: $('toast'),
      crosshair: $('crosshair'),
      start: $('start-screen'),
      dead: $('dead-screen'),
      deadStats: $('dead-stats'),
    };

    this.el.pips.innerHTML = '';
    this.pipEls = [];
    for (let i = 0; i < RACK_SIZE; i++) {
      const s = document.createElement('span');
      this.el.pips.appendChild(s);
      this.pipEls.push(s);
    }

    this.damageTimer = 0;
    this.toastTimer = 0;
    this.bannerTimer = 0;
  }

  show() { this.el.hud.hidden = false; }
  hide() { this.el.hud.hidden = true; }

  flashDamage() {
    this.damageTimer = 0.34;
    this.el.damage.style.opacity = '0.85';
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = 2.4;
  }

  waveBanner(n, sub) {
    this.el.banner.querySelector('.n').textContent = `WAVE ${n}`;
    this.el.banner.querySelector('.s').textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerTimer = 2.6;
  }

  showDeath(wave, kills) {
    this.el.deadStats.textContent = `REACHED WAVE ${wave} — ${kills} HOSTILES ELIMINATED`;
    this.el.dead.hidden = false;
  }

  hideScreens() {
    this.el.start.hidden = true;
    this.el.dead.hidden = true;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.weapons;

    // hull
    const hp = Math.max(0, Math.round(p.health));
    this.el.healthNum.textContent = hp;
    const frac = hp / MAX_HEALTH;
    this.el.healthFill.style.width = `${frac * 100}%`;
    this.el.healthBlock.classList.toggle('hurt', frac <= 0.5 && frac > 0.22);
    this.el.healthBlock.classList.toggle('crit', frac <= 0.22);

    // gatling
    this.el.gatFill.style.width = `${(w.gatAmmo / GAT_CAPACITY) * 100}%`;
    this.el.weaponsBlock.classList.toggle('reloading', w.gatReloading);
    if (w.gatReloading) {
      this.el.gatState.textContent = `RELOADING ${w.gatReloadLeft.toFixed(1)}s`;
    } else {
      this.el.gatState.textContent = `${w.gatAmmo.toFixed(1)}s OF FIRE`;
    }

    // missiles
    for (let i = 0; i < this.pipEls.length; i++) {
      this.pipEls[i].classList.toggle('spent', i >= w.rack);
    }
    this.el.weaponsBlock.classList.toggle('rack-reloading', w.rackReloading);
    if (w.rackReloading) {
      const left = Math.ceil(w.rackReloadLeft);
      const m = (left / 60) | 0;
      const s = left % 60;
      this.el.missileState.textContent = `RELOADING ${m}:${String(s).padStart(2, '0')}`;
    } else {
      this.el.missileState.textContent = `${w.rack} / ${RACK_SIZE} READY`;
    }

    // counters
    this.el.waveNum.textContent = g.enemies.wave;
    this.el.aliveNum.textContent = g.enemies.alive;
    this.el.killNum.textContent = g.kills;
    if (this.el.allyNum) this.el.allyNum.textContent = g.friendlies.alive;
    if (this.el.fpsNum) this.el.fpsNum.textContent = g.fps || '--';

    // target highlight
    const aiming = g.aimingAtEnemy;
    this.el.crosshair.classList.toggle('locked', aiming);

    // timed effects
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) this.el.damage.style.opacity = '0';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
  }
}
