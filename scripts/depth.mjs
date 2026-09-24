import { pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
const names = process.argv.slice(2);
const depth = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'fp32' });
for (const n of names) {
  const img = await RawImage.read(`public/samples/${n}.jpg`);
  const t0 = Date.now();
  const out = await depth(img);
  const d = out.depth; // RawImage 1ch
  console.log(n, d.width, d.height, Date.now() - t0, 'ms');
  const w = 1024, h = Math.round(1024 * d.height / d.width);
  await sharp(Buffer.from(d.data), { raw: { width: d.width, height: d.height, channels: 1 } })
    .resize(w, h).png().toFile(`public/samples/${n}.depth.png`);
  await sharp(`public/samples/${n}.jpg`).resize(240).jpeg({ quality: 78 }).toFile(`public/samples/${n}.thumb.jpg`);
}
