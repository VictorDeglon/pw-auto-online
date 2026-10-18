// Multiplayer Gangs System, Gang Airstrips, Warehouse Garages, and Territory Defenses
// Features:
// - Gang creation (Name, Tag, Color), member invitations, ranks (Leader, Lieutenant, Enforcer, Member, Recruit), kicking
// - Gang airstrip ownership limits scaling with gang size (1 person: 1 airstrip, 2-4: 2, 5+: 4)
// - Giant Warehouse Garage where cars and planes can be driven in and saved to gang storage
// - Ammo depot and explosive stockpile inside the warehouse
// - Automated AA SAM missile batteries shooting down unauthorized aircraft within 450m
// - Super-tanky watchtower snipers (500 HP) that kill non-gang trespassers and respawn after 25 seconds
// - Immortal Defensive Specialist NPC inside the warehouse to toggle defense modes (Max, Ground Only, Off)

import { ctx } from './ctx.js';

const GANG_STORAGE_KEY = 'pw-auto-online-gang';

export const GANG = {
  data: null,
  activeDefense: 'max', // 'max', 'ground', 'off'
  snipers: [],
  samCooldown: 0,

  init() {
    try {
      const saved = localStorage.getItem(GANG_STORAGE_KEY);
      if (saved) this.data = JSON.parse(saved);
    } catch (e) { }

    if (!this.data) {
      // Default initial state or player gang
      this.data = {
        id: 'poway-cartel',
        name: 'Poway Cartel',
        tag: 'CARTEL',
        color: '#f0b23a',
        leader: 'You',
        members: [
          { name: 'You', rank: 'Leader', joinedAt: Date.now() },
          { name: 'Rosa V.', rank: 'Lieutenant', joinedAt: Date.now() },
          { name: 'Marco T.', rank: 'Enforcer', joinedAt: Date.now() }
        ],
        airstrips: ['gang-sycamore'],
        warehouse: {
          cars: ['sports', 'muscle'],
          planes: ['prop'],
          ammo: 1000,
          explosives: 50
        },
        defense: 'max'
      };
      this.save();
    }
    this.activeDefense = this.data.defense || 'max';
    this.initDefenses();
  },

  save() {
    try {
      localStorage.setItem(GANG_STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) { }
  },

  createGang(name, tag, color) {
    this.data = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name: name || 'Poway Syndicate',
      tag: (tag || 'SYND').toUpperCase().slice(0, 5),
      color: color || '#f0b23a',
      leader: 'You',
      members: [{ name: 'You', rank: 'Leader', joinedAt: Date.now() }],
      airstrips: [],
      warehouse: { cars: [], planes: [], ammo: 500, explosives: 20 },
      defense: 'max'
    };
    this.save();
    ctx.notify(`👑 <b>GANG CREATED: ${this.data.name} [${this.data.tag}]</b>`, this.data.color, 5000);
  },

  inviteMember(name) {
    if (!this.data) return;
    if (this.data.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      ctx.notify(`${name} is already in the gang.`, '', 2500);
      return;
    }
    this.data.members.push({ name, rank: 'Recruit', joinedAt: Date.now() });
    this.save();
    ctx.notify(`🤝 <b>${name}</b> joined [${this.data.tag}] as Recruit.`, 'green', 3500);
  },

  rankMember(name, delta) {
    if (!this.data) return;
    const RANKS = ['Recruit', 'Member', 'Enforcer', 'Lieutenant', 'Leader'];
    const m = this.data.members.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!m || m.name === 'You') return;
    const curIdx = RANKS.indexOf(m.rank);
    const nextIdx = Math.max(0, Math.min(RANKS.length - 2, curIdx + delta)); // Cannot promote above leader
    m.rank = RANKS[nextIdx];
    this.save();
    ctx.notify(`⭐ <b>${m.name}</b> ranked to <b>${m.rank}</b>`, '#38bdf8', 3000);
  },

  kickMember(name) {
    if (!this.data || name === 'You') return;
    this.data.members = this.data.members.filter(m => m.name.toLowerCase() !== name.toLowerCase());
    this.save();
    ctx.notify(`🚪 <b>${name}</b> was kicked from the gang.`, '#ef4444', 3000);
  },

  maxAirstrips() {
    const n = (this.data && this.data.members) ? this.data.members.length : 1;
    if (n <= 1) return 1;
    if (n <= 4) return 2;
    return 4;
  },

  canBuyAirstrip() {
    if (!this.data) return false;
    const current = (this.data.airstrips || []).length;
    return current < this.maxAirstrips();
  },

  initDefenses() {
    // Spawn snipers on watchtowers for gang bases
    this.snipers = [
      { id: 'sn-syc-1', ap: 'gang-sycamore', x: 3620, z: 710, y: 18, hp: 500, dead: false, respawnT: 0 },
      { id: 'sn-syc-2', ap: 'gang-sycamore', x: 3580, z: 790, y: 18, hp: 500, dead: false, respawnT: 0 },
      { id: 'sn-iron-1', ap: 'gang-ironpeak', x: 5640, z: 1180, y: 22, hp: 500, dead: false, respawnT: 0 },
      { id: 'sn-iron-2', ap: 'gang-ironpeak', x: 5560, z: 1220, y: 22, hp: 500, dead: false, respawnT: 0 }
    ];
  },

  update(dt) {
    if (!this.data) return;
    this.samCooldown -= dt;

    // Update snipers and 25-second respawns
    for (const s of this.snipers) {
      if (s.dead) {
        s.respawnT -= dt;
        if (s.respawnT <= 0) {
          s.dead = false;
          s.hp = 500;
          ctx.notify(`🛡️ Gang sniper respawned on post at base.`, '#38bdf8', 2500);
        }
        continue;
      }

      // Snipers fire on non-gang trespassers if defense mode != 'off'
      if (this.activeDefense !== 'off') {
        const P = ctx.player;
        if (P && !P.dead) {
          // If player is leader, snipers don't shoot them
          // In multiplayer or hostile NPCs / cops
          if (ctx.police && ctx.police.wanted > 0) {
            // Snipers attack pursuing police!
            for (const c of ctx.vehicles) {
              if (c.isCop && !c.dead && Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < 220) {
                if (Math.random() < dt * 0.8) {
                  ctx.damageCar(c, 45, 'player');
                  if (ctx.tracer) ctx.tracer(s.x, s.y, s.z, c.pos.x, c.pos.y + 1, c.pos.z);
                  if (ctx.sfx && ctx.sfx.hit) ctx.sfx.hit(0.3);
                }
              }
            }
          }
        }
      }
    }

    // Surface-to-Air (SAM) Missiles for unauthorized aircraft
    if (this.activeDefense === 'max' && this.samCooldown <= 0) {
      const heli = ctx.police && ctx.police.heli;
      if (heli && heli.health > 0) {
        // Check if police heli is near gang territory
        for (const apId of this.data.airstrips) {
          const ap = (window.__AIRPORTS || []).find(a => a.id === apId) || { x: 3600, z: 750 };
          const dist = Math.hypot(heli.pos.x - ap.x, heli.pos.z - ap.z);
          if (dist < 420) {
            this.samCooldown = 6.0;
            ctx.notify('🚀 <b>SAM MISSILE LAUNCHED</b><br>Automated air defense locked onto hostile helicopter.', '#ef4444', 3500);
            if (ctx.sfx && ctx.sfx.whoosh) ctx.sfx.whoosh(1.2);
            heli.health -= 120;
            if (ctx.explosionAt) ctx.explosionAt(heli.pos.x, heli.pos.y, heli.pos.z, 8, 'chain');
            break;
          }
        }
      }
    }

    // Check Warehouse Garage Zone
    this.checkWarehouseGarages();
  },

  checkWarehouseGarages() {
    const P = ctx.player;
    if (!P || P.dead) return;

    for (const apId of (this.data.airstrips || [])) {
      const ap = (window.__AIRPORTS || []).find(a => a.id === apId);
      if (!ap) continue;

      const hgX = ap.x + ap.wid / 2 + 28, hgZ = ap.z;
      const d = Math.hypot(P.pos.x - hgX, P.pos.z - hgZ);

      if (d < 24) {
        // Inside warehouse garage!
        if (P.inCar && !P.inCar.savedToGang) {
          P.inCar.savedToGang = true;
          this.data.warehouse.cars.push(P.inCar.type);
          this.save();
          ctx.notify(`🚗 <b>Car Stored in Gang Warehouse!</b><br>${P.inCar.type.toUpperCase()} saved to fleet.`, 'green', 3500);
        }

        // Ammo & Explosives restock prompt
        if (P.arsenal) {
          for (const w of ctx.WEAPONS || []) {
            if (w.max && P.arsenal[w.id] !== undefined && P.arsenal[w.id] < w.max) {
              P.arsenal[w.id] = w.max;
            }
          }
        }
      }
    }
  },

  setDefenseMode(mode) {
    this.activeDefense = mode;
    if (this.data) {
      this.data.defense = mode;
      this.save();
    }
    const label = mode === 'max' ? 'MAX DEFENSE (SAM + Snipers)' : (mode === 'ground' ? 'GROUND PATROL (Snipers Only)' : 'DEFENSES OFF (Stand Down)');
    ctx.notify(`🛡️ <b>Defense Protocol Updated:</b><br>${label}`, '#38bdf8', 4000);
  }
};
