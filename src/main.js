import './style.css';
import { Stage } from './stage.js';
import { prepare } from './prep.js';
import { startRecording, pickType, download } from './recorder.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BASE = import.meta.env.BASE_URL;

const SAMPLES = [
  { id: 'forest', name: 'Forest', credit: 'Sebastian Unrau' },
  { id: 'lake', name: 'Lake Braies', credit: 'Pietro De Grandi' },
  { id: 'tree', name: 'Lone Tree', credit: 'Unsplash' },
  { id: 'city', name: 'City Canyon', credit: 'Max Bender' }
];
const MOVE_LIST = [
  { id: 'vertigo', name: 'Vertigo', sub: 'Dolly zoom', a: 'a-vertigo', svg: '<g class="anim"><rect x="8" y="5" width="24" height="20" rx="3"/><rect x="14" y="10" width="12" height="10" rx="2"/></g>' },
  { id: 'push', name: 'Ken Burns', sub: 'Slow push-in', a: 'a-push', svg: '<rect x="5" y="5" width="30" height="20" rx="3" opacity=".4"/><g class="anim"><rect x="12" y="9" width="16" height="12" rx="2"/></g>' },
  { id: 'orbit', name: 'Orbit', sub: 'Circle the subject', a: 'a-orbit', svg: '<ellipse cx="20" cy="15" rx="14" ry="7" opacity=".4"/><g class="anim"><circle cx="34" cy="15" r="2.6" fill="currentColor"/></g><circle cx="20" cy="15" r="3"/>' },
  { id: 'crane', name: 'Crane', sub: 'Rise and tilt', a: 'a-crane', svg: '<path d="M6 27h28" opacity=".4"/><g class="anim"><rect x="14" y="12" width="12" height="9" rx="2"/><path d="M20 12V5"/></g>' },
  { id: 'swing', name: 'Swing', sub: 'Pendulum arc', a: 'a-swing', svg: '<g class="anim" style="transform-origin:20px 4px"><path d="M20 4v14"/><circle cx="20" cy="22" r="4"/></g>' },
  { id: 'still', name: 'Window', sub: 'Just you, peeking', a: 'a-still', svg: '<rect x="8" y="5" width="24" height="20" rx="3"/><path d="M20 5v20M8 15h24" opacity=".5"/><g class="anim"><circle cx="20" cy="15" r="2.4" fill="currentColor"/></g>' }
];
const FOGS = ['#f1ebe2', '#ffd6a8', '#f5b6c6', '#86c9cc', '#3b4270', '#0b0a09'];
const LIGHTS = ['#ffc98c', '#fff3e3', '#ff5fa8', '#5ad3ff', '#ff7a3d'];
const GRADES = [
  { name: 'Natural', g: 'linear-gradient(135deg,#ddd,#888)' },
  { name: 'Blockbuster', g: 'linear-gradient(135deg,#1f7f8c,#ff9a4d)' },
  { name: 'Kodachrome', g: 'linear-gradient(135deg,#d8452b,#f2c14e)' },
  { name: 'Noir', g: 'linear-gradient(135deg,#111,#eee)' },
  { name: 'Dream', g: 'linear-gradient(135deg,#f7c6d9,#c9d8ff)' },
  { name: 'Blue hour', g: 'linear-gradient(135deg,#1d2b64,#6d8fd8)' }
];

// ---------- capability check ----------
const canvas = $('#stage');
const gl2 = document.createElement('canvas').getContext('webgl2');
if (!gl2) {
  document.body.insertAdjacentHTML('beforeend', '<div class="modal on"><div class="modal-card help-card"><p class="eyebrow">Unsupported</p><h2>This browser can\'t do <em>3D</em> yet.</h2><p style="color:var(--ink-2);font-size:14px;line-height:1.5">Vertigo needs WebGL 2. Try the latest Chrome, Edge, Safari or Firefox on a desktop or recent phone.</p></div></div>');
  throw new Error('WebGL2 unavailable');
}

const stage = new Stage(canvas);
const state = { playing: true, phase: 0, aspect: '16:9', scene: 'forest', exporting: false };

// ---------- default look ----------
Object.assign(stage.look, { depth: 1, fog: 0.32, fogColor: FOGS[1], relight: 0, lightColor: LIGHTS[0], dof: 0.35, tilt: 0, grain: 1, bars: 0, grade: 2 });
stage.move = 'vertigo'; stage.strength = 1; stage.loop = 5;

