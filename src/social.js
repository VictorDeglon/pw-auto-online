// NPC Social Interactions, Status/Reputation Boosts, and Companion Friend Roles
// Features:
// - Talk to any civilian NPC with [E]
// - Boost status and reputation through compliments, street favors, and camaraderie
// - Recruit friends into predefined roles:
//   1. BODYGUARD: Follows player with weapon, defends against aggressive hostiles/police
//   2. GETAWAY DRIVER: Takes the wheel or follows in convoy, ready for high-speed evasion
//   3. WINGMAN (GUNNER): Rides shotgun, shoots pursuers out the passenger window
//   4. LOOKOUT: Spots incoming cruisers and alerts the player before ambush
//   5. MECHANIC: Automatically repairs player vehicle to 100% when stopped

import { ctx } from './ctx.js';
import { skill } from './progress.js';

export const COMPANIONS = [];

export const SOCIAL = {
  activeDialog: null,
  activeTarget: null,
  get isOpen() { const m = document.getElementById('social-modal'); return !!m && !m.hidden; },

  interact(ped) {
    if (!ped || ped.state === 'dead' || ped.state === 'down' || ped.isCop) return;
    this.activeTarget = ped;
    this.openDialog(ped);
  },

  openDialog(ped) {
    const roles = ['Bodyguard', 'Getaway Driver', 'Wingman', 'Lookout', 'Mechanic'];
    const assignedRole = ped.companionRole || roles[Math.floor(Math.random() * roles.length)];
    ped.companionRole = assignedRole;

    const rep = ctx.save ? ctx.save.rep : 0;
    const isFriend = ped.isFriend || rep > 50;

    let modal = document.getElementById('social-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'social-modal';
      modal.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:90;background:rgba(12,18,30,.92);border:2px solid #f0b23a;border-radius:12px;padding:20px 24px;min-width:420px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.6);font-family:system-ui,sans-serif;';
      document.body.appendChild(modal);
    }

    modal.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock(); // free the mouse so the buttons can be clicked
    modal.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#f0b23a;margin-bottom:8px">💬 Conversation with Local</div>
      <div style="font-size:14px;color:#cfd6e2;margin-bottom:14px">
        ${isFriend ? `"Hey what's good! Always got your back in Poway."` : `"Hey there. What's up?"`}
        <br><span style="font-size:12px;color:#7dff6a">Potential Role: <b>${assignedRole}</b></span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="soc-compliment" style="padding:8px 12px;background:#1a2538;color:#fff;border:1px solid #38bdf8;border-radius:6px;cursor:pointer;font-weight:600">
          🗣️ Chat & Compliment (+5 Street Cred)
        </button>
        <button id="soc-donate" style="padding:8px 12px;background:#1a2538;color:#fff;border:1px solid #7dff6a;border-radius:6px;cursor:pointer;font-weight:600">
          💵 Give $50 Favor (+15 Rep & Befriend)
        </button>
        <button id="soc-recruit" style="padding:8px 12px;background:#f0b23a;color:#0b111f;border:none;border-radius:6px;cursor:pointer;font-weight:700">
          🤝 Recruit as ${assignedRole.toUpperCase()}
        </button>
        <button id="soc-close" style="padding:6px 10px;background:rgba(255,255,255,.08);color:#94a3b8;border:none;border-radius:6px;cursor:pointer;font-size:12px;margin-top:4px">
          Leave
        </button>
      </div>
    `;

    document.getElementById('soc-compliment').onclick = () => {
      if (ctx.save) ctx.save.rep = (ctx.save.rep || 0) + 5;
      if (ctx.notify) ctx.notify('🌟 <b>Street Respect +5</b><br>Locals appreciate the good word.', '#38bdf8', 2500);
      if (ctx.sfx && ctx.sfx.tune) ctx.sfx.tune();
      modal.hidden = true;
    };

    document.getElementById('soc-donate').onclick = () => {
      if (ctx.save && ctx.save.money >= 50) {
        ctx.save.money -= 50;
        ctx.save.rep = (ctx.save.rep || 0) + 15;
        ped.isFriend = true;
        if (ctx.notify) ctx.notify('🤝 <b>Favor Done: +15 Rep</b><br>You made a loyal friend in town.', '#7dff6a', 3000);
        if (ctx.sfx && ctx.sfx.cash) ctx.sfx.cash();
      } else {
        if (ctx.notify) ctx.notify('Not enough cash for a favor ($50 required).', '#ef4444', 2000);
      }
      modal.hidden = true;
    };

    document.getElementById('soc-recruit').onclick = () => {
      this.recruitCompanion(ped, assignedRole);
      modal.hidden = true;
    };

    document.getElementById('soc-close').onclick = () => {
      modal.hidden = true;
    };
  },

  recruitCompanion(ped, role) {
    if (COMPANIONS.length >= 3 + skill('leader')) { // Leader (src/progress.js)
      if (ctx.notify) ctx.notify(`Squad full (Max ${3 + skill('leader')} active companions). Dismiss one first.`, '#ef4444', 2500);
      return;
    }

    ped.isCompanion = true;
    ped.companionRole = role;
    ped.state = 'companion';
    ped.health = 250;
    if (role === 'Bodyguard') ped.gun = 'smg';
    if (role === 'Wingman') ped.gun = 'pistol';

    COMPANIONS.push(ped);
    if (ctx.notify) ctx.notify(`🔥 <b>${role.toUpperCase()} RECRUITED!</b><br>They will follow and assist you.`, '#f0b23a', 4500);
  },

  update(dt) {
    const P = ctx.player;
    if (!P || P.dead) return;

    for (let i = COMPANIONS.length - 1; i >= 0; i--) {
      const c = COMPANIONS[i];
      if (c.removed) { COMPANIONS.splice(i, 1); continue; } // despawned (left far behind): frees the squad slot
      if (c.state === 'dead' || c.health <= 0) {
        COMPANIONS.splice(i, 1);
        if (ctx.notify) ctx.notify(`⚠️ Your ${c.companionRole || 'companion'} went down!`, '#ef4444', 3000);
        continue;
      }

      // Follow AI
      const dist = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (dist > 3.0) {
        const dx = (P.pos.x - c.pos.x) / dist;
        const dz = (P.pos.z - c.pos.z) / dist;
        const spd = dist > 12 ? 8.5 : 4.0;
        c.pos.x += dx * spd * dt;
        c.pos.z += dz * spd * dt;
        c.rotY = Math.atan2(dx, dz);
      }

      // Role specific abilities
      if (c.companionRole === 'Bodyguard') {
        // Attack nearby pursuing cops or hostiles
        if (ctx.police && ctx.police.wanted > 0) {
          for (const v of ctx.vehicles || []) {
            if (v.isCop && !v.dead && Math.hypot(v.pos.x - c.pos.x, v.pos.z - c.pos.z) < 30) {
              if (Math.random() < dt * 1.5) {
                ctx.damageCar(v, 25, 'player');
                if (ctx.tracer) ctx.tracer(c.pos.x, c.pos.y + 1.4, c.pos.z, v.pos.x, v.pos.y + 0.8, v.pos.z);
                if (ctx.sfx && ctx.sfx.hit) ctx.sfx.hit(0.2);
              }
            }
          }
        }
      } else if (c.companionRole === 'Mechanic') {
        // Repair player vehicle if stopped
        if (P.inCar && P.inCar.vel.length() < 1 && P.inCar.health < 100) {
          P.inCar.health = Math.min(100, P.inCar.health + dt * 25);
          if (Math.random() < dt * 2) {
            if (ctx.sparks) ctx.sparks(P.inCar.pos.x, P.inCar.pos.y + 0.5, P.inCar.pos.z);
          }
        }
      } else if (c.companionRole === 'Lookout') {
        // Warn of approaching police
        c.lookoutT = (c.lookoutT || 0) - dt;
        if (c.lookoutT <= 0 && ctx.police && ctx.police.wanted > 0) {
          c.lookoutT = 8.0;
          if (ctx.notify) ctx.notify('👁️ <b>LOOKOUT:</b> "Squad cars closing in from the perimeter, stay sharp!"', '#38bdf8', 3500);
        }
      }
    }
  }
};
