import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

const MARGIN = 0.22;
const F0 = 42;
const TAU = Math.PI * 2;

const sceneVert = /* glsl */`
uniform sampler2D uDepth;
uniform float uZFar, uLayer;
uniform vec2 uHalf, uCell;
varying vec2 vUv;
varying float vDisp, vEdge;
varying vec3 vW, vN;
float Zof(float d){ return 1.0 / mix(1.0 / uZFar, 1.0, d); }
vec4 S(vec2 uv){ return texture2D(uDepth, clamp(uv, 0.0, 1.0)); }
float D(vec2 uv){ vec4 s = S(uv); return uLayer < 0.5 ? s.r : s.g; }
float Dn(vec2 uv){ vec4 s = S(uv); return uLayer < 0.5 ? s.b : s.g; }
vec3 P(vec2 uv, float d){ return vec3((uv * 2.0 - 1.0) * uHalf, -1.0) * Zof(d); }
void main(){
  vUv = uv;
  float d = D(uv);
  vDisp = d;
  vec3 p = P(uv, d) * (uLayer < 0.5 ? 1.0 : 1.006);
  float lR = log(Zof(D(uv + vec2(uCell.x, 0.0)))), lL = log(Zof(D(uv - vec2(uCell.x, 0.0))));
  float lU = log(Zof(D(uv + vec2(0.0, uCell.y)))), lD = log(Zof(D(uv - vec2(0.0, uCell.y))));
  vEdge = max(abs(lR - lL), abs(lU - lD));
  vec2 e = uCell * 2.5;
  vec2 ex = vec2(e.x, 0.0), ey = vec2(0.0, e.y);
  vec3 tx = P(uv + ex, Dn(uv + ex)) - P(uv - ex, Dn(uv - ex));
  vec3 ty = P(uv + ey, Dn(uv + ey)) - P(uv - ey, Dn(uv - ey));
  vN = normalize(cross(tx, ty));
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const sceneFrag = /* glsl */`
uniform sampler2D uColor, uPlate;
uniform float uLayer, uFog, uRelight, uEdgeLo, uEdgeHi;
uniform vec3 uFogColor, uLightPos, uLightColor;
varying vec2 vUv;
varying float vDisp, vEdge;
varying vec3 vW, vN;
void main(){
  float keep = 1.0 - smoothstep(uEdgeLo, uEdgeHi, vEdge);
  if (uLayer < 0.5 && keep < 0.5) discard;
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec3 col = uLayer < 0.5 ? texture2D(uColor, uv).rgb : texture2D(uPlate, uv).rgb;
  vec3 N = normalize(vN);
  vec3 L = uLightPos - vW; float dist = length(L); L /= dist;
  float diff = max(dot(N, L), 0.0);
  float att = 1.0 / (1.0 + 0.09 * dist * dist);
  vec3 V = normalize(cameraPosition - vW);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 26.0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 lit = col * (0.22 + uLightColor * diff * att * 2.4) + uLightColor * spec * att * (0.15 + 0.5 * lum);
  col = mix(col, lit, uRelight);
  float f = uFog * pow(1.0 - vDisp, 1.5);
  col = mix(col, uFogColor, clamp(f * 1.08, 0.0, 0.96));
  gl_FragColor = vec4(col, vDisp);
}`;

const postVert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const postFrag = /* glsl */`
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uDof, uFocus, uTilt, uTiltY, uGrain, uTime, uBars, uVig, uAspect, uMaxR, uFade;
uniform int uGrade;
varying vec2 vUv;
float coc(float disp, vec2 uv){
  float c = uDof * smoothstep(0.02, 0.4, abs(disp - uFocus));
  float t = uTilt * smoothstep(0.05, 0.4, abs(uv.y - uTiltY));
  return max(c, t);
}
vec3 sat(vec3 c, float s){ return mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, s); }
vec3 con(vec3 c, float k){ return (c - 0.5) * k + 0.5; }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 grade(vec3 c){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (uGrade == 1) {
    c = mix(c, c * vec3(0.8, 1.0, 1.14), (1.0 - l) * 0.6);
    c = mix(c, c * vec3(1.12, 1.0, 0.84), l * 0.6);
    c = sat(con(c, 1.12), 1.1);
  } else if (uGrade == 2) {
    c = pow(max(c, 0.0), vec3(0.94, 1.0, 1.1));
    c = sat(con(c, 1.1), 1.3) + vec3(0.02, 0.008, -0.012);
  } else if (uGrade == 3) {
    c = smoothstep(0.03, 0.97, con(vec3(l), 1.3));
  } else if (uGrade == 4) {
    c = sat(mix(c, vec3(1.0, 0.86, 0.9), 0.1) * 0.84 + 0.13, 0.9);
  } else if (uGrade == 5) {
    c = con(mix(c, c * vec3(0.72, 0.9, 1.28), 0.65), 1.1) - 0.02;
  }
  return c;
}
void main(){
  vec4 c0 = texture2D(tScene, vUv);
  vec3 col = c0.rgb;
  if (uDof + uTilt > 0.001) {
    float r0 = coc(c0.a, vUv) * uMaxR;
    vec3 acc = col; float ws = 1.0;
    for (int i = 0; i < 48; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / 48.0) * uMaxR;
      float th = fi * 2.39996;
      vec2 q = vUv + vec2(cos(th), sin(th)) * r / uRes;
      vec4 s = texture2D(tScene, q);
      float cs = coc(s.a, q) * uMaxR;
      if (s.a < c0.a) cs = min(cs, r0);
      float w = clamp(cs - r + 1.0, 0.0, 1.0);
      acc += s.rgb * w; ws += w;
    }
    col = acc / ws;
  }
  col = grade(col);
  if (uTilt > 0.0) col = sat(con(col, 1.0 + 0.12 * uTilt), 1.0 + 0.4 * uTilt);
  vec2 q = vUv - 0.5; q.x *= mix(1.0, uAspect, 0.5);
  col *= 1.0 - uVig * smoothstep(0.2, 0.9, length(q) * 1.1);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float n = hash(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7) - 0.5;
  col += n * uGrain * 0.11 * (0.35 + 1.3 * l * (1.0 - l));
  float bh = max(0.0, 0.5 - 0.5 * uAspect / 2.39) * uBars;
  if (vUv.y < bh || vUv.y > 1.0 - bh) col = vec3(0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uFade, 1.0);
}`;

const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export const MOVES = {
  vertigo: (t, A, Zf) => { const p = 0.5 - 0.5 * Math.cos(TAU * t); const b = Zf * 0.95 * A * p; return { pos: [0, 0, b], look: [0, 0, -Zf], fovK: Zf / (Zf + b) }; },
  push: (t, A, Zf) => { const s = Math.sin(TAU * t), p = 0.5 - 0.5 * Math.cos(TAU * t); return { pos: [Zf * 0.06 * A * s, Zf * 0.015 * A * p, -Zf * 0.32 * A * p], look: [Zf * 0.03 * A * s, 0, -Zf * 1.2], fovK: 1 - 0.1 * A * p }; },
  orbit: (t, A, Zf, T) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t); return { pos: [Zf * 0.24 * A * s, Zf * 0.08 * A * c, Zf * 0.05 * A * (1 - Math.abs(s))], look: T, fovK: 1 }; },
  crane: (t, A, Zf, T) => { const c = Math.cos(TAU * t), p = 0.5 - 0.5 * c; return { pos: [0, -Zf * 0.2 * A * c, -Zf * 0.1 * A * p], look: [T[0] * 0.5, T[1] * 0.5 - Zf * 0.05 * A * c, T[2]], fovK: 1 }; },
  swing: (t, A, Zf, T) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t); return { pos: [Zf * 0.26 * A * s, Zf * 0.035 * A * (c * c), -Zf * 0.06 * A * (1 - c * c)], look: T, fovK: 1, roll: -0.045 * A * s }; },
  still: () => ({ pos: [0, 0, 0], look: [0, 0, -1], fovK: 1 })
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.setClearColor(0x0a0908, 1);
    this.camera = new THREE.PerspectiveCamera(F0, 1, 0.02, 200);
    this.scene = new THREE.Scene();
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.common = {
      uDepth: { value: null }, uColor: { value: null }, uPlate: { value: null },
      uZFar: { value: 1 }, uHalf: { value: new THREE.Vector2(1, 1) }, uCell: { value: new THREE.Vector2(0.003, 0.003) },
      uFog: { value: 0 }, uFogColor: { value: new THREE.Color(1, 1, 1) }, uRelight: { value: 0 },
      uLightPos: { value: new THREE.Vector3(0, 0.3, -1) }, uLightColor: { value: new THREE.Color(1, 0.85, 0.7) },
      uEdgeLo: { value: 0.08 }, uEdgeHi: { value: 0.16 }
    };
    const mk = (layer) => new THREE.ShaderMaterial({ vertexShader: sceneVert, fragmentShader: sceneFrag, uniforms: { ...this.common, uLayer: { value: layer } } });
    this.fgMat = mk(0); this.bgMat = mk(1);
    this.post = new THREE.ShaderMaterial({
      vertexShader: postVert, fragmentShader: postFrag, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uDof: { value: 0 }, uFocus: { value: 0.5 },
        uTilt: { value: 0 }, uTiltY: { value: 0.45 }, uGrain: { value: 0 }, uTime: { value: 0 }, uBars: { value: 0 }, uVig: { value: 0.35 },
        uAspect: { value: 1 }, uMaxR: { value: 12 }, uFade: { value: 1 }, uGrade: { value: 0 }
      }
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.postScene = new THREE.Scene();
    const pm = new THREE.Mesh(tri, this.post); pm.frustumCulled = false; this.postScene.add(pm);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.look = { depth: 1, fog: 0, fogColor: '#ffffff', relight: 0, lightColor: '#ffd2a1', dof: 0, tilt: 0, grain: 0, bars: 0, grade: 0 };
    this.move = 'vertigo'; this.strength = 1; this.loop = 5;
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    this.light = { x: 0.35, y: 0.45 };
    this.focusDisp = 0.6; this.focusSmooth = 0.6;
    this.inflate = 1; this.fade = 1; this.fadeTarget = 1;
    this.sm = { depth: 1, fog: 0, relight: 0, dof: 0, tilt: 0, grain: 0, bars: 0 };
    this.fogCol = new THREE.Color(1, 1, 1); this.lightCol = new THREE.Color(1, 0.85, 0.7);
    this.size = { w: 1, h: 1 }; this.fixedSize = null;
    this.data = null;
    this.resize();
  }

  get aspect() { return this.size.w / this.size.h; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w, h;
    if (this.fixedSize) { [w, h] = this.fixedSize; this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false); }
    else { w = window.innerWidth; h = window.innerHeight; this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); }
    this.size = { w, h };
    const pw = Math.round(w * (this.fixedSize ? 1 : dpr)), ph = Math.round(h * (this.fixedSize ? 1 : dpr));
    this.rt.setSize(pw, ph);
    this.post.uniforms.uRes.value.set(pw, ph);
    this.post.uniforms.uAspect.value = w / h;
    this.post.uniforms.uMaxR.value = 13 * ph / 1080 + 3;
    this.camera.aspect = w / h;
    this.updateHalf();
  }

  updateHalf() {
    if (!this.data) return;
    const hy0 = Math.tan(THREE.MathUtils.degToRad(F0) / 2), hx0 = hy0 * this.aspect, pa = this.data.aspect, os = 1.04;
    if (pa > this.aspect) this.common.uHalf.value.set(hy0 * os * pa, hy0 * os);
    else this.common.uHalf.value.set(hx0 * os, hx0 * os / pa);
  }

  setScene(image, prep) {
    const old = this.data;
    const tex = new THREE.Texture(image);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4; tex.needsUpdate = true;
    const plate = new THREE.CanvasTexture(prep.plate); plate.colorSpace = THREE.NoColorSpace;
    const half = new Uint16Array(prep.packed.length);
    for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(prep.packed[i]);
    const dt = new THREE.DataTexture(half, prep.w, prep.h, THREE.RGBAFormat, THREE.HalfFloatType);
    dt.minFilter = dt.magFilter = THREE.LinearFilter; dt.needsUpdate = true;
    this.common.uColor.value = tex; this.common.uPlate.value = plate; this.common.uDepth.value = dt;

    const segX = 400, segY = Math.max(40, Math.min(640, Math.round(400 / prep.aspect)));
    const geo = this.buildGrid(segX, segY);
    this.common.uCell.value.set(1 / segX * (1 + 2 * MARGIN), 1 / segY * (1 + 2 * MARGIN));
    if (this.fg) { this.scene.remove(this.fg, this.bg); this.fg.geometry.dispose(); }
    this.fg = new THREE.Mesh(geo, this.fgMat); this.bg = new THREE.Mesh(geo, this.bgMat);
    this.fg.frustumCulled = this.bg.frustumCulled = false;
    this.bg.renderOrder = 0; this.fg.renderOrder = 1;
    this.scene.add(this.bg, this.fg);
    if (old) { old.tex?.dispose(); old.plate?.dispose(); old.dt?.dispose(); }
    this.data = { ...prep, tex, plate, dt };
    this.focusDisp = this.focusSmooth = prep.focus;
    this.inflate = 0;
    this.updateHalf();
  }

  buildGrid(nx, ny) {
    const g = new THREE.BufferGeometry();
    const uv = new Float32Array((nx + 1) * (ny + 1) * 2), pos = new Float32Array((nx + 1) * (ny + 1) * 3);
    let k = 0;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      uv[k++] = -MARGIN + (1 + 2 * MARGIN) * i / nx;
      uv[k++] = -MARGIN + (1 + 2 * MARGIN) * j / ny;
    }
    const idx = new Uint32Array(nx * ny * 6); k = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = c;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  zFar(inflate = this.inflate) { return 1 + this.sm.depth * 6.5 * inflate; }
  Zof(d) { const zf = this.zFar(); return 1 / ((1 / zf) * (1 - d) + d); }

  /** screen NDC -> disparity under the pointer, by marching the view ray through the height field */
  pick(nx, ny) {
    if (!this.data) return null;
    const cam = this.camera;
    const o = cam.position.clone();
    const dir = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(o).normalize();
    const H = this.common.uHalf.value;
    const p = new THREE.Vector3();
    for (let t = 0.2; t < 40; t *= 1.012) {
      p.copy(o).addScaledVector(dir, t);
      if (p.z > -0.05) continue;
      const Z = -p.z, u = (p.x / Z / H.x) * 0.5 + 0.5, v = (p.y / Z / H.y) * 0.5 + 0.5;
      const d = this.data.sample(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
      if (Z >= this.Zof(d)) return { disp: d, u, v };
    }
    return { disp: 0, u: 0.5, v: 0.5 };
  }

  setFocusFromScreen(nx, ny) { const r = this.pick(nx, ny); if (r) this.focusDisp = r.disp; return r; }

  lightWorld() {
    const hy = Math.tan(THREE.MathUtils.degToRad(F0) / 2);
    const Zl = this.Zof(this.focusSmooth) * 0.55 + 0.25;
    return new THREE.Vector3(this.light.x * hy * this.aspect * Zl, this.light.y * hy * Zl, -Zl);
  }
  projectLight() {
    const v = this.lightWorld().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (0.5 - v.y * 0.5) * this.canvas.clientHeight };
  }
  lightFromScreen(px, py) {
    const nx = px / this.canvas.clientWidth * 2 - 1, ny = 1 - py / this.canvas.clientHeight * 2;
    const Zl = this.Zof(this.focusSmooth) * 0.55 + 0.25;
    const w = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const t = (Zl + this.camera.position.z) / -w.z;
    const p = this.camera.position.clone().addScaledVector(w, t);
    const hy = Math.tan(THREE.MathUtils.degToRad(F0) / 2);
    this.light.x = Math.max(-1.6, Math.min(1.6, p.x / (hy * this.aspect * Zl)));
    this.light.y = Math.max(-1.6, Math.min(1.6, p.y / (hy * Zl)));
  }

  render(phase, dt, time, { parallax = true } = {}) {
    if (!this.data) return;
    const L = this.look, sm = this.sm, k = 6;
    for (const key of Object.keys(sm)) sm[key] = damp(sm[key], L[key], k, dt);
    this.inflate = Math.min(1, this.inflate + dt / 1.7);
    this.fade = damp(this.fade, this.fadeTarget, 9, dt);
    this.focusSmooth = damp(this.focusSmooth, this.focusDisp, 4, dt);
    this.fogCol.lerp(new THREE.Color(L.fogColor), 1 - Math.exp(-6 * dt));
    this.lightCol.lerp(new THREE.Color(L.lightColor), 1 - Math.exp(-6 * dt));

    const inf = ease(this.inflate);
    this.common.uZFar.value = this.zFar(inf);
    this.common.uFog.value = sm.fog; this.common.uFogColor.value.copy(this.fogCol);
    this.common.uRelight.value = sm.relight; this.common.uLightColor.value.copy(this.lightCol);
    this.common.uLightPos.value.copy(this.lightWorld());

    const Zf = this.Zof(this.focusSmooth);
    const fu = this.data.focusUV, H = this.common.uHalf.value;
    const T = [(fu[0] * 2 - 1) * H.x * Zf * 0.5, (fu[1] * 2 - 1) * H.y * Zf * 0.5, -Zf];
    const m = (MOVES[this.move] || MOVES.still)(phase, this.strength * (0.35 + 0.65 * inf), Zf, T);
    const ps = this.pointer;
    ps.sx = damp(ps.sx, parallax ? ps.x : 0, 3.5, dt); ps.sy = damp(ps.sy, parallax ? ps.y : 0, 3.5, dt);
    const cam = this.camera;
    cam.position.set(m.pos[0] + ps.sx * Zf * 0.12, m.pos[1] + ps.sy * Zf * 0.08, m.pos[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(m.look[0] + ps.sx * Zf * 0.03, m.look[1] + ps.sy * Zf * 0.02, m.look[2]);
    if (m.roll) cam.rotateZ(m.roll);
    const hy = Math.tan(THREE.MathUtils.degToRad(F0) / 2) * m.fovK;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(hy));
    cam.updateProjectionMatrix();

    const pu = this.post.uniforms;
    pu.uDof.value = sm.dof; pu.uFocus.value = this.focusSmooth; pu.uTilt.value = sm.tilt;
    pu.uGrain.value = sm.grain; pu.uBars.value = sm.bars; pu.uTime.value = time; pu.uGrade.value = L.grade; pu.uFade.value = this.fade;

    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x0a0908, 0);
    r.clear();
    r.render(this.scene, cam);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
