/**
 * Plaza Textures & Materials Generator (AAA Real-Time PBR Textures)
 * Procedural generation for Asphalt, Scored Sidewalks, ADA Tiles, Rooftops,
 * HVAC details, and authentic commercial brand logos.
 */
import * as THREE from 'three';

const textureCache = new Map();

// scale: draw at (width, height) on a canvas that much smaller (shapes and text only: putImageData isn't scaled)
function createTexture(key, drawFn, width = 512, height = 512, scale = 1) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (scale !== 1) ctx.scale(scale, scale);
  drawFn(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, texture);
  return texture;
}

// ---------------------------------------------------------------------------
// 1. GROUND & PAVING TEXTURES
// ---------------------------------------------------------------------------

export function getAsphaltTex() {
  return createTexture('plaza_asphalt', (ctx, w, h) => {
    // Rich asphalt dark charcoal base
    ctx.fillStyle = '#222326';
    ctx.fillRect(0, 0, w, h);

    // Fine mineral aggregate flecks
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 32;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle tar patch lines and asphalt wear
    ctx.strokeStyle = 'rgba(18, 19, 21, 0.4)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const x0 = Math.random() * w, y0 = Math.random() * h;
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + Math.random() * 80 - 40, y0 + 60, x0 + Math.random() * 80 - 40, y0 + 120, x0 + Math.random() * 80 - 40, y0 + 180);
      ctx.stroke();
    }
  }, 512, 512);
}

export function getParkingLotTex() {
  return createTexture('plaza_parking_stalls', (ctx, w, h) => {
    // Asphalt base
    ctx.fillStyle = '#232528';
    ctx.fillRect(0, 0, w, h);

    // Aggregate noise
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 24;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Crisp white parking stall dividing lines
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';

    // 4 standard stalls along the width
    const stallW = w / 4;
    for (let i = 0; i <= 4; i++) {
      const x = i * stallW;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.05);
      ctx.lineTo(x, h * 0.85);
      ctx.stroke();
    }

    // Yellow stall end warning cap
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.85);
    ctx.lineTo(w, h * 0.85);
    ctx.stroke();

    // Blue handicap accessible stall on stall #1
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(stallW * 0.08, h * 0.12, stallW * 0.84, h * 0.68);

    // Stenciled white international symbol of access (wheelchair)
    ctx.fillStyle = '#ffffff';
    const cx = stallW * 0.5, cy = h * 0.46;
    // Head
    ctx.beginPath(); ctx.arc(cx, cy - 32, 10, 0, Math.PI * 2); ctx.fill();
    // Torso & arm
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 18);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx + 22, cy + 14);
    ctx.stroke();
    // Wheel
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 18, 20, Math.PI * 0.4, Math.PI * 1.8);
    ctx.stroke();
  }, 1024, 1024);
}

export function getScoredSidewalkTex() {
  return createTexture('plaza_scored_sidewalk', (ctx, w, h) => {
    // Light architectural concrete
    ctx.fillStyle = '#b8b5ad';
    ctx.fillRect(0, 0, w, h);

    // Concrete sand aggregate texture
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 20;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Expansion joint grooved score lines
    ctx.strokeStyle = '#7c7870';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Subtle edge bevel highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2 + 3, 0); ctx.lineTo(w / 2 + 3, h);
    ctx.moveTo(0, h / 2 + 3); ctx.lineTo(w, h / 2 + 3);
    ctx.stroke();
  }, 512, 512);
}

export function getTactilePavingTex() {
  return createTexture('plaza_tactile_yellow', (ctx, w, h) => {
    // Federal Safety Yellow base
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, w, h);

    // Raised truncated dome dots grid (ADA tactile warning paving)
    const cols = 8, rows = 8;
    const dx = w / cols, dy = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * dx + dx / 2, y = j * dy + dy / 2;
        // Shadow
        ctx.fillStyle = '#b45309';
        ctx.beginPath(); ctx.arc(x + 2, y + 3, dx * 0.28, 0, Math.PI * 2); ctx.fill();
        // Dome base
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x, y, dx * 0.28, 0, Math.PI * 2); ctx.fill();
        // Dome top highlight
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.arc(x - 2, y - 2, dx * 0.16, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, 256, 256);
}

// ---------------------------------------------------------------------------
// 2. ROOFING & MECHANICAL TEXTURES
// ---------------------------------------------------------------------------

