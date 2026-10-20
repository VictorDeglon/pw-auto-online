// 5-Star Military Response System
// When wanted level hits 5 stars, the National Guard / Military is mobilized:
// - Armored APCs and Heavy Tanks with cannon turrets and 900 HP
// - Military Special Forces soldiers in camo armor with 400 HP, assault rifles, miniguns, and RPGs
// - Escalating Air Strike barrages called in from command
// - If the player survives multiple air strikes, military command authorizes a Tactical Nuclear Strike!

import { ctx } from './ctx.js';

export const MILITARY = {
  active: false,
  timer: 0,
  strikesDelivered: 0,
  nextStrikeTimer: 18,
  nuked: false,
  units: [],
  soldiers: [],

  reset() {
    this.active = false;
    this.timer = 0;
    this.strikesDelivered = 0;
    this.nextStrikeTimer = 18;
    this.nuked = false;
    this.units = [];
    this.soldiers = [];
  },

  update(dt) {
    const P = ctx.player;
    if (!P || P.dead) {
      if (this.active) this.reset();
      return;
    }

    const wanted = (ctx.police && ctx.police.wanted) || 0;
    if (wanted < 5) {
      if (this.active) this.reset();
      return;
    }

    if (!this.active) {
      this.active = true;
      this.timer = 0;
      this.strikesDelivered = 0;
      this.nextStrikeTimer = 16;
      this.nuked = false;
      ctx.notify('🎖️ <b>DEFCON 1: MILITARY DEPLOYED</b><br>Heavy armor, air strikes & special forces authorized.', '#ef4444', 6000);
      if (ctx.tone) ctx.tone(350, 0.4, 'sawtooth', 0.3);
    }

    this.timer += dt;
    this.nextStrikeTimer -= dt;

    // Spawn military APCs / Tanks if fewer than 2 active
    this.updateMilitaryUnits(dt);

    // Escalating air strikes
    if (this.nextStrikeTimer <= 0 && this.strikesDelivered < 2) {
      this.strikesDelivered++;
      this.nextStrikeTimer = 22;
      this.callAirStrike(this.strikesDelivered);
    } else if (this.strikesDelivered >= 2 && !this.nuked && this.nextStrikeTimer <= 0) {
      // Multiple airstrikes survived: drop the tactical nuke!
      this.nuked = true;
      this.launchTacticalNuke();
    }
  },

  callAirStrike(strikeNum) {
    const f = ctx.focusPos();
    if (!f) return;

    ctx.notify(`⚠️ <b>AIR STRIKE ${strikeNum}/2 INBOUND</b><br>Air Force bombers inbound on target coordinates.`, '#ef4444', 4000);
    if (ctx.sfx && ctx.sfx.whoosh) ctx.sfx.whoosh(1.5);
    if (ctx.tone) {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => ctx.tone(720 + i * 80, 0.25, 'sawtooth', 0.2), i * 350);
      }
    }

    // Deliver cluster missile carpet bombing
    const strikes = ctx.CH && ctx.CH.strikes;
    if (strikes) {
      const p = f;
      const angle = Math.random() * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const count = strikeNum === 1 ? 10 : 15;
      for (let i = 0; i < count; i++) {
        strikes.push({
          t: ctx.simTime + 1.8 + i * 0.18,
          x: p.x + dx * (i - count / 2) * 12 + (Math.random() - 0.5) * 8,
          z: p.z + dz * (i - count / 2) * 12 + (Math.random() - 0.5) * 8,
          R: 12
        });
      }
    }
  },

  launchTacticalNuke() {
    const f = ctx.focusPos();
    if (!f) return;

    if (ctx.big) {
      ctx.big('TACTICAL NUKE AUTHORIZED', 'Threat uncontained · 5 seconds to impact', 'wasted', 5);
    }
    ctx.notify('🚨 <b>STRATEGIC COMMAND OVERRIDE</b><br>Tactical nuclear payload deployed on target coordinates. RUN.', '#ef4444', 6000);

    // Call game nukeAt
    if (typeof ctx.nukeAt === 'function') {
      ctx.nukeAt(f.x, f.z, false, 'National Guard Strategic Command');
    } else if (window.__gtp && window.__gtp.cheat && window.__gtp.cheat.nukeAt) {
      window.__gtp.cheat.nukeAt(f.x, f.z, false, 'National Guard Strategic Command');
    }
  },

  updateMilitaryUnits(dt) {
    const f = ctx.focusPos();
    if (!f) return;

    // Drop dead or despawned units and soldiers (in place: this runs every frame at 5 stars)
    const U = this.units, S = this.soldiers;
    for (let i = U.length - 1; i >= 0; i--) { const u = U[i]; if (!u || u.dead || u.removed || !(u.health > 0)) U.splice(i, 1); }
    for (let i = S.length - 1; i >= 0; i--) { const p = S[i]; if (!p || p.removed || p.state === 'dead') S.splice(i, 1); }

    // Ensure up to 2 military armored vehicles
    if (this.units.length < 2 && Math.random() < dt * 0.4) {
      const ne = ctx.randomEdgeNear ? ctx.randomEdgeNear(f.x, f.z, 80, 220, e => e.t <= 3) : null;
      if (ne) {
        const v = new ctx.Vehicle('suv', ne.x, ne.z, Math.atan2(ne.tx, ne.tz), 0x3d4a34); // Military Olive Camo
        v.isCop = true;
        v.isMilitary = true;
        v.health = 900;
        v.spec.vmax = 58;
        v.spec.acc = 16;
        v.spec.mass = 3800;
        v.driver = 'cop';
        v.dispatched = true;
        v.task = 'chase';
        this.units.push(v);
        ctx.settleCar(v);

        // Spawn military soldier crew (3 soldiers per APC)
        for (let i = 0; i < 3; i++) {
          const p = new ctx.Ped(ne.x + (i - 1) * 2, ne.z + (i - 1) * 2, { cop: true, car: v });
          p.isMilitary = true;
          p.health = 420;
          p.state = 'cop';
          p.gun = i === 0 ? 'minigun' : (i === 1 ? 'rpg' : 'rifle');
          this.soldiers.push(p);
        }
        ctx.notify('🎖️ <b>MILITARY CONVOY INBOUND</b>', '#ef4444', 2500);
      }
    }
  }
};
