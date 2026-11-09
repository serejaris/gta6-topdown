import * as THREE from 'three';

export class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  quad(p0, p1, p2, p3, n, uvs, c) {
    const b = this.pos.length / 3;
    for (const p of [p0, p1, p2, p3]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) {
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(c.r, c.g, c.b);
    }
    for (const t of uvs) this.uv.push(t[0], t[1]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    if (this.both) this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  box(x0, y0, z0, x1, y1, z1, c, opts = {}) {
    const cw = opts.cellW || 0, ch = opts.cellH || 0, ou = opts.offU || 0, ov = opts.offV || 0, rs = opts.roofScale || 0;
    const wuv = (a0, a1) => (cw ? [[a0 / cw + ou, y0 / ch + ov], [a1 / cw + ou, y0 / ch + ov], [a1 / cw + ou, y1 / ch + ov], [a0 / cw + ou, y1 / ch + ov]] : [[0, 0], [1, 0], [1, 1], [0, 1]]);
    if (!opts.noSides) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], wuv(0, x1 - x0), c);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], wuv(0, x1 - x0), c);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], wuv(0, z1 - z0), c);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], wuv(0, z1 - z0), c);
    }
    if (!opts.noTop) {
      const tuv = rs ? [[x0 / rs, z1 / rs], [x1 / rs, z1 / rs], [x1 / rs, z0 / rs], [x0 / rs, z0 / rs]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], tuv, opts.topColor || c);
    }
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export const fadeUniforms = {
  uCam: { value: new THREE.Vector3() },
  uTarget: { value: new THREE.Vector3() },
  uFadeR: { value: 7 },
};

export function patchFade(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, fadeUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 fadeP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
fadeP = instanceMatrix * fadeP;
#endif
vFadeW = (modelMatrix * fadeP).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeW;\nuniform vec3 uCam;\nuniform vec3 uTarget;\nuniform float uFadeR;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
vec3 sg = uTarget - uCam;
float ft = clamp(dot(vFadeW - uCam, sg) / dot(sg, sg), 0.0, 1.0);
float fd = length(vFadeW - (uCam + sg * ft));
float fade = (1.0 - smoothstep(uFadeR * 0.55, uFadeR, fd)) * step(1.6, vFadeW.y);
fade = max(fade, smoothstep(uCam.y - 18.0, uCam.y - 6.0, vFadeW.y));
vec2 fc = floor(mod(gl_FragCoord.xy, 4.0));
float bayer = mod(fc.x * 2.0 + fc.y * 3.0 + fc.x * fc.y, 4.0) / 4.0 + mod(fc.x + fc.y * 2.0, 4.0) / 16.0;
if (fade * 0.85 > bayer) discard;
}`);
  };
  mat.customProgramCacheKey = () => 'fade';
  return mat;
}