// ---------- samples ----------
const samplesEl = $('#samples');
function addThumb(s) {
  const b = document.createElement('button');
  b.className = 'sample' + (s.user ? ' user' : '');
  b.dataset.id = s.id; b.title = s.name;
  b.innerHTML = `<img alt="${s.name}" src="${s.thumb}" draggable="false">`;
  b.onclick = () => showScene(s.id);
  if (s.user) samplesEl.prepend(b); else samplesEl.appendChild(b);
  return b;
}
const scenes = new Map();
for (const s of SAMPLES) {
  const e = { ...s, thumb: `${BASE}samples/${s.id}.thumb.jpg` };
  scenes.set(s.id, e); addThumb(e);
}

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });

async function ensurePrepared(s) {
  if (s.prep) return s;
  const [img, dep] = await Promise.all([loadImg(s.src || `${BASE}samples/${s.id}.jpg`), s.depthSrc ? s.depthSrc : loadImg(`${BASE}samples/${s.id}.depth.png`)]);
  s.img = img; s.prep = prepare(img, dep);
  return s;
}

let sceneToken = 0;
async function showScene(id, { first = false } = {}) {
  const s = scenes.get(id);
  const tok = ++sceneToken;
  $$('.sample').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  if (!first) { stage.fadeTarget = 0; await new Promise((r) => setTimeout(r, 260)); }
  await ensurePrepared(s);
  if (tok !== sceneToken) return;
  stage.setScene(s.img, s.prep);
  stage.fade = first ? 1 : 0; stage.fadeTarget = 1;
  state.scene = id; state.phase = 0;
  $('#slateScene').textContent = s.name;
  $('#slateCredit').textContent = s.user ? 'Your photo' : `${s.credit} · Unsplash`;
}

