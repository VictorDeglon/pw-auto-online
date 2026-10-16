// School props: furniture, wall fixtures, safety equipment, vending. Registered into the kit by createPropKit.
// Real-world sizes in metres. See kit.js for anchors and the action context.

export function schoolKinds(K) {
  const { THREE, M, tex, parts, add, pivot, on, tween, after, ease, play, say, wallet, heal, pick, live, builders: B } = K;
  const PI = Math.PI;
  const hexOf = c => new THREE.Color(c).getHexString();
  const quadCache = new Map();
  const quadGeo = (w, h) => { const k = w + '|' + h; let g = quadCache.get(k); if (!g) quadCache.set(k, g = new THREE.PlaneGeometry(w, h)); return g; };
  const quad = (parent, w, h, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(quadGeo(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; parent.add(m); return m; };
  const texMat = (t, o = {}) => M.std(`t|${t.uuid}|${JSON.stringify(o)}`, Object.assign({ map: t, roughness: 0.55, metalness: 0 }, o));
  let seedCounter = 0;
  const seedOf = p => p.seed ?? (seedCounter++ % 4) + 1;

  // ================================================================ desk
  B.desk = {
    anchor: 'floor', desc: 'student desk: 0.6 x 0.45 laminate top at 0.74 m, steel book box (open toward -Z, the student side)',
    build(obj, p) {
      const frame = p.frame === 'chrome' ? M.chrome : M.paint(p.frameColor ?? 0x2a2c30, 0.5, 0.5);
      const top = p.top === 'gray' ? M.laminateGray : M.laminate;
      add(obj, parts(`desk|${p.frame}|${p.frameColor}|${p.top}`, b => {
        const H = 0.74, T = 0.026, W = 0.6, D = 0.45, e = 0.004, band = M.plasticBlack;
        b.rbox(top, W, T, D, 0.006, 0, H - T / 2, 0);
        b.box(band, W + e, T - 0.004, e, 0, H - T / 2, D / 2); b.box(band, W + e, T - 0.004, e, 0, H - T / 2, -D / 2);
        b.box(band, e, T - 0.004, D, W / 2, H - T / 2, 0); b.box(band, e, T - 0.004, D, -W / 2, H - T / 2, 0);
        // book box (steel), open toward -Z
        const by = 0.6, bh = 0.105, bw = 0.5, bd = 0.36, t = 0.006;
        b.box(frame, bw, t, bd, 0, by, 0.02); b.box(frame, t, bh, bd, -bw / 2, by + bh / 2, 0.02); b.box(frame, t, bh, bd, bw / 2, by + bh / 2, 0.02);
        b.box(frame, bw, bh, t, 0, by + bh / 2, 0.02 + bd / 2);
        // telescoping square legs + glides + side braces
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const x = sx * 0.265, z = sz * 0.185;
          b.box(frame, 0.028, 0.34, 0.028, x, H - T - 0.17, z);
          b.box(M.chrome, 0.021, 0.4, 0.021, x, 0.21, z);
          b.cyl(M.rubber, 0.016, 0.018, 0.018, x, 0.009, z, { seg: 8 });
        }
        for (const sx of [-1, 1]) b.box(frame, 0.02, 0.02, 0.37, sx * 0.265, 0.16, 0);
        b.box(frame, 0.53, 0.02, 0.02, 0, 0.16, -0.185);
        if (p.clutter) { // notebook + pencil
          b.box(M.paper, 0.21, 0.008, 0.28, 0.08, H + 0.004, 0.02, { ry: 0.15 });
          b.box(M.plastic(0x1d4e9a), 0.215, 0.002, 0.285, 0.08, H + 0.0085, 0.02, { ry: 0.15 });
          b.cyl(M.paint(0xf2c230, 0.5, 0), 0.0035, 0.0035, 0.18, -0.15, H + 0.004, 0.05, { seg: 6, rz: PI / 2, ry: 0.5 });
        }
      }));
    },
  };

  // ================================================================ chair
  B.chair = {
    anchor: 'floor', desc: 'stackable polypropylene shell chair, seat 0.45 m, faces +Z',
    build(obj, p) {
      const c = p.color ?? 0x23406e, shell = M.plastic(c, 0.42, THREE.DoubleSide), frame = p.frame === 'black' ? M.steelBlack : M.chrome;
      add(obj, parts(`chair|${hexOf(c)}|${p.frame}`, b => {
        const SY = 0.455;
        b.rbox(shell, 0.42, 0.03, 0.42, 0.014, 0, SY - 0.015, 0.0, { seg: 2 });
        const g = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 10, 1, true, PI - 0.5, 1.0); g.translate(0, 0, 0.44);
        b.geo(shell, g, 0, 0.7, -0.215, { rx: -0.14 });
        const g2 = new THREE.CylinderGeometry(0.44, 0.44, 0.012, 10, 1, false, PI - 0.5, 1.0); g2.translate(0, 0, 0.44);
        b.geo(shell, g2, 0, 0.85, -0.215 - 0.02, { rx: -0.14 }); // rolled top edge
        const r = 0.0105;
        for (const s of [-1, 1]) {
          b.rod(frame, r, [s * 0.19, 0.44, 0.17], [s * 0.215, 0.012, 0.23]);
          b.rod(frame, r, [s * 0.19, 0.44, -0.17], [s * 0.215, 0.012, -0.25]);
          b.rod(frame, r, [s * 0.19, 0.44, 0.17], [s * 0.19, 0.44, -0.17]);
          b.rod(frame, r, [s * 0.15, 0.44, -0.19], [s * 0.15, 0.62, -0.215]);
          b.sphere(M.rubber, 0.014, s * 0.215, 0.01, 0.23, { ws: 6, hs: 4 });
          b.sphere(M.rubber, 0.014, s * 0.215, 0.01, -0.25, { ws: 6, hs: 4 });
        }
        b.rod(frame, r, [-0.19, 0.44, 0.17], [0.19, 0.44, 0.17]);
      }));
    },
  };

  // ================================================================ teacher desk
  const deskFinds = [
    ['money', 5, 'Confiscated lunch money. $5. Finders keepers.'],
    ['heal', 5, 'An emergency granola bar. (+5 health)'],
    ['text', 0, 'A drawer full of confiscated fidget spinners.'],
    ['text', 0, 'A stack of ungraded essays from 2019.'],
    ['text', 0, 'The answer key. You feel powerful.'],
    ['text', 0, 'Red pens. So many red pens.'],
    ['money', 2, 'Two crumpled dollars in a coffee tin.'],
    ['text', 0, 'A mug that says "World\'s Okayest Teacher".'],
  ];
  B.teacher_desk = {
    anchor: 'floor', desc: 'steel teacher desk 1.52 x 0.76, top 0.74 m, pedestals on the -Z (teacher) side, monitor; faces +Z (the class)',
    build(obj, p) {
      const body = M.paint(p.color ?? 0x7f858b, 0.5, 0.4), top = p.top === 'wood' ? M.laminate : M.laminateGray;
      const W = 1.52, D = 0.76, H = 0.74, T = 0.03;
      const screenMat = M.screen(tex.screen(p.screen ?? 'desktop'), tex.screen(p.screen ?? 'desktop'), 0.55);
      add(obj, parts(`tdesk|${p.color}|${p.top}`, b => {
        b.rbox(top, W, T, D, 0.008, 0, H - T / 2, 0);
        b.box(M.plasticBlack, W + 0.004, T - 0.006, 0.004, 0, H - T / 2, D / 2); b.box(M.plasticBlack, W + 0.004, T - 0.006, 0.004, 0, H - T / 2, -D / 2);
        b.box(body, W - 0.04, 0.56, 0.02, 0, 0.15 + 0.28, D / 2 - 0.03); // modesty panel (+Z)
        for (const sx of [-1, 1]) { // pedestals
          const x = sx * (W / 2 - 0.22);
          b.box(body, 0.42, H - T - 0.06, D - 0.04, x, 0.06 + (H - T - 0.06) / 2, 0);
          b.box(M.dark, 0.38, 0.06, D - 0.1, x, 0.03, 0.02); // recessed kick
        }
        // drawer fronts on the -Z face (left pedestal: 3 box drawers, right: 2 file drawers; top-left is animated)
        const zf = -D / 2 + 0.018, x0 = -(W / 2 - 0.22), x1 = W / 2 - 0.22;
        for (const [y, h] of [[0.43, 0.17], [0.16, 0.24]]) {
          b.box(body, 0.4, h - 0.01, 0.012, x0, y + h / 2, zf - 0.006); b.box(M.chrome, 0.12, 0.012, 0.02, x0, y + h - 0.04, zf - 0.02);
        }
        for (const [y, h] of [[0.385, 0.3], [0.08, 0.3]]) {
          b.box(body, 0.4, h - 0.01, 0.012, x1, y + h / 2, zf - 0.006); b.box(M.chrome, 0.14, 0.014, 0.022, x1, y + h - 0.05, zf - 0.022);
          b.box(M.paper, 0.06, 0.03, 0.002, x1, y + h - 0.1, zf - 0.013);
        }
        b.box(body, 0.6, 0.06, 0.012, 0, H - T - 0.04, zf - 0.006); // pencil drawer
        // stuff on top: monitor (facing -Z), keyboard, mug, papers, apple
        const ty = H;
        b.box(M.plasticBlack, 0.2, 0.012, 0.16, -0.25, ty + 0.006, 0.12);
        b.box(M.plasticBlack, 0.04, 0.3, 0.025, -0.25, ty + 0.16, 0.14);
        b.rbox(M.plasticBlack, 0.56, 0.34, 0.035, 0.008, -0.25, ty + 0.36, 0.11);
        b.box(M.plasticBlack, 0.44, 0.018, 0.14, -0.22, ty + 0.009, -0.17, { ry: 0.05 });
        b.box(M.plasticGray, 0.42, 0.004, 0.12, -0.22, ty + 0.019, -0.17, { ry: 0.05 });
        b.cyl(M.plastic(0xb22a2a, 0.3), 0.04, 0.038, 0.1, 0.33, ty + 0.05, -0.12, { seg: 12 });
        b.torus(M.plastic(0xb22a2a, 0.3), 0.03, 0.008, 0.375, ty + 0.055, -0.12, { rs: 4, ts: 8, ry: 0 });
        for (let i = 0; i < 6; i++) b.box(M.paper, 0.215, 0.006, 0.28, 0.2 + i * 0.004, ty + 0.003 + i * 0.006, 0.08, { ry: (i % 3 - 1) * 0.06 });
        b.sphere(M.plastic(0xc0262b, 0.35), 0.04, 0.55, ty + 0.038, -0.05, { ws: 10, hs: 8, s: [1, 0.9, 1] });
        b.cyl(M.woodDark, 0.003, 0.003, 0.025, 0.55, ty + 0.085, -0.05, { seg: 4 });
        b.cyl(M.plasticBlack, 0.04, 0.04, 0.11, 0.6, ty + 0.055, 0.2, { seg: 10 });
        for (let i = 0; i < 4; i++) b.cyl(M.plastic([0x1d4e9a, 0xc0262b, 0x222222, 0x2a8a3a][i]), 0.004, 0.004, 0.14, 0.6 + (i - 1.5) * 0.012, ty + 0.13, 0.2 + (i % 2) * 0.01, { seg: 5, rz: (i - 1.5) * 0.12 });
      }));
      quad(obj, 0.52, 0.3, screenMat, -0.25, H + 0.36, 0.11 - 0.018, PI);
      // the animated drawer (top-left, teacher side)
      const drawer = pivot(obj, -(W / 2 - 0.22), 0.6, -D / 2 + 0.012, 'drawer');
      add(drawer, parts(`tdesk-drawer|${p.color}`, b => {
        b.box(body, 0.4, 0.11, 0.012, 0, 0.055, -0.006); b.box(M.chrome, 0.12, 0.012, 0.02, 0, 0.08, -0.02);
        b.box(M.interior, 0.36, 0.008, 0.5, 0, 0.012, 0.26); b.box(M.interior, 0.008, 0.09, 0.5, -0.176, 0.05, 0.26); b.box(M.interior, 0.008, 0.09, 0.5, 0.176, 0.05, 0.26);
        b.box(M.paper, 0.2, 0.02, 0.15, -0.06, 0.03, 0.18); b.cyl(M.plastic(0xc0262b), 0.005, 0.005, 0.14, 0.08, 0.025, 0.15, { seg: 5, rx: PI / 2 });
      }));
      let searched = false, busy = false;
      on(obj, p, {
        at: [0, 0.8, -0.65], radius: 1.3, label: 'Search desk',
        action(ctx) {
          if (busy) return; busy = true;
          play(ctx, 'creak', [], '*creak*');
          tween(0.4, k => { drawer.position.z = -D / 2 + 0.012 - 0.3 * k; }, () => after(2.2, () => {
            tween(0.35, k => { drawer.position.z = -D / 2 + 0.012 - 0.3 * (1 - k); }, () => { busy = false; play(ctx, 'thunk', [0.6]); });
          }), ease.out);
          if (searched) { say(ctx, 'Nothing else in here but red pens.'); return; }
          searched = true;
          const [type, n, text] = pick(deskFinds);
          if (type === 'money') { wallet.add(ctx, n); play(ctx, 'coin'); say(ctx, `${text} (+${K.fmt$(n)})`, 'green'); K.crime(ctx, 'theft'); }
          else if (type === 'heal') { heal(ctx, n); say(ctx, text, 'green'); }
          else say(ctx, text);
        },
      });
    },
  };

  // ================================================================ whiteboard
  const doodles = ['Go team!', 'No HW pls', '♥', 'E = mc²', 'I was here', '¯\\_(ツ)_/¯', 'Pizza Friday?', 'x = 42', 'Class of \'27', 'BRB'];
  B.whiteboard = {
    anchor: 'wall', desc: 'dry-erase board 2.44 x 1.22, bottom at 0.9 m, aluminium frame + marker tray (params.text, w, h, y)',
    build(obj, p) {
      const W = p.w ?? 2.44, H = p.h ?? 1.22, Y = p.y ?? 0.9;
      const text = p.text ?? 'Today: Linear Equations\ny = mx + b\nm = slope,  b = y-intercept\nHW: p. 214 #1-25 odd\nQuiz Friday!';
      add(obj, parts(`wb|${W}|${H}|${Y}`, b => {
        const f = 0.024, d = 0.02;
        b.box(M.plasticWhite, W, H, 0.012, 0, Y + H / 2, 0.006);
        b.box(M.alu, W + f * 2, f, d, 0, Y + H + f / 2, d / 2); b.box(M.alu, W + f * 2, f, d, 0, Y - f / 2, d / 2);
        b.box(M.alu, f, H, d, -W / 2 - f / 2, Y + H / 2, d / 2); b.box(M.alu, f, H, d, W / 2 + f / 2, Y + H / 2, d / 2);
        b.box(M.alu, W * 0.98, 0.012, 0.075, 0, Y - f - 0.006, 0.0375); b.box(M.alu, W * 0.98, 0.03, 0.006, 0, Y - f + 0.005, 0.072);
        const cols = [0x111111, 0x1d3fa5, 0xb3141b, 0x0f7a35];
        cols.forEach((c, i) => { b.cyl(M.plastic(c), 0.009, 0.009, 0.13, -0.5 + i * 0.05, Y - f + 0.009, 0.04, { seg: 6, rz: PI / 2, ry: (i - 1.5) * 0.08 }); });
        b.box(M.plasticBlack, 0.15, 0.025, 0.05, 0.4, Y - f + 0.013, 0.04); b.box(M.std('felt', { color: 0x777777, roughness: 1 }), 0.15, 0.012, 0.05, 0.4, Y - f + 0.031, 0.04);
      }));
      const extra = [];
      const board = quad(obj, W, H, M.plasticWhite, 0, Y + H / 2, 0.0125);
      const setTex = () => { board.material = M.std(`wbm|${tex.whiteboard(text, extra).uuid}`, { map: tex.whiteboard(text, extra), roughness: 0.22, metalness: 0, envMap: M.envMap, envMapIntensity: 0.3 }); };
      setTex();
      on(obj, p, {
        at: [0, Y + 0.3, 0.5], radius: Math.max(1.4, W * 0.6),
        label: () => (extra.length >= 3 ? 'Erase the whiteboard doodles' : 'Doodle on the whiteboard'),
        action(ctx) {
          if (extra.length >= 3) { extra.length = 0; play(ctx, 'page', [1], '*swish swish*'); say(ctx, 'Wiped clean. The teacher will never know.'); }
          else { extra.push(pick(doodles.filter(d => !extra.includes(d)))); play(ctx, 'squeak', [], '*squeak squeak*'); }
          setTex();
        },
      });
    },
  };

  // ================================================================ projector
  B.projector = {
    anchor: 'ceiling', desc: 'ceiling-mounted projector (params.ceiling = 3.0, throw = 3.5, on): beam + projected slide toward +Z',
    build(obj, p) {
      const C = p.ceiling ?? 3.0, Y = C - 0.5, throwD = p.throw ?? 3.5, tilt = 0.1;
      add(obj, parts(`proj|${C}`, b => {
        b.cyl(M.plasticWhite, 0.08, 0.08, 0.012, 0, C - 0.006, 0, { seg: 12 });
        b.cyl(M.alu, 0.018, 0.018, C - Y - 0.08, 0, (C + Y + 0.08) / 2, 0, { seg: 8 });
        b.box(M.steelBlack, 0.2, 0.02, 0.2, 0, Y + 0.07, 0);
        b.rbox(M.plasticWhite, 0.34, 0.11, 0.28, 0.02, 0, Y, 0);
        for (let i = 0; i < 6; i++) b.box(M.dark, 0.002, 0.06, 0.012, 0.171, Y, -0.08 + i * 0.022);
        b.cyl(M.plasticBlack, 0.04, 0.042, 0.03, -0.08, Y, 0.145, { seg: 14, rx: PI / 2 });
        b.box(M.plasticGray, 0.06, 0.004, 0.04, 0.09, Y + 0.056, 0.08);
      }));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), M.std('proj-lens', { color: 0x111418, roughness: 0.05, metalness: 0.5, emissive: 0xfff4dd, emissiveIntensity: 0 }));
      lens.position.set(-0.08, Y, 0.161); obj.add(lens);
      const lensOn = M.std('proj-lens-on', { color: 0x111418, roughness: 0.05, emissive: 0xfff4dd, emissiveIntensity: 3 }), lensOff = lens.material;
      const beamG = new THREE.CylinderGeometry(throwD / 1.5 * 0.62, 0.03, throwD, 16, 1, true); beamG.translate(0, throwD / 2, 0);
      const beam = new THREE.Mesh(beamG, mbBeam());
      beam.rotation.x = PI / 2 + tilt; beam.position.set(-0.08, Y, 0.16); beam.userData.noBake = true; obj.add(beam);
      const iw = throwD / 1.5, ih = iw * 0.625;
      const img = new THREE.Mesh(quadGeo(iw, ih), new THREE.MeshBasicMaterial({ map: tex.screen('slide'), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, color: 0xdddddd }));
      img.position.set(-0.08, Y - Math.sin(tilt) * throwD, 0.16 + Math.cos(tilt) * throwD); img.rotation.y = PI; img.userData.noBake = true; obj.add(img);
      let onState = !!p.on;
      const apply = () => { beam.visible = img.visible = onState; lens.material = onState ? lensOn : lensOff; };
      apply();
      obj.userData.setOn = v => { onState = !!v; apply(); };
      on(obj, p, {
        at: [0, Y, 0], radius: 1.8, label: () => (onState ? 'Turn off the projector' : 'Turn on the projector'),
        action(ctx) { onState = !onState; apply(); play(ctx, onState ? 'whirr' : 'click', onState ? [1.2] : [], onState ? '*whirrr*' : '*click*'); },
      });
    },
  };
  function mbBeam() { return K.mats.get('proj-beam-mb') || (K.mats.set('proj-beam-mb', new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })), K.mats.get('proj-beam-mb')); }

  // ================================================================ wall clock
  B.wall_clock = {
    anchor: 'wall', desc: 'classroom clock, 0.32 m dia, centre at 2.3 m; hands follow ctx.time()',
    build(obj, p) {
      const Y = p.y ?? 2.3, R = p.r ?? 0.16;
      add(obj, parts(`clock|${Y}|${R}`, b => {
        b.cyl(M.plasticBlack, R + 0.006, R + 0.012, 0.045, 0, Y, 0.0225, { seg: 24, rx: PI / 2 });
        b.torus(M.plasticBlack, R - 0.002, 0.008, 0, Y, 0.045, { rs: 5, ts: 24 });
      }));
      const face = new THREE.Mesh(new THREE.CircleGeometry(R - 0.008, 24), M.screen(tex.clockFace(), tex.clockFace(), 0.14, 0xfff8e6, { roughness: 0.4 }));
      face.position.set(0, Y, 0.042); obj.add(face);
      const hands = {};
      for (const [k, len, w, c, z] of [['h', R * 0.55, 0.012, 0x111111, 0.044], ['m', R * 0.82, 0.008, 0x111111, 0.046], ['s', R * 0.88, 0.003, 0xb01818, 0.048]]) {
        const pv = pivot(obj, 0, Y, z);
        add(pv, parts(`clockhand|${k}|${R}`, b => { b.box(M.plastic(c, 0.4), w, len, 0.002, 0, len / 2 - len * 0.15, 0); if (k === 's') b.cyl(M.plastic(c), 0.008, 0.008, 0.004, 0, 0, 0.001, { seg: 8, rx: PI / 2 }); }), { cast: false });
        hands[k] = pv;
      }
      const glass = new THREE.Mesh(new THREE.CircleGeometry(R - 0.004, 24), M.glass); glass.position.set(0, Y, 0.05); glass.userData.noBake = true; obj.add(glass);
      const nowHM = ctx => {
        let h, m, s;
        const t = ctx && typeof ctx.time === 'function' ? ctx.time() : null;
        if (t && typeof t.hour === 'number') { h = t.hour; m = t.minute ?? 0; s = (m % 1) * 60; if (!(m % 1)) s = new Date().getSeconds() + new Date().getMilliseconds() / 1000; m = Math.floor(m) + s / 60; }
        else { const d = new Date(); h = d.getHours(); s = d.getSeconds() + d.getMilliseconds() / 1000; m = d.getMinutes() + s / 60; }
        return { h, m, s };
      };
      const set = ctx => { const { h, m, s } = nowHM(ctx); hands.h.rotation.z = -((h % 12) + m / 60) / 12 * 2 * PI; hands.m.rotation.z = -m / 60 * 2 * PI; hands.s.rotation.z = -Math.floor(s) / 60 * 2 * PI; };
      set(null);
      live(obj, (dt, ctx) => set(ctx));
      on(obj, p, {
        at: [0, Y - 0.6, 0.6], radius: 2.2, label: 'Check the time',
        action(ctx) { const { h, m } = nowHM(ctx); const hh = ((Math.floor(h) + 11) % 12) + 1; say(ctx, `It's ${hh}:${String(Math.floor(m)).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}.`); },
      });
    },
  };

  // ================================================================ US flag
  function flagGeo(fn, nu = 12, nv = 6) { // fn(u, v) -> [x, y, z]; u along the fly, v down the hoist
    const g = new THREE.PlaneGeometry(1, 1, nu, nv), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const u = uv.getX(i), v = 1 - uv.getY(i); const q = fn(u, v); pos.setXYZ(i, q[0], q[1], q[2]); }
    g.computeVertexNormals(); return g;
  }
  B.flag_us = {
    anchor: 'wall', desc: "US flag. params.mount: 'wall' (classroom bracket at 2.0 m, default), 'stand' (floor stand), 'pole' (outdoor flagpole, height 9 m, waves)",
    build(obj, p) {
      const mount = p.mount ?? 'wall';
      const cloth = M.std('flagcloth', { map: tex.flag(), roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
      if (mount === 'pole') {
        const H = p.height ?? 9, fw = p.flagW ?? 1.83, fh = fw * 0.526;
        add(obj, parts(`flagpole|${H}`, b => {
          b.cyl(M.concrete, 0.35, 0.4, 0.15, 0, 0.075, 0, { seg: 16 });
          b.cyl(M.alu, 0.045, 0.075, H, 0, H / 2 + 0.1, 0, { seg: 12 });
          b.sphere(M.gold, 0.08, 0, H + 0.18, 0, { ws: 12, hs: 8 });
          b.box(M.alu, 0.03, 0.15, 0.06, 0.08, 1.4, 0);
          b.rod(M.std('rope', { color: 0xdddddd, roughness: 1 }), 0.004, [0.09, 1.4, 0], [0.06, H + 0.05, 0], { seg: 3 });
        }));
        const top = H + 0.02;
        const g = flagGeo((u, v) => [0.06 + u * fw, top - v * fh, 0]);
        const flag = new THREE.Mesh(g, cloth); flag.castShadow = true; flag.userData.noBake = false; obj.add(flag);
        const pos = g.attributes.position, uv = g.attributes.uv;
        let t = Math.random() * 10;
        const wave = dt => {
          t += dt;
          for (let i = 0; i < pos.count; i++) {
            const u = uv.getX(i), v = 1 - uv.getY(i);
            const z = Math.sin(u * 7 - t * 4.2 + v * 0.8) * 0.16 * u + Math.sin(u * 13 - t * 7) * 0.03 * u;
            pos.setXYZ(i, 0.06 + u * fw * (1 - 0.06 * Math.abs(Math.sin(t + u))), top - v * fh - u * u * 0.12, z);
          }
          pos.needsUpdate = true; g.computeVertexNormals();
        };
        wave(0); live(obj, wave);
        return;
      }
      if (mount === 'stand') {
        add(obj, parts('flagstand', b => {
          b.lathe(M.gold, [[0, 0], [0.2, 0], [0.2, 0.03], [0.12, 0.08], [0.04, 0.12], [0.03, 0.18], [0, 0.18]], 0, 0, 0, { seg: 14 });
          b.cyl(M.woodDark, 0.016, 0.016, 2.3, 0, 1.3, 0, { seg: 8 });
          b.sphere(M.gold, 0.035, 0, 2.48, 0, { ws: 8, hs: 6 });
          b.cyl(M.gold, 0.004, 0.035, 0.12, 0, 2.56, 0, { seg: 6 });
        }));
        const g = flagGeo((u, v) => [0.02 + Math.sin(u * PI * 0.5) * 0.42 + Math.sin(v * 3) * 0.02, 2.38 - v * 0.9 - u * 0.95, Math.sin(u * 11) * 0.05 * u + 0.02]);
        const flag = new THREE.Mesh(g, cloth); flag.castShadow = true; flag.scale.set(1, 1, 1); obj.add(flag);
        return;
      }
      // wall bracket, pole at 45 degrees out from the wall
      const Y = p.y ?? 2.0, L = 1.2, dir = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
      add(obj, parts(`flagwall|${Y}`, b => {
        b.box(M.gold, 0.05, 0.09, 0.01, 0, Y, 0.005);
        b.rod(M.gold, 0.016, [0, Y, 0.01], [0, Y + 0.05, 0.06]);
        b.rod(M.woodDark, 0.012, [0, Y + 0.03, 0.04], [0, Y + 0.03 + dir.y * L, 0.04 + dir.z * L], { seg: 8 });
        b.sphere(M.gold, 0.03, 0, Y + 0.05 + dir.y * L, 0.06 + dir.z * L, { ws: 8, hs: 6 });
      }));
      const fh = 0.6, fw = 0.91;
      const g = flagGeo((u, v) => {
        const s = L - 0.08 - v * fh, base = [0, Y + 0.03 + dir.y * s, 0.04 + dir.z * s];
        const drop = Math.pow(u, 1.4) * 0.55;
        return [base[0] + u * fw * 0.78, base[1] - drop - u * 0.05, base[2] + Math.sin(u * 9 + v * 2) * 0.025 * u - u * 0.08];
      });
      const flag = new THREE.Mesh(g, cloth); flag.castShadow = true; obj.add(flag);
    },
  };

  // ================================================================ bookshelf
  const bookTex = () => tex.make('bookspine', 64, 256, (g, w, h) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 14, w, 6); g.fillRect(0, h - 22, w, 8);
    g.fillStyle = '#ffffff'; g.fillRect(8, 40, w - 16, 3); for (let i = 0; i < 5; i++) g.fillRect(14, 60 + i * 14, w - 28, 6);
    g.fillStyle = '#c8c8c8'; g.fillRect(10, h - 60, w - 20, 20);
  });
  const bookTitles = ['"Algebra II (2004 Edition)". Someone wrote HELP in the margins.', '"The Great Gatsby", 14 copies, all unread.', '"Chemistry: Matter and Change". The periodic table is doodled on.',
    '"To Kill a Mockingbird". A note inside says "spoilers: it\'s sad".', '"World History Vol. 2". Volume 1 has been missing since 1998.', '"SAT Prep 2011". Still optimistic.', '"Of Mice and Men". Dog-eared at every sad part.'];
  B.bookshelf = {
    anchor: 'wall', desc: 'laminate bookcase 0.91 x 0.3 x 1.83 with random books (params.w, h, seed, fill)',
    build(obj, p) {
      const W = p.w ?? 0.91, H = p.h ?? 1.83, D = 0.3, seed = seedOf(p), fill = p.fill ?? 0.85;
      const books = M.std('books', { vertexColors: true, map: bookTex(), roughness: 0.75, metalness: 0 });
      const wood = p.wood === 'dark' ? M.woodDark : M.woodMed;
      add(obj, parts(`shelf|${W}|${H}|${seed}|${fill}|${p.wood}`, b => {
        const t = 0.019, R = tex.rng(seed * 131 + 7);
        b.box(wood, t, H, D, -W / 2 + t / 2, H / 2, D / 2); b.box(wood, t, H, D, W / 2 - t / 2, H / 2, D / 2);
        b.box(wood, W, t, D, 0, H - t / 2, D / 2); b.box(M.woodDark, W - 2 * t, 0.075, 0.015, 0, 0.0375, D - 0.01);
        b.box(M.std('shelfback', { color: 0x5d4632, roughness: 0.8 }), W - 2 * t, H - t, 0.006, 0, (H - t) / 2, 0.006);
        const n = Math.max(3, Math.round((H - 0.1) / 0.34)), gap = (H - 0.075 - t) / n;
        const pal = [0x8b1e1e, 0x1d3f6e, 0x1f5e3a, 0xd9c27a, 0x5a2a6e, 0x222222, 0xc46a1c, 0x2e7d9a, 0xe8e2d0, 0x7a1d3f, 0x3b4a2a, 0x9a9a9a];
        for (let s = 0; s < n; s++) {
          const y0 = 0.075 + s * gap;
          b.box(wood, W - 2 * t, t, D - 0.01, 0, y0 + t / 2, D / 2);
          if (s === n) continue;
          let x = -W / 2 + t + 0.005; const end = W / 2 - t - 0.005;
          while (x < end - 0.03) {
            if (R() > fill) { x += 0.04 + R() * 0.1; continue; }
            const bt = 0.018 + R() * 0.045, bh = Math.min(gap - 0.03, 0.17 + R() * 0.12), bd = 0.15 + R() * 0.08;
            if (x + bt > end) break;
            const lean = x + bt + 0.05 < end && R() < 0.06 ? 0.25 : 0;
            b.box(books, bt, bh, bd, x + bt / 2 + lean * bh * 0.5, y0 + t + bh / 2 - lean * 0.01, D - bd / 2 - 0.02, { rz: -lean, color: pal[(R() * pal.length) | 0] });
            x += bt + 0.001 + lean * bh;
            if (lean) x += 0.04;
          }
        }
      }));
      on(obj, p, { at: [0, 1.0, 0.6], radius: 1.2, label: 'Browse the books', action(ctx) { play(ctx, 'page', [1], '*flip flip*'); say(ctx, 'You find ' + pick(bookTitles)); } });
    },
  };

  // ================================================================ lockers
  const lockerFinds = ['Gym clothes. The smell is a weapon.', 'A calculus textbook, never opened.', "Somebody's science fair volcano.", 'A love note. Not for you.',
    'Half a sandwich of unknown age.', '47 loose pencils and a single shoe.', 'A stack of overdue library books.', 'A trumpet case. No trumpet.',
    'A moldy orange. Science, probably.', 'Nothing but a sticker that says NOPE.', 'A deflated basketball and a dream.', 'Forty-two hair ties.', 'A mirror covered in stickers.'];
  B.locker_bank = {
    anchor: 'wall', desc: 'steel lockers 0.3 x 0.3 x 1.83 each (params.count = 6, tiers 1|2, color, start = locker number); every door opens',
    build(obj, p) {
      const n = Math.max(1, p.count ?? 6), tiers = p.tiers === 2 ? 2 : 1, lw = p.w ?? 0.3, ld = p.depth ?? 0.3, H = p.h ?? 1.83, base = 0.1;
      const color = p.color ?? 0x2f5d9e, seed = seedOf(p), W = n * lw, R = tex.rng(seed * 977 + n);
      const paint = M.paint(color, 0.42, 0.35), inner = M.paint(new THREE.Color(color).multiplyScalar(0.45), 0.7, 0.2);
      const doorMat = M.std(`lockerdoor|${hexOf(color)}`, { map: tex.lockerDoor(), color, roughness: 0.42, metalness: 0.35, envMap: M.envMap, envMapIntensity: 0.45 });
      const digitsMat = M.std('lockerdigits', { map: tex.digits(), roughness: 0.4, metalness: 0.3 });
      const bodyH = H - base, cellH = (bodyH - 0.024) / tiers;
      add(obj, parts(`lockers|${n}|${tiers}|${lw}|${ld}|${H}|${hexOf(color)}|${seed}`, b => {
        const t = 0.012;
        b.box(M.castIron, W, base, ld - 0.04, 0, base / 2, (ld - 0.04) / 2);
        b.box(inner, W, bodyH, 0.008, 0, base + bodyH / 2, 0.004);
        b.box(paint, W + 0.004, t, ld, 0, H - t / 2, ld / 2); b.box(inner, W, t, ld - 0.02, 0, base + t / 2, ld / 2);
        for (let i = 0; i <= n; i++) {
          const x = -W / 2 + i * lw;
          b.box(i === 0 || i === n ? paint : inner, t, bodyH, ld, x + (i === 0 ? t / 2 : i === n ? -t / 2 : 0), base + bodyH / 2, ld / 2);
          b.box(paint, 0.026, bodyH, 0.012, x + (i === 0 ? 0.013 : i === n ? -0.013 : 0), base + bodyH / 2, ld - 0.006);
        }
        b.box(paint, W, 0.024, 0.012, 0, H - 0.012, ld - 0.006); b.box(paint, W, 0.024, 0.012, 0, base + 0.012, ld - 0.006);
        if (tiers === 2) { b.box(inner, W, t, ld - 0.02, 0, base + 0.012 + cellH, ld / 2); b.box(paint, W, 0.024, 0.012, 0, base + 0.012 + cellH, ld - 0.006); }
        for (let i = 0; i < n; i++) { // interiors: shelf, hook, random stuff
          const cx = -W / 2 + lw * (i + 0.5);
          for (let tt = 0; tt < tiers; tt++) {
            const y0 = base + 0.012 + tt * cellH;
            if (tiers === 1) b.box(inner, lw - 0.02, 0.008, ld - 0.03, cx, H - 0.32, ld / 2);
            b.rod(M.chrome, 0.004, [cx, y0 + cellH - 0.4, 0.01], [cx, y0 + cellH - 0.37, 0.06], { seg: 4 });
            const r = R();
            if (r < 0.3) b.boxB(M.vcolor, lw * 0.7, 0.36, 0.14, cx, y0 + 0.005, ld * 0.45, { ry: (R() - 0.5) * 0.3, color: [0x2b3a55, 0x7a1d1d, 0x1f4f2a, 0x333333, 0xc46a1c][(R() * 5) | 0] });
            else if (r < 0.5) for (let k = 0; k < 3; k++) b.boxB(M.vcolor, 0.2, 0.03, 0.24, cx + (R() - 0.5) * 0.03, y0 + 0.005 + k * 0.03, ld * 0.5, { ry: (R() - 0.5) * 0.4, color: [0x8b1e1e, 0x1d3f6e, 0xd9c27a, 0x1f5e3a][(R() * 4) | 0] });
            else if (r < 0.62 && tiers === 1) b.box(M.vcolor, lw * 0.6, 0.55, 0.06, cx, H - 0.72, 0.06, { color: [0x1d1d22, 0x6b6f76, 0x7a1d1d][(R() * 3) | 0] });
          }
        }
      }));
      const start = p.start ?? (100 + ((R() * 800) | 0));
      const dw = lw - 0.026, dh = cellH - 0.012;
      const doorParts = parts(`lockerdoor|${dw}|${dh}|${hexOf(color)}`, b => {
        b.box(doorMat, dw, dh, 0.01, dw / 2, dh / 2, 0.005);
        b.box(M.chrome, 0.02, 0.07, 0.016, dw - 0.03, dh * 0.5, 0.012);
        b.box(M.dark, 0.012, 0.05, 0.004, dw - 0.03, dh * 0.5, 0.0205);
      });
      const lockParts = parts('padlock', b => {
        b.rbox(M.brass ||= M.std('brass', { color: 0xc9a43a, roughness: 0.3, metalness: 1, envMap: M.envMap }), 0.035, 0.04, 0.014, 0.004, 0, -0.02, 0);
        b.torus(M.chrome, 0.011, 0.0028, 0, 0.002, 0, { arc: PI, rs: 4, ts: 8 });
      });
      const doors = [];
      for (let i = 0; i < n; i++) for (let tt = 0; tt < tiers; tt++) {
        const num = start + i * tiers + (tiers - 1 - tt);
        const hx = -W / 2 + lw * i + 0.013, y0 = base + 0.012 + tt * cellH + 0.006;
        const pv = pivot(obj, hx, y0, ld + 0.001, 'door');
        add(pv, doorParts);
        add(pv, parts(`lockernum|${num}|${dw}|${dh}`, b => {
          const s = String(num), cw = 0.012, x0 = dw / 2 - (s.length * cw) / 2 + cw / 2;
          b.box(M.brushed, s.length * cw + 0.01, 0.024, 0.002, dw / 2, dh - 0.07, 0.011);
          [...s].forEach((c, k) => b.quad(digitsMat, cw, 0.018, x0 + k * cw, dh - 0.07, 0.0122, [+c / 10, 0, (+c + 1) / 10, 1]));
        }), { cast: false });
        const locked = R() < (p.lockedChance ?? 0.15);
        if (locked) { const lk = pivot(pv, dw - 0.03, dh * 0.5 - 0.01, 0.026); add(lk, lockParts, { cast: false }); }
        doors.push({ pv, open: false, found: false, locked, num, tt, i });
      }
      const swing = (d, open, ctx) => {
        d.open = open; const a0 = d.pv.rotation.y, a1 = open ? -1.9 : 0;
        tween(open ? 0.5 : 0.35, k => { d.pv.rotation.y = a0 + (a1 - a0) * k; }, () => { if (!open) play(ctx, 'clank', [0.9], '*CLANG*'); }, open ? ease.out : ease.in);
        if (open) play(ctx, 'creak', [0.6]);
      };
      const rattle = (d, ctx) => { play(ctx, 'clank', [0.5], '*rattle rattle*'); tween(0.3, (k, raw) => { d.pv.rotation.y = -Math.sin(raw * PI * 6) * 0.02 * (1 - raw); }, null, ease.linear); };
      const find = (d, ctx) => {
        if (d.found) return; d.found = true;
        const r = Math.random();
        if (r < 0.22) { const m = 1 + ((Math.random() * 5) | 0); wallet.add(ctx, m); play(ctx, 'coin'); say(ctx, `Locker ${d.num}: found $${m} in an old hoodie pocket.`, 'green'); }
        else if (r < 0.3) { heal(ctx, 5); say(ctx, `Locker ${d.num}: a granola bar. (+5 health)`, 'green'); }
        else say(ctx, `Locker ${d.num}: ${pick(lockerFinds)}`);
      };
      for (let i = 0; i < n; i++) {
        const col = doors.filter(d => d.i === i).sort((a, b) => b.tt - a.tt); // top first
        const cx = -W / 2 + lw * (i + 0.5);
        on(obj, p, {
          at: [cx, 1.1, ld + 0.35], radius: Math.max(0.5, lw * 1.7),
          label: () => {
            const nx = col.find(d => !d.open && !d.locked);
            if (nx) return tiers === 2 ? `Open ${nx.tt ? 'top' : 'bottom'} locker` : `Open locker ${nx.num}`;
            if (col.some(d => d.open)) return tiers === 2 ? 'Close the lockers' : 'Close locker';
            return `Locker ${col[0].num} is padlocked`;
          },
          action(ctx) {
            const nx = col.find(d => !d.open && !d.locked);
            if (nx) { swing(nx, true, ctx); find(nx, ctx); return; }
            if (col.some(d => d.open)) { col.forEach(d => d.open && swing(d, false, ctx)); return; }
            rattle(col[0], ctx); say(ctx, 'Padlocked. Somebody is hiding something.');
          },
        });
      }
      obj.userData.doors = doors;
    },
  };

  // ================================================================ poster
  B.poster = {
    anchor: 'wall', desc: 'paper poster 0.46 x 0.61 taped to the wall, centre at 1.55 m (params.text, sub, style motivational|event|safety|periodic|map, color, landscape)',
    build(obj, p) {
      const land = !!p.landscape || p.style === 'map', w = p.w ?? (land ? 0.61 : 0.46), h = p.h ?? (land ? 0.46 : 0.61), Y = p.y ?? 1.55;
      const t = tex.poster({ text: p.text ?? 'BELIEVE', sub: p.sub ?? 'The only limit is the one you set yourself.', style: p.style ?? 'motivational', color: p.color ?? '#1b4f8f', seed: p.seed ?? 0, landscape: land });
      const g = new THREE.PlaneGeometry(w, h, 4, 4), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / (w / 2), y = pos.getY(i) / (h / 2); pos.setZ(i, Math.max(0, -y) ** 3 * Math.abs(x) ** 2 * 0.012 + 0.002); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, texMat(t, { roughness: 0.7 })); m.position.set(0, Y, 0); m.receiveShadow = true; obj.add(m);
      add(obj, parts(`postertape|${w}|${h}|${Y}`, b => {
        const tape = M.std('tape', { color: 0xf1ead2, roughness: 0.35, transparent: true, opacity: 0.75 });
        for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.box(tape, 0.06, 0.022, 0.001, sx * (w / 2 - 0.01), Y + sy * (h / 2 - 0.01), 0.004, { rz: sx * sy * 0.7 });
      }), { cast: false });
      if (p.text) on(obj, p, { at: [0, Y - 0.4, 0.5], radius: 1.1, label: 'Read the poster', action(ctx) { say(ctx, `"${p.text}"${p.sub ? ' · ' + p.sub : ''}`); } });
    },
  };

  // ================================================================ trophy case
  const trophyLines = ['2nd place, regional robotics. Respect.', 'A participation trophy for the 1997 debate team.', "Varsity girls' volleyball, league champs. Again.",
    'A bowling trophy. Nobody remembers why.', 'Academic decathlon, 3rd place. The plaque is crooked.', 'A signed football from a game nobody won.'];
  B.trophy_case = {
    anchor: 'floor', desc: 'wood + glass trophy case 1.8 x 0.45 x 2.0 with lit shelves and random trophies (params.title, w, seed)',
    build(obj, p) {
      const W = p.w ?? 1.8, D = 0.45, seed = seedOf(p);
      const titleTex = tex.label(p.title ?? 'HALL OF CHAMPIONS', '#1d2b4f', '#e0b44a', 1024, 96);
      add(obj, parts(`trophy|${W}|${seed}`, b => {
        const wd = M.woodDark, R = tex.rng(seed * 313 + 5), felt = M.std('felt-blue', { color: 0x1d2b4f, roughness: 1 });
        b.box(wd, W, 0.85, D, 0, 0.425, 0); b.box(M.dark, W - 0.04, 0.08, D - 0.06, 0, 0.04, 0.01);
        for (const sx of [-1, 1]) { b.box(wd, W / 2 - 0.04, 0.6, 0.012, sx * W / 4, 0.48, D / 2 + 0.006); b.box(M.gold, 0.02, 0.02, 0.02, sx * 0.05, 0.6, D / 2 + 0.02); }
        b.box(wd, W + 0.04, 0.08, D + 0.04, 0, 1.99, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(wd, 0.04, 1.1, 0.04, sx * (W / 2 - 0.02), 1.4, sz * (D / 2 - 0.02));
        b.box(felt, W - 0.08, 1.1, 0.01, 0, 1.4, -D / 2 + 0.03);
        b.box(M.glow(0xfff1d6, 2.2), W - 0.12, 0.012, 0.03, 0, 1.94, 0.1);
        for (const y of [1.25, 1.6]) b.box(M.glass, W - 0.08, 0.008, D - 0.06, 0, y, 0);
        b.box(M.glass, W - 0.06, 1.1, 0.006, 0, 1.4, D / 2 - 0.01); b.box(M.glass, 0.006, 1.1, D - 0.06, -W / 2 + 0.03, 1.4, 0); b.box(M.glass, 0.006, 1.1, D - 0.06, W / 2 - 0.03, 1.4, 0);
        for (const y0 of [0.855, 1.255, 1.605]) {
          let x = -W / 2 + 0.14;
          while (x < W / 2 - 0.14) {
            const r = R(), z = (R() - 0.5) * 0.12, metal = [M.gold, M.gold, M.silver, M.bronze][(R() * 4) | 0];
            if (r < 0.4) { // cup
              const s = 0.8 + R() * 0.7;
              b.box(M.woodDark, 0.09 * s, 0.04 * s, 0.09 * s, x, y0 + 0.02 * s, z);
              b.lathe(metal, [[0, 0], [0.035, 0], [0.035, 0.012], [0.01, 0.025], [0.008, 0.06], [0.028, 0.075], [0.048, 0.12], [0.052, 0.16], [0.048, 0.16]].map(q => [q[0] * s, q[1] * s]), x, y0 + 0.04 * s, z, { seg: 8 });
              for (const sx of [-1, 1]) b.torus(metal, 0.025 * s, 0.004 * s, x + sx * 0.05 * s, y0 + 0.16 * s, z, { arc: PI, rs: 3, ts: 6, rz: sx > 0 ? -PI / 2 : PI / 2 });
              x += 0.16 * s + 0.05;
            } else if (r < 0.75) { // column + figure
              const s = 0.8 + R() * 0.8;
              b.box(M.std('marble', { color: 0xeeeeea, roughness: 0.3 }), 0.08, 0.03, 0.08, x, y0 + 0.015, z);
              b.box(metal, 0.04, 0.12 * s, 0.04, x, y0 + 0.03 + 0.06 * s, z);
              b.sphere(metal, 0.022, x, y0 + 0.03 + 0.12 * s + 0.07, z, { ws: 6, hs: 4 });
              b.box(metal, 0.03, 0.05, 0.02, x, y0 + 0.03 + 0.12 * s + 0.03, z, { rz: 0.3 });
              x += 0.13;
            } else if (r < 0.9) { // plaque leaning on the back
              b.box(M.woodDark, 0.2, 0.26, 0.015, x + 0.04, y0 + 0.13, -D / 2 + 0.06, { rx: -0.12 });
              b.box(metal, 0.15, 0.1, 0.003, x + 0.04, y0 + 0.15, -D / 2 + 0.066, { rx: -0.12 });
              x += 0.26;
            } else { // ball on a stand
              b.cyl(metal, 0.03, 0.035, 0.03, x, y0 + 0.015, z, { seg: 8 });
              b.sphere(M.plastic([0xc8571b, 0xf4f4f0, 0x8b4a1e][(R() * 3) | 0], 0.6), 0.11, x, y0 + 0.14, z, { ws: 12, hs: 8 });
              x += 0.26;
            }
          }
        }
      }));
      quad(obj, W - 0.2, 0.09, texMat(titleTex, { emissive: 0x332200, roughness: 0.6 }), 0, 1.86, -D / 2 + 0.036);
      on(obj, p, { at: [0, 1.2, D / 2 + 0.5], radius: 1.5, label: 'Admire the trophies', action(ctx) { say(ctx, pick(trophyLines)); } });
    },
  };

  // ================================================================ PA speaker + call button
  const officeReplies = ["Office: \"Yes? ... Hello? Stop pressing that.\"", "Office: \"Is this an emergency? No? Bye.\"", "Office: \"The nurse is at lunch. Try ice.\"",
    "Office: \"If this is about the vending machine, we know.\"", "Office: *loud chewing* \"...Go back to class.\""];
  B.pa_speaker = {
    anchor: 'wall', desc: 'PA speaker box at 2.45 m with an intercom call button at 1.37 m; kit.announce(text) chimes all speakers',
    build(obj, p) {
      const Y = p.y ?? 2.45, BY = p.buttonY ?? 1.37, beige = M.plastic(0xe7e1d0, 0.5);
      add(obj, parts(`pa|${Y}|${BY}`, b => {
        b.rbox(beige, 0.31, 0.31, 0.1, 0.012, 0, Y, 0.05);
        b.box(M.stainless, 0.075, 0.12, 0.008, 0, BY, 0.004);
        b.cyl(M.plastic(0x222222), 0.014, 0.014, 0.012, 0, BY + 0.02, 0.012, { seg: 12, rx: PI / 2 });
        b.box(M.plastic(0x1d4e9a), 0.05, 0.015, 0.002, 0, BY - 0.03, 0.009);
      }));
      quad(obj, 0.26, 0.26, texMat(tex.grille('#e7e1d0'), { roughness: 0.6 }), 0, Y, 0.1015);
      const ledOff = M.plastic(0x330808, 0.3), ledOn = M.glow(0xff3020, 3);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), ledOff); led.position.set(0.025, BY + 0.045, 0.01); obj.add(led);
      let flashT = 0;
      const flash = () => { flashT = 3; };
      if (!K.state.baking) K.speakers.add({ obj, flash });
      live(obj, dt => { if (flashT > 0) { flashT -= dt; led.material = flashT > 0 && (flashT * 4 | 0) % 2 ? ledOn : ledOff; } });
      on(obj, p, {
        at: [0, BY, 0.4], radius: 1.0, label: 'Press the call button',
        action(ctx) { play(ctx, 'beep', [1200], '*bzzt*'); flash(); after(1.6, c => say(c, pick(officeReplies))); },
      });
    },
  };

  // ================================================================ exit sign
  B.exit_sign = {
    anchor: 'wall', desc: "illuminated EXIT sign (params.color 'red'|'green', arrow none|left|right|both, mount wall|ceiling, y = 2.3, ceiling = 3.0)",
    build(obj, p) {
      const color = p.color ?? 'red', arrow = p.arrow ?? 'none', glowC = color === 'green' ? 0x22ff77 : 0xff2a1a;
      const face = M.screen(tex.exit(color, arrow, false), tex.exit(color, arrow, true), 2.2, glowC, { roughness: 0.3 });
      const ceiling = p.mount === 'ceiling', C = p.ceiling ?? 3.0, Y = ceiling ? C - 0.32 : (p.y ?? 2.3), Z = ceiling ? 0 : 0.032;
      add(obj, parts(`exit|${ceiling}|${Y}|${C}`, b => {
        b.rbox(M.plasticWhite, 0.33, 0.21, 0.06, 0.012, 0, Y, Z);
        if (ceiling) { b.cyl(M.plasticWhite, 0.05, 0.05, 0.02, 0, C - 0.01, 0, { seg: 10 }); b.cyl(M.plasticWhite, 0.012, 0.012, C - Y - 0.1, 0, (C + Y + 0.1) / 2, 0, { seg: 6 }); }
        b.box(M.glow(0x30ff60, 2), 0.008, 0.008, 0.004, 0.13, Y - 0.09, Z + 0.031);
      }));
      quad(obj, 0.3, 0.188, face, 0, Y, Z + 0.0315);
      if (ceiling) quad(obj, 0.3, 0.188, face, 0, Y, Z - 0.0315, PI);
    },
  };

  // ================================================================ fire alarm (pull station + horn/strobe)
  const lensMat = M.std('strobe-lens', { color: 0xf4f6f8, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0, transparent: true, opacity: 0.9 });
  if (!K.state.strobeTicker) {
    K.state.strobeTicker = live(null, (dt, ctx, now) => {
      const on_ = K.state.alarm > 0, flash = on_ && (now % 1) < 0.09;
      lensMat.emissiveIntensity = flash ? 8 : 0;
      for (const s of K.strobes) s.sprite.visible = flash;
    });
  }
  B.fire_alarm = {
    anchor: 'wall', desc: 'fire alarm pull station at 1.2 m + horn/strobe at 2.2 m; pull: ctx.emit("fire_alarm", {pos}), all strobes flash',
    build(obj, p) {
      const Y = p.y ?? 1.2, SY = p.strobeY ?? 2.2, red = M.paint(0xc8161d, 0.32, 0.1);
      add(obj, parts(`firepull|${Y}|${SY}|${p.strobe !== false}`, b => {
        b.rbox(red, 0.1, 0.135, 0.055, 0.008, 0, Y, 0.0275);
        if (p.strobe !== false) {
          b.rbox(red, 0.13, 0.14, 0.06, 0.01, 0, SY, 0.03);
          b.box(lensMat, 0.05, 0.028, 0.03, 0, SY - 0.045, 0.07);
        }
      }));
      quad(obj, 0.096, 0.13, texMat(tex.fireAlarm(), { roughness: 0.35 }), 0, Y, 0.0556);
      if (p.strobe !== false) quad(obj, 0.12, 0.08, texMat(tex.horn(), { roughness: 0.35 }), 0, SY + 0.025, 0.0605);
      const handle = pivot(obj, 0, Y - 0.006, 0.055);
      add(handle, parts('firepull-handle', b => { b.box(M.paint(0xe9e9e4, 0.4, 0), 0.058, 0.03, 0.014, 0, 0.018, 0.009); b.box(red, 0.04, 0.006, 0.003, 0, 0.018, 0.0165); }), { cast: false });
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glowTex, color: 0xf2f6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sprite.scale.set(0.9, 0.9, 0.9); sprite.position.set(0, SY - 0.045, 0.1); sprite.visible = false; sprite.userData.noBake = true;
      if (p.strobe !== false) obj.add(sprite);
      const reset = () => { if (handle.rotation.x > 0.01) tween(0.4, k => { handle.rotation.x = 0.9 * (1 - k); }); };
      if (!K.state.baking) K.strobes.add({ obj, sprite, reset });
      on(obj, p, {
        at: [0, Y, 0.35], radius: 1.2, label: 'Pull the fire alarm', enabled: () => !(K.state.alarm > 0),
        action(ctx) {
          tween(0.25, k => { handle.rotation.x = 0.9 * k; }, null, ease.out);
          play(ctx, 'clank', [0.5]);
          K.kit.fireAlarm(true, p.duration ?? 30, ctx);
          K.emit(ctx, 'fire_alarm', { pos: K.worldPos(obj, 0, Y, 0.06), obj });
          K.crime(ctx, 'false_alarm');
          say(ctx, 'You pulled the fire alarm. Everybody out!', 'red');
        },
      });
    },
  };

  // ================================================================ fire extinguisher
  B.fire_extinguisher = {
    anchor: 'wall', desc: 'ABC dry-chemical extinguisher on a wall hook (top at ~1.1 m); spray: white cloud',
    build(obj, p) {
      const Y = p.y ?? 0.6, red = M.paint(0xc41a1a, 0.28, 0.2), z = 0.075;
      const label = tex.make('ext-label', 256, 128, (g, w, h) => {
        g.fillStyle = '#c41a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0'; g.fillRect(70, 8, 116, h - 16);
        g.fillStyle = '#111'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('FIRE', 128, 34); g.fillText('EXTINGUISHER', 128, 58);
        g.fillStyle = '#0b5'; g.fillRect(80, 70, 28, 28); g.fillStyle = '#c11'; g.fillRect(114, 70, 28, 28); g.fillStyle = '#16c'; g.beginPath(); g.arc(162, 84, 14, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 18px Arial'; g.fillText('A', 94, 91); g.fillText('B', 128, 91); g.fillText('C', 162, 91);
      });
      add(obj, parts(`ext|${Y}`, b => {
        b.box(M.steelBlack, 0.05, 0.12, 0.012, 0, Y + 0.45, 0.006); b.box(M.steelBlack, 0.06, 0.012, 0.05, 0, Y + 0.4, 0.03);
        b.lathe(red, [[0, 0], [0.055, 0], [0.065, 0.02], [0.065, 0.36], [0.055, 0.4], [0.025, 0.425], [0.018, 0.43], [0, 0.43]], 0, Y, z, { seg: 14 });
        b.cyl(M.chrome, 0.016, 0.018, 0.04, 0, Y + 0.45, z, { seg: 8 });
        b.box(M.plasticBlack, 0.025, 0.012, 0.12, 0, Y + 0.48, z + 0.02, { rx: 0.15 });
        b.box(M.plasticBlack, 0.022, 0.01, 0.11, 0, Y + 0.505, z + 0.015, { rx: -0.1 });
        b.cyl(M.chrome, 0.017, 0.017, 0.008, 0.026, Y + 0.455, z, { seg: 10, rz: PI / 2 });
        b.circle(M.plastic(0xf4f4f0), 0.014, 0.031, Y + 0.455, z, { ry: PI / 2 });
        b.box(M.plastic(0xf2c230), 0.003, 0.025, 0.025, -0.02, Y + 0.47, z + 0.03);
        b.tube(M.rubber, [[-0.02, Y + 0.45, z + 0.02], [-0.07, Y + 0.38, z + 0.02], [-0.075, Y + 0.2, z + 0.03], [-0.068, Y + 0.06, z + 0.03]], 0.008, { seg: 10, radial: 5 });
        b.cyl(M.plasticBlack, 0.01, 0.014, 0.05, -0.068, Y + 0.04, z + 0.03, { seg: 6 });
      }));
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.0662, 0.0662, 0.17, 12, 1, true, -0.95, 1.9), texMat(label, { roughness: 0.4 }));
      lb.position.set(0, Y + 0.2, z); obj.add(lb);
      let charge = p.charges ?? 6;
      on(obj, p, {
        at: [0, Y + 0.4, 0.45], radius: 1.1, label: () => (charge > 0 ? 'Spray the fire extinguisher' : 'Fire extinguisher (empty)'),
        action(ctx) {
          if (charge <= 0) { say(ctx, "It's empty. You emptied it."); play(ctx, 'click'); return; }
          charge--;
          play(ctx, 'hiss', [1.4], '*FWOOSHHH*');
          K.emitter(obj, { at: [-0.068, Y + 0.02, z + 0.08], dir: [0, 0.15, 1], dur: 1.4, rate: 26, life: 1.6, speed: 3.2, spread: 0.5, size: [0.12, 1.4], opacity: 0.85, gravity: -0.3, drag: 1.6 });
          if (charge === 0) after(1.6, c => say(c, 'The extinguisher sputters out.'));
        },
      });
    },
  };

  // ================================================================ light switch
  B.light_switch = {
    anchor: 'wall', desc: 'toggle light switch at 1.2 m; toggles params.lights (Lights: intensity, emissive Meshes: material, Object3D: visible, functions: fn(on))',
    build(obj, p) {
      const Y = p.y ?? 1.2, gang = Math.max(1, Math.min(3, p.gang ?? 1)), W = 0.07 + (gang - 1) * 0.046;
      add(obj, parts(`switch|${Y}|${gang}`, b => {
        b.rbox(M.plasticWhite, W, 0.115, 0.006, 0.002, 0, Y, 0.003);
        for (const sy of [-1, 1]) b.cyl(M.plasticWhite, 0.003, 0.003, 0.002, 0, Y + sy * 0.042, 0.0065, { seg: 6, rx: PI / 2 });
        for (let i = 0; i < gang; i++) b.box(M.plastic(0xdedbd2), 0.012, 0.026, 0.002, (i - (gang - 1) / 2) * 0.046, Y, 0.0065);
      }), { cast: false });
      const levers = [];
      for (let i = 0; i < gang; i++) {
        const pv = pivot(obj, (i - (gang - 1) / 2) * 0.046, Y, 0.0075);
        add(pv, parts('switch-lever', b => b.box(M.plasticWhite, 0.008, 0.009, 0.016, 0, 0, 0.008)), { cast: false });
        levers.push(pv);
      }
      let isOn = p.on !== false;
      const offMats = new WeakMap();
      const applyTo = (it, v) => {
        if (!it) return;
        if (typeof it === 'function') { it(v); return; }
        if (it.isLight) { if (it.userData.__kitI === undefined) it.userData.__kitI = it.intensity; it.intensity = v ? it.userData.__kitI : 0; return; }
        if (it.isMesh && it.material && it.material.emissive) {
          if (!it.userData.__kitOn) it.userData.__kitOn = it.material;
          let off = offMats.get(it.userData.__kitOn);
          if (!off) { off = it.userData.__kitOn.clone(); off.emissiveIntensity = 0; off.emissive = new THREE.Color(0); offMats.set(it.userData.__kitOn, off); }
          it.material = v ? it.userData.__kitOn : off; return;
        }
        if (it.isObject3D && (it.isLight || it.isMesh)) { it.visible = v; return; }
        if (it.isObject3D) { let any = false; it.traverse(c => { if (c !== it && (c.isLight || (c.isMesh && c.material && c.material.emissive))) { applyTo(c, v); any = true; } }); if (!any) it.visible = v; }
      };
      const set = (v, ctx) => {
        isOn = !!v;
        levers.forEach(l => { l.rotation.x = isOn ? -0.45 : 0.45; });
        const ls = typeof p.lights === 'function' ? p.lights() : (p.lights || []);
        (Array.isArray(ls) ? ls : [ls]).forEach(it => applyTo(it, isOn));
        if (p.onToggle) p.onToggle(isOn, ctx);
      };
      set(isOn);
      obj.userData.setOn = v => set(v);
      obj.userData.isOn = () => isOn;
      on(obj, p, {
        at: [0, Y, 0.35], radius: 1.0, label: () => (isOn ? 'Turn the lights off' : 'Turn the lights on'),
        action(ctx) { set(!isOn, ctx); play(ctx, 'click', [], '*click*'); K.emit(ctx, 'lights', { on: isOn, obj }); },
      });
    },
  };

  // ================================================================ water fountain (ADA hi-lo + bottle filler)
  B.water_fountain = {
    anchor: 'wall', desc: 'ADA hi-lo stainless drinking fountain (low spout 0.91 m, high 1.05 m) with bottle filler; drink: heal 5',
    build(obj, p) {
      const units = [[-0.24, 0.86, 0.47], [0.24, 1.0, 0.4]], filler = p.filler !== false;
      add(obj, parts(`fountain|${filler}`, b => {
        const S = M.stainless;
        for (const [x, rim, d] of units) {
          const w = 0.46, t = 0.04, h = 0.13;
          b.box(S, w, h - 0.05, d, x, rim - h / 2 - 0.025, d / 2);
          b.box(S, w, 0.05, t, x, rim - 0.025, d - t / 2); b.box(S, w, 0.05, t, x, rim - 0.025, t / 2 + 0.06);
          b.box(S, t, 0.05, d - 0.06, x - w / 2 + t / 2, rim - 0.025, d / 2 + 0.03); b.box(S, t, 0.05, d - 0.06, x + w / 2 - t / 2, rim - 0.025, d / 2 + 0.03);
          b.box(S, w, 0.05, 0.06, x, rim - 0.025, 0.03);
          b.box(M.brushed, w - 2 * t, 0.004, d - t - 0.1, x, rim - 0.048, (d - t + 0.1) / 2);
          b.cyl(M.dark, 0.018, 0.018, 0.002, x, rim - 0.045, d * 0.55, { seg: 10 });
          b.cyl(M.chrome, 0.012, 0.014, 0.03, x, rim - 0.035, 0.13, { seg: 8 });
          b.sphere(M.chrome, 0.016, x, rim - 0.018, 0.13, { ws: 8, hs: 5, tl: PI / 2 });
          b.box(M.chrome, 0.24, 0.022, 0.02, x, rim - 0.075, d + 0.008);
          b.box(S, 0.34, 0.36, 0.14, x, rim - 0.31, 0.07);
          b.box(M.dark, 0.2, 0.06, 0.003, x, rim - 0.4, 0.1405);
        }
        if (filler) {
          const x = 0.24, y0 = 1.2;
          b.rbox(S, 0.42, 0.62, 0.14, 0.012, x, y0 + 0.31, 0.07);
          b.box(M.dark, 0.3, 0.32, 0.004, x, y0 + 0.22, 0.1425);
          b.box(M.brushed, 0.28, 0.008, 0.05, x, y0 + 0.07, 0.165);
          b.cyl(M.chrome, 0.012, 0.012, 0.03, x, y0 + 0.35, 0.16, { seg: 8 }); b.box(M.stainless, 0.03, 0.012, 0.03, x, y0 + 0.37, 0.155);
          b.box(M.glow(0x30ff60, 2), 0.01, 0.01, 0.004, x + 0.17, y0 + 0.57, 0.141);
        }
      }));
      let lcd = null, count = 10000 + ((Math.random() * 30000) | 0);
      const drawLcd = () => lcd.redraw((g, w, h) => {
        g.fillStyle = '#06140a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4cff79'; g.textAlign = 'center';
        g.font = 'bold 13px Arial'; g.fillText('BOTTLES SAVED', w / 2, 20); g.font = 'bold 26px "Courier New", monospace'; g.fillText(count.toLocaleString('en-US').padStart(6, '0'), w / 2, 50);
      });
      if (filler) {
        lcd = tex.dynamic(128, 64, () => {}); drawLcd();
        quad(obj, 0.16, 0.08, M.std(`lcd|${lcd.uuid}`, { map: lcd, emissive: 0xffffff, emissiveMap: lcd, emissiveIntensity: 0.9, roughness: 0.3 }), 0.24, 1.69, 0.143);
        quad(obj, 0.28, 0.035, texMat(tex.label('FILTERED WATER', '#9aa0a6', '#1a1a1a', 512, 64), { roughness: 0.4, metalness: 0.4 }), 0.24, 1.6, 0.143);
      }
      const arcs = units.map(([x, rim, d]) => {
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, rim - 0.003, 0.135), new THREE.Vector3(x, rim + 0.12, 0.2), new THREE.Vector3(x, rim - 0.04, d * 0.62));
        const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0045, 5, false), M.water); m.visible = false; m.userData.noBake = true; obj.add(m); return m;
      });
      let busy = false;
      on(obj, p, {
        at: [0, 1.0, 0.75], radius: 1.3, label: 'Drink water',
        action(ctx) {
          if (busy) return; busy = true;
          arcs.forEach(a => { a.visible = true; });
          play(ctx, 'drink', [], '*gulp gulp*');
          heal(ctx, p.heal ?? 5); say(ctx, `Ahh, refreshing. (+${p.heal ?? 5} health)`, 'green', 2200);
          if (lcd) { count++; drawLcd(); }
          after(1.6, () => { arcs.forEach(a => { a.visible = false; }); busy = false; });
        },
      });
    },
  };

  // ================================================================ vending machine
  const snacks = ['a bag of Crunchos', 'Tater Bits (sour cream & regret)', 'a Choco Bomb bar', 'Peanut Pals', 'Gummi Wurms', 'a Pretzel Twist', 'Cheez Puffs', 'Cookie Stax', 'a pack of Sour Zaps'];
  const drinks = ['a Fizz Cola', 'Lemon-Lime Zing', 'a Blue Thunder sports drink', 'Sparkling water (why?)', 'Iced tea, extra sweet', 'Root beer'];
  const drinkFront = () => tex.make('drinkfront', 512, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d01c1c'); gr.addColorStop(1, '#5a0a0a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 0, 7); g.fill(); }
    g.save(); g.translate(w / 2, h * 0.47); g.rotate(-0.12);
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.moveTo(-60, 260); g.lineTo(60, 260); g.lineTo(60, -120); g.quadraticCurveTo(60, -180, 25, -210); g.lineTo(25, -280); g.lineTo(-25, -280); g.lineTo(-25, -210); g.quadraticCurveTo(-60, -180, -60, -120); g.closePath(); g.fill();
    g.fillStyle = '#d01c1c'; g.fillRect(-60, -40, 120, 120); g.fillStyle = '#fff'; g.font = 'bold 34px Georgia'; g.textAlign = 'center'; g.fillText('FIZZ', 0, 30); g.restore();
    g.fillStyle = '#fff'; g.font = 'bold italic 72px Georgia'; g.textAlign = 'center'; g.fillText('Ice Cold', w / 2, 110);
    g.font = 'bold 40px Arial'; g.fillText('DRINKS', w / 2, h - 60);
  });
  B.vending_machine = {
    anchor: 'floor', desc: "vending machine 0.9 x 0.8 x 1.83, lit product window (params.variant 'snack'|'drink', price = 1.5, heal = 15, color)",
    build(obj, p) {
      const W = 0.9, D = 0.8, H = 1.83, price = p.price ?? 1.5, drink = p.variant === 'drink', zf = D / 2;
      const priceS = price.toFixed(2), body = M.paint(p.color ?? (drink ? 0x8e1414 : 0x23262b), 0.4, 0.45);
      add(obj, parts(`vend|${hexOf(p.color ?? (drink ? 0x8e1414 : 0x23262b))}|${drink}`, b => {
        b.rbox(body, W, H - 0.04, D - 0.06, 0.012, 0, 0.04 + (H - 0.04) / 2, -0.03);
        b.box(M.dark, W - 0.04, 0.04, D - 0.1, 0, 0.02, -0.03);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.rubber, 0.025, 0.03, 0.04, sx * 0.4, 0.02, sz * 0.32, { seg: 8 });
        const fr = M.paint(0x15171a, 0.35, 0.5);
        if (!drink) {
          b.box(fr, W, 0.08, 0.06, 0, H - 0.04 - 0.04, zf - 0.03 - 0.01); // top rail (sign sits on it)
          b.box(fr, W, 0.45, 0.06, 0, 0.04 + 0.225, zf - 0.03 - 0.01); // bottom rail
          b.box(fr, 0.03, H - 0.62, 0.06, -W / 2 + 0.015, 0.49 + (H - 0.62) / 2, zf - 0.04);
          b.box(fr, 0.27, H - 0.62, 0.06, W / 2 - 0.135, 0.49 + (H - 0.62) / 2, zf - 0.04);
          for (const x of [-0.417, 0.177]) b.box(M.interior, 0.006, 1.22, 0.1, x, 1.1, zf - 0.11);
          b.box(M.interior, 0.6, 0.006, 0.1, -0.12, 0.49, zf - 0.11); b.box(M.interior, 0.6, 0.006, 0.1, -0.12, 1.71, zf - 0.11);
          for (let r = 1; r < 6; r++) b.box(M.alu, 0.6, 0.006, 0.05, -0.12, 0.49 + r * (1.22 / 6) + 0.005, zf - 0.08);
          b.box(M.glow(0xf2f7ff, 2.5), 0.56, 0.01, 0.02, -0.12, 1.7, zf - 0.07);
          b.box(M.dark, 0.58, 0.24, 0.004, -0.12, 0.27, zf - 0.007); // delivery bin opening
          b.box(M.dark, 0.06, 0.05, 0.02, 0.3, 0.6, zf - 0.005);
        } else {
          b.box(fr, W, H - 0.1, 0.05, 0, 0.06 + (H - 0.1) / 2, zf - 0.035);
          b.box(M.dark, 0.36, 0.18, 0.004, -0.12, 0.27, zf - 0.008);
          for (let i = 0; i < 6; i++) b.rbox(M.plastic(0xeeeeee, 0.3), 0.1, 0.06, 0.02, 0.006, 0.3, 1.45 - i * 0.1, zf + 0.0, {});
          b.box(M.dark, 0.06, 0.12, 0.012, 0.3, 0.75, zf - 0.005);
        }
      }));
      if (!drink) {
        const vt = tex.vending(p.seed ?? 0, priceS);
        quad(obj, 0.6, 1.22, M.screen(vt, vt, 0.5, 0xffffff, { roughness: 0.6 }), -0.12, 1.1, zf - 0.155);
        quad(obj, 0.6, 1.22, M.glass, -0.12, 1.1, zf - 0.012);
        quad(obj, 0.25, 0.98, M.screen(tex.vendPanel(priceS), tex.vendPanel(priceS), 0.18, 0xffffff, { roughness: 0.4 }), 0.3, 1.2, zf - 0.0095);
        const sign = tex.label(p.sign ?? 'SNACKS', '#c1121f', '#ffffff', 512, 64);
        quad(obj, 0.86, 0.075, M.screen(sign, sign, 0.9), 0, H - 0.08, zf - 0.0095);
      } else {
        const ft = drinkFront();
        quad(obj, 0.56, 1.5, M.screen(ft, ft, 0.75, 0xffffff, { roughness: 0.4 }), -0.12, 1.07, zf - 0.009);
        quad(obj, 0.12, 0.05, M.screen(tex.lcd('$' + priceS, '#ff4030', '#140404'), tex.lcd('$' + priceS, '#ff4030', '#140404'), 1), 0.3, 1.62, zf - 0.009);
      }
      const flap = pivot(obj, -0.12, drink ? 0.36 : 0.39, zf - 0.003);
      add(flap, parts(`vendflap|${drink}`, b => b.box(M.plasticGray, drink ? 0.34 : 0.58, drink ? 0.16 : 0.22, 0.006, 0, -(drink ? 0.08 : 0.11), 0)), { cast: false });
      const snackG = new THREE.BoxGeometry(drink ? 0.065 : 0.13, drink ? 0.12 : 0.17, drink ? 0.065 : 0.035);
      let busy = false;
      on(obj, p, {
        at: [0, 1.0, D / 2 + 0.45], radius: 1.4, label: `Buy ${drink ? 'a drink' : 'a snack'} (${K.fmt$(price)})`,
        action(ctx) {
          if (busy) return;
          if (!wallet.pay(ctx, price)) { play(ctx, 'beep', [400], '*bzzt*'); say(ctx, `You need ${K.fmt$(price)}. You have ${K.fmt$(Math.max(0, wallet.get(ctx)))}.`); return; }
          busy = true;
          play(ctx, 'coin'); play(ctx, 'beep', [1500]);
          const stuck = Math.random() < (p.stuckChance ?? 0.06), name = pick(drink ? drinks : snacks);
          const item = new THREE.Mesh(snackG, M.plastic(pick([0xe63946, 0xf4a261, 0x2a9d8f, 0x6a2c70, 0xffd166, 0x1d3557])));
          item.userData.noBake = true;
          const sx = -0.12 + (drink ? 0 : (Math.random() - 0.5) * 0.4), sy = drink ? 1.2 : 0.62 + ((Math.random() * 5) | 0) * 0.2;
          item.position.set(sx, sy, zf - 0.09); obj.add(item);
          if (drink) item.visible = false;
          after(0.15, () => play(ctx, 'whirr', [0.9], '*whirrr*'));
          tween(0.9, k => { item.position.z = zf - 0.09 + 0.03 * k; item.rotation.x = stuck ? 0.25 * k : 0; }, () => {
            if (stuck) {
              say(ctx, `${name[0].toUpperCase() + name.slice(1)} is stuck on the spiral. Classic.`);
              after(4, () => { obj.remove(item); busy = false; });
              return;
            }
            item.visible = true;
            tween(0.42, k => { item.position.y = sy + (0.28 - sy) * k; item.rotation.x = k * 1.3; }, c => {
              play(c, 'thunk', [], '*thunk*');
              tween(0.25, (k, r) => { flap.rotation.x = -Math.sin(r * PI) * 0.6; }, null, ease.linear);
              heal(c, p.heal ?? 15); say(c, `You got ${name}. (+${p.heal ?? 15} health)`, 'green');
              after(1.2, () => { obj.remove(item); busy = false; });
            }, ease.in);
          }, ease.linear);
        },
      });
    },
  };

  // ================================================================ trash can
  const trashFinds = ['Half a burrito. You put it back.', 'A crumpled detention slip.', 'A failed chemistry test. Yikes.', 'Banana peel. Classic.',
    'Thirty identical paper airplanes.', 'An empty energy drink can. Then another. Then another.', "Someone's retainer. Nope."];
  B.trash_can = {
    anchor: 'floor', desc: "trash can (params.style 'round' = grey 44 gal classroom can, 'street' = slatted steel with dome lid; color); search: rare $",
    build(obj, p) {
      const street = p.style === 'street', c = p.color ?? (street ? 0x2c3a2e : 0x6f7479);
      add(obj, parts(`trash|${street}|${hexOf(c)}`, b => {
        if (!street) {
          const pl = M.plastic(c, 0.6, THREE.DoubleSide), H = 0.69;
          b.lathe(pl, [[0, 0.01], [0.21, 0], [0.235, 0.02], [0.27, H - 0.03], [0.285, H - 0.01], [0.285, H], [0.27, H], [0.255, H - 0.02], [0.22, 0.04], [0, 0.04]], 0, 0, 0, { seg: 20 });
          for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.box(pl, 0.03, H - 0.12, 0.025, Math.sin(a) * 0.262, H / 2 + 0.01, Math.cos(a) * 0.262, { ry: a, rx: 0.045 * 0 }); }
          for (const a of [0, PI]) b.box(pl, 0.12, 0.03, 0.04, Math.sin(a) * 0.29, H - 0.04, Math.cos(a) * 0.29, { ry: a });
          b.torus(M.plastic(0x111111, 0.3), 0.278, 0.01, 0, H + 0.002, 0, { rx: PI / 2, rs: 4, ts: 20 });
          b.lathe(M.plastic(0x111111, 0.3, THREE.DoubleSide), [[0.29, H + 0.004], [0.284, H - 0.05], [0.276, H - 0.11]], 0, 0, 0, { seg: 20 });
          for (let i = 0; i < 5; i++) b.sphere(M.paper, 0.035 + i * 0.004, (i - 2) * 0.06, H - 0.16 + (i % 2) * 0.02, ((i * 7) % 5 - 2) * 0.04, { ws: 5, hs: 4, s: [1, 0.8, 1.1] });
        } else {
          const st = M.paint(c, 0.55, 0.5), H = 0.95, R = 0.29;
          b.cyl(st, R - 0.02, R - 0.02, 0.04, 0, 0.06, 0, { seg: 16 });
          for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; b.box(st, 0.075, H - 0.1, 0.012, Math.sin(a) * R, 0.05 + (H - 0.1) / 2, Math.cos(a) * R, { ry: a }); }
          for (const y of [0.18, H - 0.12]) b.torus(st, R + 0.008, 0.012, 0, y, 0, { rx: PI / 2, rs: 4, ts: 20 });
          b.sphere(st, R + 0.03, 0, H - 0.175, 0, { ws: 16, hs: 6, tl: PI / 2.6 });
          b.box(M.dark, 0.26, 0.11, 0.08, 0, H + 0.02, R - 0.02);
          for (const a of [0.3, 2.4, 4.4]) b.box(st, 0.04, 0.05, 0.04, Math.sin(a) * (R - 0.03), 0.025, Math.cos(a) * (R - 0.03));
          b.cyl(M.dark, R - 0.03, R - 0.03, 0.01, 0, H - 0.07, 0, { seg: 12 });
        }
      }));
      let searched = false, busy = false;
      on(obj, p, {
        at: [0, 0.7, 0], radius: 1.1, label: 'Search the trash',
        action(ctx) {
          if (busy) return; busy = true;
          play(ctx, 'page', [1.2], '*rustle rustle*');
          tween(0.6, (k, r) => { obj.children.forEach(ch => { ch.rotation.z = Math.sin(r * PI * 5) * 0.03 * (1 - r); }); }, () => { busy = false; }, ease.linear);
          if (searched) { say(ctx, 'Already picked clean.'); return; }
          searched = true;
          const r = Math.random();
          if (r < (p.cashChance ?? 0.12)) { const m = 1 + ((Math.random() * 3) | 0); wallet.add(ctx, m); play(ctx, 'coin'); say(ctx, `Found $${m}. Gross, but worth it.`, 'green'); }
          else say(ctx, pick(trashFinds));
        },
      });
    },
  };

  // ================================================================ cafeteria table
  B.cafeteria_table = {
    anchor: 'floor', desc: "cafeteria table (params.style 'bench' = 2.44 m table with attached benches, 'round' = 1.5 m with 8 stools; color, clutter)",
    build(obj, p) {
      const c = p.color ?? 0x2b5ea7, round = p.style === 'round', seed = seedOf(p);
      add(obj, parts(`caf|${round}|${hexOf(c)}|${p.clutter ? seed : 0}`, b => {
        const seat = M.plastic(c, 0.35), frame = M.chrome, top = M.laminateGray, R = tex.rng(seed * 59 + 3);
        if (!round) {
          const L = 2.44, D = 0.76, H = 0.74;
          b.rbox(top, L, 0.025, D, 0.006, 0, H - 0.0125, 0); b.box(M.plasticBlack, L + 0.004, 0.02, D + 0.004, 0, H - 0.0125, 0);
          for (const s of [-1, 1]) {
            b.rbox(seat, L - 0.1, 0.03, 0.3, 0.008, 0, 0.44, s * 0.62);
            for (const x of [-0.85, 0.85]) {
              b.rod(frame, 0.016, [x, 0.03, s * 0.0], [x, 0.03, s * 0.78]);
              b.rod(frame, 0.016, [x, 0.03, s * 0.62], [x, 0.425, s * 0.62]);
              b.rod(frame, 0.013, [x, 0.2, s * 0.05], [x, 0.425, s * 0.52]);
              b.cyl(M.rubber, 0.025, 0.025, 0.03, x, 0.015, s * 0.78, { seg: 8, rz: PI / 2 });
            }
          }
          for (const x of [-0.85, 0.85]) { b.rod(frame, 0.02, [x, 0.03, 0], [x, H - 0.03, 0]); b.rod(frame, 0.014, [x, H - 0.035, -0.32], [x, H - 0.035, 0.32]); }
          b.rod(frame, 0.016, [-0.85, 0.2, 0], [0.85, 0.2, 0]);
          if (p.clutter) {
            const n = (R() * 4) | 0;
            for (let i = 0; i < n; i++) {
              const x = (R() - 0.5) * 2, z = (R() < 0.5 ? -1 : 1) * 0.2, ry = (R() - 0.5) * 0.4;
              b.box(M.plastic([0x5a7d5a, 0xb08850, 0x8a8f96][(R() * 3) | 0]), 0.36, 0.012, 0.27, x, H + 0.006, z, { ry });
              for (let k = 0; k < 3; k++) b.sphere(M.plastic([0xf2c14e, 0x9b3d23, 0xe8e2c4, 0x5c8a3a][(R() * 4) | 0], 0.8), 0.03 + R() * 0.02, x + (R() - 0.5) * 0.2, H + 0.02, z + (R() - 0.5) * 0.12, { ws: 6, hs: 4, s: [1.3, 0.5, 1] });
              if (R() < 0.6) b.cyl(M.plastic(0xf4f4f0), 0.032, 0.026, 0.1, x + 0.22, H + 0.05, z, { seg: 8 });
            }
          }
        } else {
          const H = 0.74;
          b.cyl(top, 0.75, 0.75, 0.025, 0, H - 0.0125, 0, { seg: 28 }); b.cyl(M.plasticBlack, 0.752, 0.752, 0.02, 0, H - 0.0125, 0, { seg: 28, open: true });
          b.cyl(frame, 0.04, 0.04, H - 0.05, 0, (H - 0.05) / 2 + 0.03, 0, { seg: 10 });
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * PI * 2, sx = Math.sin(a), sz = Math.cos(a);
            b.rod(frame, 0.016, [0, 0.05, 0], [sx * 0.95, 0.05, sz * 0.95]);
            b.rod(frame, 0.016, [sx * 0.95, 0.05, sz * 0.95], [sx * 0.95, 0.43, sz * 0.95]);
            b.cyl(seat, 0.17, 0.17, 0.03, sx * 0.95, 0.445, sz * 0.95, { seg: 14 });
            if (i % 2 === 0) b.rod(frame, 0.014, [0, 0.4, 0], [sx * 0.95 * 0.25, H - 0.03, sz * 0.95 * 0.25]);
          }
        }
      }));
    },
  };
}