export function getSpanishRoofTileTex() {
  return createTexture('plaza_spanish_tile', (ctx, w, h) => {
    // Terracotta clay base
    ctx.fillStyle = '#a84c2a';
    ctx.fillRect(0, 0, w, h);

    // Barrel tile rows with deep shadow recesses
    const tileH = h / 12;
    for (let i = 0; i < 12; i++) {
      const y = i * tileH;
      const grad = ctx.createLinearGradient(0, y, 0, y + tileH);
      grad.addColorStop(0, '#5e2310'); // Deep shadow groove
      grad.addColorStop(0.3, '#c25832'); // Sunny clay highlight
      grad.addColorStop(0.8, '#9c4021'); // Mid clay
      grad.addColorStop(1.0, '#5e2310'); // Bottom seam
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, w, tileH);
    }
  }, 512, 512);
}

export function getStandingSeamMetalTex() {
  return createTexture('plaza_standing_seam', (ctx, w, h) => {
    // Dark architectural bronze/charcoal sheet metal
    ctx.fillStyle = '#2f343b';
    ctx.fillRect(0, 0, w, h);

    // Vertical standing seams
    const seamW = w / 8;
    for (let i = 0; i < 8; i++) {
      const x = i * seamW;
      // High-standing seam bead
      ctx.fillStyle = '#1c1f24';
      ctx.fillRect(x - 4, 0, 8, h);
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(x - 2, 0, 4, h);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(x - 1, 0, 2, h);
    }
  }, 512, 512);
}

export function getTPOMembraneTex() {
  return createTexture('plaza_tpo_membrane', (ctx, w, h) => {
    // White/Light Grey reflective cool-roof commercial membrane
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(0, 0, w, h);

    // Welded seam lines
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.33, 0); ctx.lineTo(w * 0.33, h);
    ctx.moveTo(w * 0.67, 0); ctx.lineTo(w * 0.67, h);
    ctx.stroke();

    // Textured slip-resistant maintenance walk path
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(w * 0.42, 0, w * 0.16, h);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(w * 0.44, 0, w * 0.12, h);
  }, 512, 512);
}

export function getHVACGrilleTex() {
  return createTexture('plaza_hvac_grille', (ctx, w, h) => {
    // Galvanized sheet metal dark interior
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, w, h);

    // Condenser coil louver slats
    const slatH = h / 24;
    for (let i = 0; i < 24; i++) {
      const y = i * slatH;
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(0, y + 2, w, slatH * 0.55);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(0, y + 2, w, 2);
    }
  }, 256, 256);
}

// ---------------------------------------------------------------------------
// 3. AUTHENTIC STOREFRONT BRAND LOGOS
// ---------------------------------------------------------------------------