// ---------- dock / panels ----------
const dock = $('#dock');
function openPanel(name) {
  const cur = dock.dataset.open;
  const next = cur === name ? '' : name;
  dock.dataset.open = next;
  dock.classList.toggle('open', !!next);
  $$('.tab[data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === next));
  $$('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === next));
  if (next === 'look') hint('Drag the <b>light</b> · click the scene to <b>focus</b>', 3200);
}
$$('.tab[data-tab]').forEach((t) => (t.onclick = () => openPanel(t.dataset.tab)));

// moves
const movesEl = $('#moves');
for (const m of MOVE_LIST) {
  const b = document.createElement('button');
  b.className = 'move'; b.dataset.id = m.id; b.style.setProperty('--a', m.a);
  b.innerHTML = `<div class="ico"><svg viewBox="0 0 40 30">${m.svg}</svg></div><b>${m.name}</b><small>${m.sub}</small>`;
  b.onclick = () => setMove(m.id);
  movesEl.appendChild(b);
}
function setMove(id) {
  stage.move = id; state.phase = 0;
  $$('.move').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  $('#slateMove').textContent = MOVE_LIST.find((m) => m.id === id).name;
  if (!state.playing) setPlaying(true);
}

// sliders
function paintRange(r) { r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%'); }
const fmtOut = (k, v) => k === 'strength' || k === 'depth' ? `${Number(v).toFixed(2)}×` : `${Math.round(v * 100)}%`;
function getVal(k) { return k === 'strength' ? stage.strength : stage.look[k]; }
function syncRanges() {
  $$('input[type=range][data-k]').forEach((r) => { r.value = getVal(r.dataset.k); paintRange(r); });
  $$('[data-out]').forEach((o) => (o.textContent = fmtOut(o.dataset.out, getVal(o.dataset.out))));
}
$$('input[type=range][data-k]').forEach((r) => {
  r.addEventListener('input', () => {
    const k = r.dataset.k, v = parseFloat(r.value);
    if (k === 'strength') stage.strength = v; else stage.look[k] = v;
    paintRange(r);
    $$(`[data-out="${k}"]`).forEach((o) => (o.textContent = fmtOut(k, v)));
    if (k === 'relight') updateLightHandle();
  });
});

// segmented
function syncSegs() {
  $$('[data-seg]').forEach((s) => {
    const k = s.dataset.seg;
    const v = k === 'loop' ? String(stage.loop) : k === 'playing' ? (state.playing ? '1' : '0') : state[k];
    $$('button', s).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  });
}
$$('[data-seg]').forEach((s) => $$('button', s).forEach((b) => (b.onclick = () => {
  const k = s.dataset.seg, v = b.dataset.v;
  if (k === 'loop') { const ph = state.phase; stage.loop = +v; state.phase = ph; }
  else if (k === 'playing') setPlaying(v === '1');
  else state[k] = v;
  syncSegs();
})));
function setPlaying(p) { state.playing = p; syncSegs(); }

// swatches
function buildSwatches(key, list) {
  const el = $(`[data-swatch="${key}"]`);
  el.innerHTML = '';
  for (const c of list) {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.setProperty('--c', c); b.title = c;
    b.onclick = () => {
      stage.look[key] = c;
      if (key === 'fogColor' && stage.look.fog < 0.05) { stage.look.fog = 0.4; syncRanges(); }
      if (key === 'lightColor' && stage.look.relight < 0.05) { stage.look.relight = 0.7; syncRanges(); updateLightHandle(); }
      syncSwatches();
    };
    el.appendChild(b);
  }
}
function syncSwatches() {
  $$('[data-swatch]').forEach((el) => $$('.sw', el).forEach((b) => b.classList.toggle('on', b.title === stage.look[el.dataset.swatch])));
  $('#lightHandle').style.setProperty('--lc', stage.look.lightColor);
}
buildSwatches('fogColor', FOGS); buildSwatches('lightColor', LIGHTS);

// grades
const gradesEl = $('#grades');
GRADES.forEach((g, i) => {
  const b = document.createElement('button');
  b.className = 'chip'; b.style.setProperty('--g', g.g);
  b.innerHTML = `<i></i>${g.name}`;
  b.onclick = () => { stage.look.grade = i; syncChips(); };
  gradesEl.appendChild(b);
});
function syncChips() { $$('.chip', gradesEl).forEach((b, i) => b.classList.toggle('on', i === stage.look.grade)); }

// toggles
$$('.toggle').forEach((t) => (t.onclick = () => {
  const k = t.dataset.t;
  stage.look[k] = stage.look[k] > 0.5 ? 0 : 1;
  syncToggles();
  if (k === 'tilt' && stage.look.tilt) hint('Click the scene to move the <b>miniature</b> focus band', 3000);
}));
function syncToggles() { $$('.toggle').forEach((t) => t.classList.toggle('on', stage.look[t.dataset.t] > 0.5)); }

function syncAll() { syncRanges(); syncSegs(); syncSwatches(); syncChips(); syncToggles(); setMove(stage.move); }

// ---------- pointer: parallax, click to focus, light drag ----------
let down = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || down) {
    stage.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    stage.pointer.y = -((e.clientY / innerHeight) * 2 - 1);
  }
});
canvas.addEventListener('pointerleave', () => { stage.pointer.x = 0; stage.pointer.y = 0; });
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (e.pointerType !== 'mouse') { stage.pointer.x = 0; stage.pointer.y = 0; }
  if (moved > 6 || state.exporting) return;
  if (dock.classList.contains('open') && dock.dataset.open !== 'look') openPanel(dock.dataset.open);
  const nx = (e.clientX / innerWidth) * 2 - 1, ny = -((e.clientY / innerHeight) * 2 - 1);
  stage.setFocusFromScreen(nx, ny);
  stage.post.uniforms.uTiltY.value = 1 - e.clientY / innerHeight;
  if (stage.look.dof < 0.05 && stage.look.tilt < 0.5) { stage.look.dof = 0.55; syncRanges(); }
  const r = $('#reticle');
  r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
  r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
});

const lh = $('#lightHandle');
let lightDrag = false;
lh.addEventListener('pointerdown', (e) => { lightDrag = true; lh.setPointerCapture(e.pointerId); e.stopPropagation(); });
lh.addEventListener('pointermove', (e) => { if (lightDrag) stage.lightFromScreen(e.clientX, e.clientY); });
lh.addEventListener('pointerup', () => { lightDrag = false; });
function updateLightHandle() { lh.classList.toggle('on', stage.look.relight > 0.02 && !state.exporting); }

// gyro
let gyroOn = false;
function onOrient(e) {
  if (e.gamma == null) return;
  stage.pointer.x = Math.max(-1, Math.min(1, e.gamma / 25));
  stage.pointer.y = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
}
async function enableGyro() {
  if (gyroOn || !('DeviceOrientationEvent' in window) || !matchMedia('(pointer:coarse)').matches) return;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
    addEventListener('deviceorientation', onOrient); gyroOn = true;
  } catch { /* permission denied: touch drag still works */ }
}
addEventListener('pointerdown', enableGyro, { once: true });

