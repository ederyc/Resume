/* Shared voxel toolkit: turns pixel-art sprites into lit 3D models and draws them with
   WebGL2. Used by the Magetender card (js/magetender.js) and the sections shelf
   (js/shelf.js). No libraries; everything hangs off window.Voxel. */
(function () {
  'use strict';

  function loadPixels(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        try {
          const id = ctx.getImageData(0, 0, c.width, c.height);
          resolve({ w: c.width, h: c.height, data: id.data, u32: new Uint32Array(id.data.buffer) });
        } catch (err) {
          reject(err); // a file:// page can't read pixels back; the static image stays
        }
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  // Extrudes a sprite into voxels. Depth grows with the distance from the outline, so
  // round things come out round: each pixel becomes a column, terraced like clay.
  // maxDepth caps it, so a flat thing (a laptop's screen) stays a flat slab.
  function voxelize(sp, puff, maxDepth = Infinity) {
    const { w, h, data } = sp;
    const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
    const INF = 1e9, dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = data[i * 4 + 3] >= 20 ? INF : 0;
    const D = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], D(x - 1, y) + 1, D(x, y - 1) + 1, D(x - 1, y - 1) + 1.414, D(x + 1, y - 1) + 1.414);
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], D(x + 1, y) + 1, D(x, y + 1) + 1, D(x + 1, y + 1) + 1.414, D(x - 1, y + 1) + 1.414);
    }
    let Rmax = 1;
    for (let i = 0; i < w * h; i++) if (dist[i] < INF) Rmax = Math.max(Rmax, dist[i]);
    const hd = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!dist[i]) continue;
      const e = Math.min(dist[i], Rmax);
      hd[i] = Math.min(maxDepth, Math.max(0.5, Math.round(puff * Math.sqrt(Math.max(0, Rmax * Rmax - (Rmax - e) * (Rmax - e))) * 2) / 2));
    }
    const H = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : hd[y * w + x]);
    const solid = { p: [], n: [], c: [] }, glass = { p: [], n: [], c: [] };
    const cx = w / 2, cy = h / 2;
    const quad = (m, v, n, col) => {
      for (const k of [0, 1, 2, 0, 2, 3]) { m.p.push(...v[k]); m.n.push(...n); m.c.push(...col); }
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, z = hd[i];
      if (!z) continue;
      const col = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
      const m = col[3] < 245 ? glass : solid;
      const x0 = x - cx, x1 = x0 + 1, yt = cy - y, yb = yt - 1;
      quad(m, [[x0, yb, z], [x1, yb, z], [x1, yt, z], [x0, yt, z]], [0, 0, 1], col);
      quad(m, [[x1, yb, -z], [x0, yb, -z], [x0, yt, -z], [x1, yt, -z]], [0, 0, -1], col);
      const side = (hn, v, n) => {
        if (hn >= z) return;
        if (hn === 0) quad(m, v(-z, z), n, col);
        else { quad(m, v(hn, z), n, col); quad(m, v(-z, -hn), n, col); }
      };
      side(H(x + 1, y), (za, zb) => [[x1, yb, za], [x1, yb, zb], [x1, yt, zb], [x1, yt, za]], [1, 0, 0]);
      side(H(x - 1, y), (za, zb) => [[x0, yt, za], [x0, yt, zb], [x0, yb, zb], [x0, yb, za]], [-1, 0, 0]);
      side(H(x, y - 1), (za, zb) => [[x1, yt, za], [x1, yt, zb], [x0, yt, zb], [x0, yt, za]], [0, 1, 0]);
      side(H(x, y + 1), (za, zb) => [[x0, yb, za], [x0, yb, zb], [x1, yb, zb], [x1, yb, za]], [0, -1, 0]);
    }
    return { w, h, solid, glass };
  }

  // Minimal 4x4 matrices, column-major like WebGL wants.
  const M = {
    persp(fovy, aspect, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; },
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    model(x, y, z, rx, ry, rz, s) {
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      // R = Ry * Rx * Rz
      const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
      const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
      const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
      return [r00 * s, r10 * s, r20 * s, 0, r01 * s, r11 * s, r21 * s, 0, r02 * s, r12 * s, r22 * s, 0, x, y, z, 1];
    },
    apply(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; },
  };

  const LIGHT = `
    vec3 shade(vec3 n, vec3 c) {
      vec3 l1 = normalize(vec3(-0.45, 0.65, 0.75)), l2 = normalize(vec3(0.85, -0.25, 0.45));
      float d1 = max(dot(n, l1), 0.0), d2 = max(dot(n, l2), 0.0);
      float rim = pow(1.0 - clamp(abs(n.z), 0.0, 1.0), 2.0);
      return c * (0.44 + 0.66 * d1 * vec3(1.0, 0.95, 0.86) + 0.32 * d2 * vec3(0.78, 0.7, 1.0)) + rim * 0.06 * vec3(1.0, 0.75, 0.45);
    }`;
  const VS_MESH = `#version 300 es
    in vec3 aPos; in vec3 aNrm; in vec4 aCol;
    uniform mat4 uPV, uModel;
    out vec3 vN; out vec4 vC;
    void main() { vN = mat3(uModel) * aNrm; vC = aCol; gl_Position = uPV * uModel * vec4(aPos, 1.0); }`;
  const FS_MESH = `#version 300 es
    precision mediump float;
    in vec3 vN; in vec4 vC; uniform float uAlpha; out vec4 o;
    ${LIGHT}
    void main() { o = vec4(shade(normalize(vN), vC.rgb), vC.a * uAlpha); o.rgb *= o.a; }`;
  const VS_BITS = `#version 300 es
    in vec3 aPos; in vec3 aNrm; in vec4 iPos; in vec4 iCol; in vec4 iRot;
    uniform mat4 uPV;
    out vec3 vN; out vec4 vC;
    vec3 rot(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
    void main() {
      vN = rot(aNrm, iRot.xyz, iRot.w); vC = iCol;
      gl_Position = uPV * vec4(iPos.xyz + rot(aPos, iRot.xyz, iRot.w) * iPos.w, 1.0);
    }`;
  const FS_BITS = `#version 300 es
    precision mediump float;
    in vec3 vN; in vec4 vC; out vec4 o;
    ${LIGHT}
    void main() { o = vec4(shade(normalize(vN), vC.rgb), 1.0) * vC.a; }`;

  // Compiles and links a shader program; throws with the log if the GPU refuses it.
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  // Uploads one mesh from voxelize() (its solid or glass half) for a mesh program.
  function upload(gl, prog, m) {
    if (!m.p.length) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = (data, name, size, type, norm) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const l = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, type, norm, 0, 0);
    };
    buf(new Float32Array(m.p), 'aPos', 3, gl.FLOAT, false);
    buf(new Float32Array(m.n), 'aNrm', 3, gl.FLOAT, false);
    buf(new Uint8Array(m.c), 'aCol', 4, gl.UNSIGNED_BYTE, true);
    gl.bindVertexArray(null);
    return { vao, count: m.p.length / 3 };
  }

  window.Voxel = { loadPixels, voxelize, M, program, upload, VS_MESH, FS_MESH, VS_BITS, FS_BITS };
})();
