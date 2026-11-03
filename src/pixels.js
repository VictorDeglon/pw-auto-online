// An image's RGBA bytes without blocking the page: the blob is fetched here (so the asset packs' service worker serves
// it), then decoded and read back in a worker (createImageBitmap + OffscreenCanvas), and the bytes come back
// transferred, not copied. On the main thread that decode and getImageData of a 1024 x 6144 sheet held the page for
// one to five seconds. Falls back to the main thread where workers can't draw (no OffscreenCanvas).
//   const { data, width, height } = await imagePixels(url)
const SRC = `onmessage = async e => {
  const { id, blob } = e.data;
  try {
    const bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, bm.width, bm.height); bm.close();
    postMessage({ id, width: d.width, height: d.height, data: d.data.buffer }, [d.data.buffer]);
  } catch (err) { postMessage({ id, err: String(err && err.message || err) }); }
};`;
let worker = null, seq = 0; const wait = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
    worker = new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })));
    worker.onmessage = e => { const w = wait.get(e.data.id); if (!w) return; wait.delete(e.data.id); if (e.data.err) w.rej(new Error(e.data.err)); else w.res({ width: e.data.width, height: e.data.height, data: new Uint8ClampedArray(e.data.data) }); };
  } catch (e) { worker = false; }
  return worker;
}
async function onMain(blob) {
  const bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, bm.width, bm.height); bm.close();
  return { width: d.width, height: d.height, data: d.data };
}
export async function imagePixels(url) {
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  const blob = await r.blob(), w = getWorker();
  if (!w) return onMain(blob);
  const id = ++seq;
  return new Promise((res, rej) => { wait.set(id, { res, rej }); w.postMessage({ id, blob }); }).catch(() => onMain(blob));
}