// ---------- hints & toast ----------
let hintTimer;
function hint(html, ms = 3000) {
  const h = $('#hint'); h.innerHTML = html; h.classList.add('on');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.remove('on'), ms);
}
let toastTimer;
function toast(msg, ms = 4200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- help ----------
const help = $('#help');
const openHelp = () => help.classList.add('on');
const closeHelp = () => { help.classList.remove('on'); localStorage.setItem('vertigo.seen', '1'); setTimeout(() => hint(matchMedia('(pointer:coarse)').matches ? '<b>Tilt your phone</b> to look around · tap to focus' : '<b>Move your mouse</b> to look through the window · click to focus', 4200), 500); };
$('#helpBtn').onclick = openHelp; $('#helpClose').onclick = closeHelp; $('#helpGo').onclick = closeHelp;
help.addEventListener('click', (e) => { if (e.target === help) closeHelp(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (help.classList.contains('on')) closeHelp(); else if (dock.dataset.open) openPanel(dock.dataset.open); }
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!state.playing); }
});

// ---------- user photos: drop / paste / pick ----------
const fileIn = $('#file');
$('#dropBtn').onclick = () => fileIn.click();
fileIn.onchange = () => { if (fileIn.files[0]) handleFile(fileIn.files[0]); fileIn.value = ''; };
let dragDepth = 0;
addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropOverlay').classList.add('on'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').classList.remove('on'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('#dropOverlay').classList.remove('on');
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) handleFile(f); else toast('That doesn\'t look like an image — try a JPG, PNG or WebP.');
});
addEventListener('paste', (e) => {
  const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
  if (it) handleFile(it.getAsFile());
});

let worker = null, busy = false;
const proc = $('#process');
function procSet(title, sub, pct, left, right) {
  $('#procTitle').textContent = title; $('#procSub').textContent = sub;
  const m = $('.meter'); m.classList.toggle('indet', pct == null);
  if (pct != null) $('#procBar').style.width = Math.round(pct * 100) + '%';
  if (left != null) $('#procLeft').textContent = left;
  if (right != null) $('#procRight').textContent = right;
}
const mb = (b) => (b / 1048576).toFixed(1);

async function downscale(file, max = 1600) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  return { canvas: c, blob };
}

function runDepth(blob) {
  worker ||= new Worker(new URL('./depth.worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'loading') procSet('Waking up the depth model', m.device === 'webgpu' ? 'One-time download, cached after this' : 'WebGPU unavailable — using WASM (a bit slower)', null, 'Connecting', m.device === 'webgpu' ? 'WebGPU' : 'WASM');
      else if (m.type === 'download') procSet('Downloading depth model', 'Depth Anything V2 · one-time, cached after this', m.loaded / m.total, `${mb(m.loaded)} / ${mb(m.total)} MB`);
      else if (m.type === 'infer') procSet('Reading the depth', 'Working out what\'s near and far', null, 'Thinking', m.device === 'webgpu' ? 'WebGPU' : 'WASM');
      else if (m.type === 'done') resolve(m);
      else if (m.type === 'error') reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Depth worker failed'));
    worker.postMessage({ type: 'run', blob });
  });
}

let userCount = 0;
async function handleFile(file) {
  if (busy) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file.'); return; }
  busy = true;
  if (dock.dataset.open) openPanel(dock.dataset.open);
  try {
    const { canvas: src, blob } = await downscale(file);
    const url = URL.createObjectURL(blob);
    $('#procThumb').style.backgroundImage = `url(${url})`;
    procSet('Getting ready', 'Runs on your device — nothing is uploaded', null, 'Starting', '');
    proc.classList.add('on');
    const d = await runDepth(blob);
    procSet('Building your diorama', 'Meshing, lighting and filling in the gaps', 1, `${Math.round(d.ms)} ms`, '');
    const dc = document.createElement('canvas'); dc.width = d.width; dc.height = d.height;
    const id = dc.getContext('2d').createImageData(d.width, d.height);
    for (let i = 0; i < d.data.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = d.data[i]; id.data[i * 4 + 3] = 255; }
    dc.getContext('2d').putImageData(id, 0, 0);
    const img = await loadImg(url);
    const tc = document.createElement('canvas'); tc.width = 240; tc.height = Math.round(240 * img.height / img.width);
    tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
    const s = { id: `user${++userCount}`, name: 'Your photo', user: true, src: url, depthSrc: dc, thumb: tc.toDataURL('image/jpeg', 0.8), img };
    await new Promise((r) => setTimeout(r, 30));
    s.prep = prepare(img, dc);
    scenes.set(s.id, s); addThumb(s);
    proc.classList.remove('on');
    await showScene(s.id);
    hint('Your photo is now a <b>3D shot</b> · try the camera moves', 3600);
  } catch (err) {
    console.error(err);
    proc.classList.remove('on');
    toast('Couldn\'t read depth for that photo: ' + err.message);
  } finally { busy = false; }
}

