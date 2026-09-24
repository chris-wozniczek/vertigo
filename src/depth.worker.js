import { pipeline, env, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;
const MODEL = 'onnx-community/depth-anything-v2-small';
let pipe = null, device = null;

async function pickDevice() {
  try {
    if (!navigator.gpu) return { device: 'wasm', dtype: 'q8' };
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { device: 'wasm', dtype: 'q8' };
    return { device: 'webgpu', dtype: a.features.has('shader-f16') ? 'fp16' : 'fp32' };
  } catch { return { device: 'wasm', dtype: 'q8' }; }
}

const files = new Map();
function onProgress(p) {
  if (p.status === 'progress' && p.total) {
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    postMessage({ type: 'download', loaded, total });
  }
}

async function load(opts) {
  files.clear();
  postMessage({ type: 'loading', device: opts.device });
  pipe = await pipeline('depth-estimation', MODEL, { device: opts.device, dtype: opts.dtype, progress_callback: onProgress });
  device = opts.device;
}

self.onmessage = async (e) => {
  if (e.data.type !== 'run') return;
  try {
    if (!pipe) {
      const opts = await pickDevice();
      try { await load(opts); }
      catch (err) {
        if (opts.device === 'webgpu') await load({ device: 'wasm', dtype: 'q8' });
        else throw err;
      }
    }
    postMessage({ type: 'infer', device });
    const img = await RawImage.fromBlob(e.data.blob);
    const t0 = performance.now();
    let out;
    try { out = await pipe(img); }
    catch (err) {
      if (device !== 'webgpu') throw err;
      await load({ device: 'wasm', dtype: 'q8' });
      postMessage({ type: 'infer', device });
      out = await pipe(img);
    }
    const d = out.depth;
    const data = new Uint8ClampedArray(d.data);
    postMessage({ type: 'done', data, width: d.width, height: d.height, device, ms: performance.now() - t0 }, [data.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
