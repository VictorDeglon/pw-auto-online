// Leaderboard billboards around town: big lit boards where everyone passes (Poway High, the dealer, the plaza)
// showing the all-time K/D leaderboard from the game server. Self-lit (MeshBasicMaterial), so they read at night.
//   const B = createBillboards({ THREE, scene, heightAt, spots: [{ x, z, nx, nz }] })  n: from the road toward the board
//   B.show(rows)   rows from the K/D leaderboard ({ rank, name, score, k, d, title }); null = "play online" message
const W = 1024, H = 512;

export function createBillboards({ THREE, scene, heightAt, spots }) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const back = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.8, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5b616b, roughness: 0.5, metalness: 0.7 });
  const PW = 9, PH = 4.5, LIFT = 4.2;
  const groups = [];
  for (const s of spots) {
    const grp = new THREE.Group(), y = heightAt(s.x, s.z);
    grp.position.set(s.x, y, s.z); grp.rotation.y = Math.atan2(-s.nx, -s.nz); // the face looks back at the road
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), face); panel.position.y = LIFT + PH / 2; grp.add(panel);
    const box = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.3, PH + 0.3, 0.35), back); box.position.set(0, LIFT + PH / 2, -0.2); grp.add(box);
    for (const x of [-PW * 0.3, PW * 0.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, LIFT + 0.4, 10), steel); p.position.set(x, (LIFT + 0.4) / 2 - 0.2, -0.25); p.castShadow = true; grp.add(p); }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(PW * 0.9, 0.12, 0.3), steel); lamp.position.set(0, LIFT + PH + 0.35, 0.35); grp.add(lamp);
    scene.add(grp); groups.push(grp);
  }
  function draw(rows) {
    const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#0d1424'); grad.addColorStop(1, '#1b0f24');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff7a2f'; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
    g.textBaseline = 'middle'; g.fillStyle = '#ff7a2f'; g.font = '400 54px Anton, Impact, sans-serif'; g.fillText("POWAY'S MOST WANTED", 36, 58);
    g.fillStyle = '#9aa3b8'; g.font = '600 28px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('ALL-TIME K/D · ONLINE', 38, 104);
    g.textAlign = 'right'; g.fillText('POWAY AUTOMOBILE ONLINE', W - 36, 58); g.textAlign = 'left';
    if (!rows || !rows.length) {
      g.fillStyle = '#f4f1ea'; g.font = '400 48px Anton, Impact, sans-serif';
      g.fillText(rows ? 'NOBODY ON THE BOARD YET' : 'PLAY ONLINE TO GET ON THE BOARD', 36, 270);
      g.fillStyle = '#9aa3b8'; g.font = '600 30px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('10 kills plus deaths online puts you on it.', 38, 330);
    } else {
      rows.slice(0, 8).forEach((r, i) => {
        const y = 160 + i * 42, top = i < 3;
        g.fillStyle = top ? ['#ffd23f', '#d6dde8', '#d79a5a'][i] : '#f4f1ea';
        g.font = `400 ${top ? 36 : 32}px Anton, Impact, sans-serif`; g.fillText(`${r.rank}`, 40, y);
        g.fillText(String(r.name).slice(0, 16).toUpperCase(), 100, y);
        g.fillStyle = '#9aa3b8'; g.font = '600 24px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText(String(r.title || '').toUpperCase(), 460, y + 2);
        g.textAlign = 'right'; g.fillStyle = top ? '#ffd23f' : '#f4f1ea'; g.font = `400 ${top ? 36 : 32}px Anton, Impact, sans-serif`; g.fillText((r.score / 1000).toFixed(2), 870, y);
        g.fillStyle = '#9aa3b8'; g.font = '600 24px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText(`${r.k | 0}/${r.d | 0}`, W - 36, y + 2); g.textAlign = 'left';
      });
    }
    tex.needsUpdate = true;
  }
  draw(null);
  return { groups, show: draw };
}