// ---------- export ----------
const fmtEl = $('#fmt');
const vType = pickType();
fmtEl.textContent = vType ? (vType.includes('mp4') ? 'MP4 · H.264' : 'WebM · VP9') : 'Not supported';
const DIMS = { '16:9': [1920, 1080], '1:1': [1080, 1080], '9:16': [1080, 1920] };
const expModal = $('#exportModal');
function setRing(p) { $('#expRing').style.strokeDashoffset = String(326.7 * (1 - p)); $('#expNum').textContent = Math.round(p * 100) + '%'; }
function enterExport() {
  state.exporting = true; updateLightHandle();
  stage.fixedSize = DIMS[state.aspect]; canvas.classList.add('exporting'); stage.resize();
}
function exitExport() {
  state.exporting = false; stage.fixedSize = null; canvas.classList.remove('exporting'); stage.resize(); updateLightHandle();
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

$('#stillBtn').onclick = async () => {
  enterExport();
  stage.render(state.phase, 1 / 60, performance.now() / 1000, { parallax: false });
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  exitExport();
  download(blob, `vertigo-${stamp()}.png`);
  toast('Still saved as PNG');
};

let rec = null;
$('#recBtn').onclick = () => {
  if (!vType) { toast('Video recording isn\'t supported in this browser. Try desktop Chrome.'); return; }
  $('#expTitle').textContent = 'Rolling camera…';
  $('#expSub').textContent = `One seamless ${stage.loop}s loop · ${DIMS[state.aspect].join('×')}`;
  $('#expActions').innerHTML = '';
  setRing(0); expModal.classList.add('on');
  enterExport();
  state.phase = 0; state.playing = true; syncSegs();
  try { rec = { r: startRecording(canvas), t0: null }; }
  catch (err) { exitExport(); expModal.classList.remove('on'); toast(err.message); rec = null; }
};
async function finishRecording() {
  const { r } = rec; rec = null;
  const blob = await r.stop();
  exitExport();
  const name = `vertigo-${stamp()}.${r.ext}`;
  download(blob, name);
  $('#expTitle').textContent = 'That\'s a wrap';
  $('#expSub').textContent = `${name} · ${(blob.size / 1048576).toFixed(1)} MB`;
  $('#expActions').innerHTML = '<button class="btn ghost" id="expAgain">Download again</button><button class="btn primary" id="expDone">Done</button>';
  $('#expAgain').onclick = () => download(blob, name);
  $('#expDone').onclick = () => expModal.classList.remove('on');
}

// ---------- main loop ----------
let last = performance.now();
const tcEl = $('#tc'), tcBar = $('#tcBar');
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (rec) {
    if (rec.t0 == null) rec.t0 = now;
    const p = (now - rec.t0) / 1000 / stage.loop;
    if (p >= 1) { stage.render(0, dt, now / 1000, { parallax: false }); finishRecording(); return; }
    state.phase = p; setRing(p);
    stage.render(p, dt, now / 1000, { parallax: false });
  } else {
    if (state.playing && stage.move !== 'still') state.phase = (state.phase + dt / stage.loop) % 1;
    stage.render(state.phase, dt, now / 1000);
  }
  const secs = state.phase * stage.loop;
  tcEl.textContent = `00:${String(Math.floor(secs)).padStart(2, '0')}.${Math.floor((secs % 1) * 10)}`;
  tcBar.style.width = (state.phase * 100).toFixed(1) + '%';
  if (lh.classList.contains('on') && !lightDrag) { const p = stage.projectLight(); lh.style.left = p.x + 'px'; lh.style.top = p.y + 'px'; }
  else if (lightDrag) { const p = stage.projectLight(); lh.style.left = p.x + 'px'; lh.style.top = p.y + 'px'; }
}

addEventListener('resize', () => { if (!state.exporting) stage.resize(); });

(async function boot() {
  syncAll();
  dock.classList.add('intro');
  await showScene('forest', { first: true });
  canvas.classList.add('on');
  requestAnimationFrame(frame);
  setTimeout(() => dock.classList.remove('intro'), 350);
  if (!localStorage.getItem('vertigo.seen')) setTimeout(openHelp, 1400);
  else setTimeout(() => hint('<b>Move your mouse</b> to look through the window · click to focus', 4200), 1200);
})();