const LOGO_SCALE = 0.5; // store signs: 512 x 192 is plenty at 12 m wide, and a quarter of the upload
export function getBrandLogoTex(storeKey) {
  switch (storeKey) {
    // --- PLAZA 1: POWAY TOWN CENTER / CREEKSIDE ---
    case 'habit_burger':
      return createTexture('logo_habit_burger', (g, w, h) => {
        g.fillStyle = '#1c1917'; // Charcoal background
        g.fillRect(0, 0, w, h);
        // Red emblem box
        g.fillStyle = '#b91c1c';
        g.roundRect ? g.roundRect(16, 12, w - 32, h - 24, 16) : g.fillRect(16, 12, w - 32, h - 24);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = 'bold 96px "Arial Black", Impact, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('The Habit', w / 2, h * 0.42);
        g.fillStyle = '#fef08a';
        g.font = 'bold 42px "Arial", sans-serif';
        g.letterSpacing = '6px';
        g.fillText('BURGER GRILL', w / 2, h * 0.76);
      }, 1024, 384, LOGO_SCALE);

    case 'board_and_brew':
      return createTexture('logo_board_and_brew', (g, w, h) => {
        g.fillStyle = '#0e7490'; // Coastal turquoise
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.font = '900 84px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('BOARD & BREW', w / 2, h * 0.44);
        g.font = 'bold 36px "Brush Script MT", cursive, sans-serif';
        g.fillStyle = '#fef08a';
        g.fillText('Craft Sandwiches & Cold Brews', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'round_table_pizza':
      return createTexture('logo_round_table_pizza', (g, w, h) => {
        g.fillStyle = '#7f1d1d'; // Deep red
        g.fillRect(0, 0, w, h);
        // Gold crest border
        g.strokeStyle = '#fbbf24';
        g.lineWidth = 12;
        g.strokeRect(16, 16, w - 32, h - 32);
        g.fillStyle = '#fbbf24';
        g.font = '900 78px "Times New Roman", Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ROUND TABLE', w / 2, h * 0.4);
        g.font = 'bold 44px sans-serif';
        g.fillStyle = '#ffffff';
        g.fillText('PIZZA', w / 2, h * 0.75);
      }, 1024, 384, LOGO_SCALE);

    case 'jamba':
      return createTexture('logo_jamba', (g, w, h) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        // Colorful swirl icon
        g.fillStyle = '#ea580c';
        g.font = '900 110px "Arial Rounded MT Bold", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('jamba', w / 2, h / 2);
      }, 1024, 384, LOGO_SCALE);

    case 'sport_clips':
      return createTexture('logo_sport_clips', (g, w, h) => {
        g.fillStyle = '#b91c1c'; // Red
        g.fillRect(0, 0, w, h);
        // Black checkered band
        g.fillStyle = '#000000';
        g.fillRect(0, 0, w, 28);
        g.fillRect(0, h - 28, w, 28);
        g.fillStyle = '#ffffff';
        g.font = '900 88px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('Sport Clips', w / 2, h * 0.46);
        g.font = 'bold 36px Arial, sans-serif';
        g.fillText('HAIRCUTS', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    // --- PLAZA 2: POWAY VALLEY CENTER / CARRIAGE SQUARE ---
    case 'five_guys':
      return createTexture('logo_five_guys', (g, w, h) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        // Red and white checkered border
        const sq = 32;
        for (let x = 0; x < w; x += sq) {
          if ((x / sq) % 2 === 0) {
            g.fillStyle = '#dc2626';
            g.fillRect(x, 0, sq, sq);
            g.fillRect(x, h - sq, sq, sq);
          }
        }
        g.fillStyle = '#dc2626';
        g.font = '900 96px "Arial Black", Impact, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('FIVE GUYS', w / 2, h * 0.44);
        g.font = 'bold 38px Arial, sans-serif';
        g.fillText('BURGERS and FRIES', w / 2, h * 0.76);
      }, 1024, 384, LOGO_SCALE);

    case 'jersey_mikes':
      return createTexture('logo_jersey_mikes', (g, w, h) => {
        g.fillStyle = '#0f172a'; // Navy
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ef4444';
        g.font = 'italic bold 90px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('Jersey Mike\'s', w / 2, h * 0.42);
        g.fillStyle = '#fde047';
        g.font = 'bold 50px Arial, sans-serif';
        g.fillText('SUBS', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'wingstop':
      return createTexture('logo_wingstop', (g, w, h) => {
        g.fillStyle = '#14532d'; // Aviation green
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 8;
        g.strokeRect(16, 16, w - 32, h - 32);
        g.fillStyle = '#ffffff';
        g.font = 'bold 100px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('WINGSTOP', w / 2, h * 0.46);
        g.font = 'bold 32px Arial, sans-serif';
        g.fillStyle = '#86efac';
        g.fillText('THE WING EXPERTS', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'little_caesars':
      return createTexture('logo_little_caesars', (g, w, h) => {
        g.fillStyle = '#ea580c'; // Vibrant Orange
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.font = '900 86px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('Little Caesars', w / 2, h * 0.44);
        g.font = 'bold 44px Arial, sans-serif';
        g.fillStyle = '#fef08a';
        g.fillText('PIZZA! PIZZA!', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'oreilly_auto':
      return createTexture('logo_oreilly_auto', (g, w, h) => {
        g.fillStyle = '#15803d'; // O'Reilly green
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#dc2626';
        g.fillRect(16, 16, w - 32, 40);
        g.fillStyle = '#ffffff';
        g.font = 'italic 900 88px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('O\'Reilly', w / 2, h * 0.48);
        g.fillStyle = '#fde047';
        g.font = 'bold 40px Arial, sans-serif';
        g.fillText('AUTO PARTS', w / 2, h * 0.82);
      }, 1024, 384, LOGO_SCALE);

    // --- PLAZA 3: TWIN PEAKS PLAZA ---
    case 'outback':
      return createTexture('logo_outback', (g, w, h) => {
        g.fillStyle = '#451a03'; // Rustic wood/leather brown
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#dc2626';
        g.font = '900 92px "Arial Black", Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('OUTBACK', w / 2, h * 0.42);
        g.fillStyle = '#fde047';
        g.font = 'bold 40px Arial, sans-serif';
        g.fillText('STEAKHOUSE', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'ikes_sandwiches':
      return createTexture('logo_ikes', (g, w, h) => {
        g.fillStyle = '#eab308'; // Signature yellow
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1c1917';
        g.font = '900 86px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('IKE\'S', w / 2, h * 0.4);
        g.font = 'bold 40px Arial, sans-serif';
        g.fillStyle = '#dc2626';
        g.fillText('LOVE & SANDWICHES', w / 2, h * 0.76);
      }, 1024, 384, LOGO_SCALE);

    case 'wells_fargo':
      return createTexture('logo_wells_fargo', (g, w, h) => {
        g.fillStyle = '#dc2626'; // Wells Fargo Red
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fde047';
        g.font = '900 80px "Times New Roman", serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('WELLS FARGO', w / 2, h / 2);
      }, 1024, 384, LOGO_SCALE);

    // --- PLAZA 4: CARMEL MOUNTAIN LIFESTYLE PROMENADE ---
    case 'barnes_and_noble':
      return createTexture('logo_barnes_and_noble', (g, w, h) => {
        g.fillStyle = '#064e3b'; // Classic deep green
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fef3c7';
        g.font = '700 78px "Times New Roman", Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('BARNES & NOBLE', w / 2, h * 0.44);
        g.font = '500 36px "Times New Roman", serif';
        g.fillText('BOOKSELLERS', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'trader_joes':
      return createTexture('logo_trader_joes', (g, w, h) => {
        g.fillStyle = '#fef2f2'; // Vintage cream
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#b91c1c';
        g.font = '900 86px "Arial Rounded MT Bold", Impact, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TRADER JOE\'S', w / 2, h / 2);
      }, 1024, 384, LOGO_SCALE);

    case 'chipotle':
      return createTexture('logo_chipotle', (g, w, h) => {
        g.fillStyle = '#451a03'; // Deep chili brown
        g.fillRect(0, 0, w, h);
        // Red circle emblem
        g.fillStyle = '#dc2626';
        g.beginPath(); g.arc(w * 0.22, h / 2, h * 0.38, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff';
        g.font = 'bold 74px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('CHIPOTLE', w * 0.62, h * 0.44);
        g.font = 'bold 34px Arial, sans-serif';
        g.fillStyle = '#fde047';
        g.fillText('MEXICAN GRILL', w * 0.62, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'cava':
      return createTexture('logo_cava', (g, w, h) => {
        g.fillStyle = '#ea580c'; // Warm terracotta
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.font = '900 120px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('CAVA', w / 2, h / 2);
      }, 1024, 384, LOGO_SCALE);

    case 'ulta_beauty':
      return createTexture('logo_ulta', (g, w, h) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f97316';
        g.font = '900 100px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ULTA', w / 2, h * 0.42);
        g.font = 'bold 44px Arial, sans-serif';
        g.fillStyle = '#0f172a';
        g.fillText('BEAUTY', w / 2, h * 0.76);
      }, 1024, 384, LOGO_SCALE);

    // --- PLAZA 5: COSTCO TECH & INDUSTRIAL PLAZA ---
    case 'panera_bread':
      return createTexture('logo_panera', (g, w, h) => {
        g.fillStyle = '#4d6938'; // Panera olive green
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fef08a';
        g.font = 'italic bold 86px Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('Panera', w / 2, h * 0.42);
        g.font = 'bold 44px Arial, sans-serif';
        g.fillStyle = '#ffffff';
        g.fillText('BREAD', w / 2, h * 0.78);
      }, 1024, 384, LOGO_SCALE);

    case 'panda_express':
      return createTexture('logo_panda_express', (g, w, h) => {
        g.fillStyle = '#dc2626'; // Red
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(w * 0.22, h / 2, h * 0.38, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000000';
        g.font = 'bold 70px "Arial Black", sans-serif';
        g.fillText('🐼', w * 0.22, h / 2 + 4);
        g.fillStyle = '#ffffff';
        g.font = '900 68px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('PANDA EXPRESS', w * 0.64, h / 2);
      }, 1024, 384, LOGO_SCALE);

    default:
      return createTexture('logo_default_' + storeKey, (g, w, h) => {
        g.fillStyle = '#1e293b';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f8fafc';
        g.font = 'bold 64px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(storeKey.toUpperCase().replace(/_/g, ' '), w / 2, h / 2);
      }, 1024, 384, LOGO_SCALE);
  }
}
