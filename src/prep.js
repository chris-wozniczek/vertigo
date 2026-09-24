const WORK = 640;

function toCanvas(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  return { c, g };
}

function filter1D(src, w, h, r, horiz, op) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = op === 'max' ? -1e9 : op === 'min' ? 1e9 : 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x;
        const yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
        const s = src[yy * w + xx];
        if (op === 'max') { if (s > v) v = s; } else if (op === 'min') { if (s < v) v = s; } else { v += s; n++; }
      }
      out[y * w + x] = op === 'avg' ? v / n : v;
    }
  }
  return out;
}
const sep = (a, w, h, r, op) => filter1D(filter1D(a, w, h, r, true, op), w, h, r, false, op);

function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function pushPull(rgb, wts, w, h) {
  const levels = [{ c: rgb, a: wts, w, h }];
  while (levels[levels.length - 1].w > 2 && levels[levels.length - 1].h > 2) {
    const L = levels[levels.length - 1];
    const nw = Math.ceil(L.w / 2), nh = Math.ceil(L.h / 2);
    const c = new Float32Array(nw * nh * 3), a = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sa = 0, r = 0, g = 0, b = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const xx = Math.min(L.w - 1, x * 2 + dx), yy = Math.min(L.h - 1, y * 2 + dy);
        const i = yy * L.w + xx, wt = L.a[i];
        sa += wt; r += L.c[i * 3] * wt; g += L.c[i * 3 + 1] * wt; b += L.c[i * 3 + 2] * wt;
      }
      const j = y * nw + x;
      if (sa > 0) { c[j * 3] = r / sa; c[j * 3 + 1] = g / sa; c[j * 3 + 2] = b / sa; }
      a[j] = Math.min(1, sa);
    }
    levels.push({ c, a, w: nw, h: nh });
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], U = levels[l + 1];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x, a = L.a[i];
      if (a >= 1) continue;
      const fx = Math.min(U.w - 1.001, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(U.h - 1.001, Math.max(0, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      for (let ch = 0; ch < 3; ch++) {
        const v = (U.c[(y0 * U.w + x0) * 3 + ch] * (1 - tx) + U.c[(y0 * U.w + x0 + 1) * 3 + ch] * tx) * (1 - ty) +
                  (U.c[((y0 + 1) * U.w + x0) * 3 + ch] * (1 - tx) + U.c[((y0 + 1) * U.w + x0 + 1) * 3 + ch] * tx) * ty;
        L.c[i * 3 + ch] = L.c[i * 3 + ch] * a + v * (1 - a);
      }
      L.a[i] = 1;
    }
  }
  return levels[0].c;
}

/** Build fg/bg depth layers + an inpainted background plate from a photo and its disparity map. */
export function prepare(image, depthSrc) {
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const w = WORK, h = Math.max(8, Math.round(WORK * ih / iw));
  const dpx = toCanvas(depthSrc, w, h).g.getImageData(0, 0, w, h).data;
  let d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = dpx[i * 4] / 255;

  const lo = percentile(d, 0.005), hi = percentile(d, 0.995);
  for (let i = 0; i < d.length; i++) d[i] = Math.min(1, Math.max(0, (d[i] - lo) / Math.max(1e-3, hi - lo)));
  d = sep(d, w, h, 1, 'avg');

  const fg = sep(d, w, h, 2, 'max');
  let bg = sep(fg, w, h, 14, 'min');
  bg = sep(sep(bg, w, h, 9, 'avg'), w, h, 9, 'avg');
  const nrm = sep(sep(fg, w, h, 3, 'avg'), w, h, 3, 'avg');
  for (let i = 0; i < bg.length; i++) bg[i] = Math.min(bg[i], fg[i]);

  // inpaint the background plate: pixels that are clearly foreground are unknown
  const px = toCanvas(image, w, h).g.getImageData(0, 0, w, h).data;
  const rgb = new Float32Array(w * h * 3), wt = new Float32Array(w * h);
  const occ = sep(Float32Array.from(d, (v, i) => (v - bg[i] > 0.06 ? 1 : 0)), w, h, 2, 'max');
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2];
    wt[i] = occ[i] > 0.5 ? 0 : 1;
  }
  const filled = pushPull(rgb, wt, w, h);
  const plate = document.createElement('canvas');
  plate.width = w; plate.height = h;
  const pg = plate.getContext('2d');
  const out = pg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    out.data[i * 4] = filled[i * 3]; out.data[i * 4 + 1] = filled[i * 3 + 1]; out.data[i * 4 + 2] = filled[i * 3 + 2]; out.data[i * 4 + 3] = 255;
  }
  pg.putImageData(out, 0, 0);

  // RGBA float: fg disparity, bg disparity, smoothed for normals
  const packed = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (h - 1 - y) * w + x, t = (y * w + x) * 4;
    packed[t] = fg[s]; packed[t + 1] = bg[s]; packed[t + 2] = nrm[s]; packed[t + 3] = 1;
  }

  // default focus: a near-ish subject around the centre
  let best = 0, fx = 0.5, fy = 0.5;
  for (let y = Math.floor(h * 0.25); y < h * 0.8; y += 2) for (let x = Math.floor(w * 0.2); x < w * 0.8; x += 2) {
    const cx = x / w - 0.5, cy = y / h - 0.52;
    const score = d[y * w + x] * Math.exp(-(cx * cx + cy * cy) * 7);
    if (score > best) { best = score; fx = x / w; fy = y / h; }
  }
  const focus = d[Math.floor(fy * h) * w + Math.floor(fx * w)];
  return { w, h, packed, plate, aspect: iw / ih, focus, focusUV: [fx, 1 - fy], sample: (u, v) => d[Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(u * w)))] };
}
