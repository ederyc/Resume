/* Magetender feature card (homepage, Game Design).

   Three toys, all drawn from the game's own pixel art at its native size:
   1. The hanging sign. It swings on its chains (a damped pendulum you can brush with
      the cursor or knock with a click), drops in from the top of the card the first
      time it's seen, and inside it the wizard hat bobs and throws sparkles while the
      potion sloshes, reacting to the swing.
   2. The key art tilts toward the cursor, and a soft glow follows it across the card.
   3. Ingredients float around the key art as 3D voxel models built from their sprites.
      Click one and it bursts into its own voxels, then pops back.

   Everything starts only once the card is on screen and stops when it leaves.
   With reduced motion the sign and items are drawn once, still. */
(function () {
  'use strict';

  const card = document.querySelector('[data-mt-card]');
  if (!card) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- shared helpers ----------

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

  // Colors as the Uint32 an ImageData buffer holds on little-endian machines (ABGR).
  const U = (hex) => (0xff000000 | (parseInt(hex.slice(4, 6), 16) << 16) | (parseInt(hex.slice(2, 4), 16) << 8) | parseInt(hex.slice(0, 2), 16)) >>> 0;
  const R = (c) => c & 255, G = (c) => (c >>> 8) & 255, B = (c) => (c >>> 16) & 255, A = (c) => c >>> 24;

  // Starts and stops a set of loops with the card's visibility.
  const loops = [];
  let visible = false;
  function addLoop(loop) { loops.push(loop); if (visible) loop.start(); }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    loops.forEach((l) => (visible && !document.hidden ? l.start() : l.stop()));
  }, { rootMargin: '80px 0px' }).observe(card);
  document.addEventListener('visibilitychange', () => loops.forEach((l) => (visible && !document.hidden ? l.start() : l.stop())));

  function makeLoop(step) {
    let raf = 0, last = 0;
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      step(dt, now / 1000);
      raf = requestAnimationFrame(tick);
    };
    return {
      start() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(tick); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
    };
  }

  // ---------- 1. the hanging sign ----------

  async function initSign(root) {
    let img;
    try { img = await loadPixels(root.dataset.src); } catch { return; }
    const W = img.w, H = img.h, src = img.u32;
    const at = (x, y) => src[y * W + x];

    // The chains hang alone down to the top of the board; everything below is the board.
    let Ys = H;
    for (let y = 0; y < H && Ys === H; y++) for (let x = 80; x < W - 80; x++) if (A(at(x, y))) { Ys = y; break; }

    const isWood = (c) => { const r = R(c), g = G(c), b = B(c); return A(c) === 255 && r >= g && g >= b && r - b >= 6 && r < 160; };

    // The hat: everything hat-colored above its gold band, found by flood fill.
    const HAT = new Set(['2b1543', '3a1d5a', '52337b', '2d1747', '3c1f5d', '4b2b74', '391d59', '29153f', '533277', '1f1033',
      '1e1130', '170e23', '1f1230', '000401', '00040f'].map(U));
    const cut = (x) => 136 + (x - 478) * 0.69;
    const hatMask = new Uint8Array(W * H);
    {
      const stack = [[505, 125]];
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 478 || x > 546 || y < 104 || y > 170 || y >= cut(x)) continue;
        const i = y * W + x;
        if (hatMask[i] || !HAT.has(src[i])) continue;
        hatMask[i] = 1;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }
    const hatCols = [];
    for (let x = 478; x <= 546; x++) {
      let top = -1, bot = -1;
      for (let y = 104; y <= 170; y++) if (hatMask[y * W + x]) { if (top < 0) top = y; bot = y; }
      if (top < 0) continue;
      hatCols.push({ x, top, bot, stretch: !isWood(at(x, bot + 1)) });
    }

    // The board without the hat: fill under it with the wood grain beside it (it only shows under the lifted tip).
    const base = new Uint32Array(src);
    for (let y = 104; y <= 170; y++) for (let x = 478; x <= 546; x++) {
      if (!hatMask[y * W + x]) continue;
      let fill = 0;
      for (let d = 1; d < 70 && !fill; d++) {
        const r = x + d, l = x - d;
        if (r < W && !hatMask[y * W + r] && isWood(at(r, y))) fill = at(r, y);
        else if (l >= 0 && !hatMask[y * W + l] && isWood(at(l, y))) fill = at(l, y);
      }
      if (fill) base[y * W + x] = fill;
    }

    // The potion: the inside of the flask, less a glass wall two pixels thick.
    const LIQ = new Set(['c182e4', 'a556c7', 'd191f2', '7a4093'].map(U));
    const GLASS = new Set(['90a6dc', '9eadde', '738fb2', '76a3ca', '4f6b9c', '727dba', '6b8ec0', 'b7d9f6', '9fbfe2', '8a9bbb',
      '7b96ca', '6f91c3', '998fcd', '998fcc', 'ba99ea', '4a508f'].map(U));
    const inside = new Uint8Array(W * H);
    {
      const stack = [[75, 238]];
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 48 || x > 98 || y < 211 || y > 252) continue;
        const i = y * W + x;
        if (inside[i] || !(GLASS.has(src[i]) || LIQ.has(src[i]))) continue;
        inside[i] = 1;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }
    const flask = []; // { x, y, empty }
    const cols = new Map();
    let liquidVolume = 0;
    for (let y = 211; y <= 252; y++) for (let x = 48; x <= 98; x++) {
      let ok = inside[y * W + x];
      for (let dy = -2; ok && dy <= 2; dy++) for (let dx = -2; ok && dx <= 2; dx++) if (!inside[(y + dy) * W + x + dx]) ok = 0;
      if (!ok) continue;
      const p = { x, y, i: y * W + x, liquid: LIQ.has(src[y * W + x]) };
      flask.push(p);
      if (p.liquid) liquidVolume++;
      if (!cols.has(x)) cols.set(x, []);
      cols.get(x).push(p);
    }
    // Empty glass where the liquid used to be, shaded like the empty top of the flask.
    const rowSpan = new Map();
    flask.forEach((p) => { const s = rowSpan.get(p.y) || [p.x, p.x]; rowSpan.set(p.y, [Math.min(s[0], p.x), Math.max(s[1], p.x)]); });
    flask.forEach((p) => {
      if (!p.liquid) { p.empty = src[p.i]; return; }
      const [a, b] = rowSpan.get(p.y);
      const t = (p.x - a) / Math.max(1, b - a);
      p.empty = U(t < 0.2 ? '90a6dc' : t < 0.32 ? '727dba' : t < 0.68 ? '4f6b9c' : t < 0.8 ? '727dba' : '738fb2');
      base[p.i] = p.empty;
    });
    const flaskX = [...cols.keys()];
    const fx0 = Math.min(...flaskX), fx1 = Math.max(...flaskX), fcx = (fx0 + fx1) / 2;
    const fyMin = Math.min(...flask.map((p) => p.y)), fyMax = Math.max(...flask.map((p) => p.y));
    const inFlask = new Set(flask.map((p) => p.i));

    // The big sparkles either side of the title, found as the brightest pixel near where they sit.
    const stars = [[81, 195], [485, 192]].map(([sx, sy]) => {
      let best = [sx, sy], lum = -1;
      for (let y = sy - 8; y <= sy + 8; y++) for (let x = sx - 8; x <= sx + 8; x++) {
        const c = at(x, y), l = R(c) + G(c) + B(c);
        if (A(c) && l > lum) { lum = l; best = [x, y]; }
      }
      return best;
    });

    // ---------- the DOM: chains and board as two pixel canvases ----------
    const make = (cls, h) => {
      const c = document.createElement('canvas');
      c.className = cls;
      c.width = W;
      c.height = h;
      return c;
    };
    const chains = make('mt-sign-chains', Ys);
    const board = make('mt-sign-board', H - Ys);
    chains.style.height = (Ys / H) * 100 + '%';
    board.style.top = (Ys / H) * 100 + '%';
    board.style.height = ((H - Ys) / H) * 100 + '%';
    chains.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer.slice(0, Ys * W * 4)), W, Ys), 0, 0);
    const bctx = board.getContext('2d');
    const out = new ImageData(W, H - Ys);
    const out32 = new Uint32Array(out.data.buffer);
    const baseBoard = base.subarray(Ys * W);
    const srcBoard = src.subarray(Ys * W);
    root.append(chains, board);
    root.classList.add('is-live');

    const put = (x, y, c) => { if (x >= 0 && x < W && y >= Ys && y < H) out32[(y - Ys) * W + x] = c; };

    if (reduceMotion) { out32.set(srcBoard); bctx.putImageData(out, 0, 0); return; }

    // ---------- state ----------
    const S = { theta: 0, omega: 0, alpha: 0, drop: 0, dropV: 0, dropped: false,
      slosh: 0, sloshV: 0, wave: 0, lift: 0, liftT: 99, nextBob: 1.2, excite: 0, sparks: [], bubbles: [], pxTime: 0, t: 0 };
    const LIFT = [1, 2, 3, 3, 3, 2, 1, 0, 1, 0]; // native pixels, one step per 1/12 s

    function bob() {
      S.liftT = 0;
      for (let i = 0; i < 6; i++) spark(true);
    }
    function spark(burst) {
      S.sparks.push({ x: 536 + rand(-6, 4), y: 132 + rand(-10, 6), vx: rand(-0.25, 0.45), vy: rand(-1.1, -0.35) * (burst ? 1.3 : 1),
        life: Math.round(rand(6, 14)), age: 0, big: Math.random() < 0.35,
        c: [U('fff4d6'), U('edd8a3'), U('d191f2'), U('b7d9f6')][Math.floor(Math.random() * 4)] });
    }

    function drawPixels() {
      out32.set(baseBoard);

      // potion: find the surface height that keeps the volume, then fill below it
      const tilt = Math.tan(S.slosh), amp = 0.5 + Math.min(1.2, Math.abs(S.sloshV) * 0.6);
      const surf = (x, L) => L + tilt * (x - fcx) + amp * Math.sin(x * 0.55 + S.wave);
      let lo = fyMin - 30, hi = fyMax + 30;
      for (let k = 0; k < 18; k++) {
        const L = (lo + hi) / 2;
        let n = 0;
        for (const p of flask) if (p.y >= surf(p.x, L)) n++;
        if (n > liquidVolume) lo = L; else hi = L;
      }
      const L = (lo + hi) / 2;
      for (const p of flask) {
        const s = surf(p.x, L);
        if (p.y < s) { out32[p.i - Ys * W] = p.empty; continue; }
        const depth = p.y - Math.ceil(s);
        let c = U('c182e4');
        if (depth <= 0) c = U('d191f2');
        else if (depth >= 2) {
          const swirl = Math.sin(p.x * 0.38 + p.y * 0.52 + S.t * 1.6) + Math.sin(p.x * 0.19 - p.y * 0.71 - S.t * 1.1) + 0.6 * Math.sin((p.x + p.y) * 0.9 + S.t * 2.4);
          if (swirl > 1.5) c = U('a556c7');
          if (!inFlask.has(p.i + 1) || !inFlask.has(p.i + W)) c = p.x > fcx && !inFlask.has(p.i + W) ? U('7a4093') : U('a556c7');
        }
        out32[p.i - Ys * W] = c;
      }
      if (Math.random() < 0.18) S.bubbles.push({ x: Math.round(rand(fx0 + 4, fx1 - 4)), y: fyMax - 1 });
      S.bubbles = S.bubbles.filter((b) => {
        b.y -= 1;
        if (b.y < surf(b.x, L) + 1) return false;
        if (inFlask.has(b.y * W + b.x)) put(b.x, b.y, U('d191f2'));
        return true;
      });

      // hat: lifted by a few pixels; columns resting on the band stretch, the tip lifts off the wood
      const k = S.lift;
      for (const col of hatCols) {
        const { x, top, bot, stretch } = col;
        for (let y = top - k; y <= bot; y++) {
          let sy;
          if (stretch) sy = Math.round(top + ((y - (top - k)) * (bot - top)) / Math.max(1, bot - top + k));
          else { sy = y + k; if (sy > bot) break; }
          if (hatMask[sy * W + x]) put(x, y, src[sy * W + x]);
        }
      }

      // the two big sparkles twinkle in turn
      stars.forEach(([sx, sy], n) => {
        const ph = (S.t * 0.8 + n * 0.5) % 1;
        if (ph > 0.18) return;
        const arm = ph < 0.06 || ph > 0.12 ? 3 : 5;
        for (let d = 1; d <= arm; d++) {
          const c = d === arm ? U('edd8a3') : U('fff4d6');
          put(sx + d, sy, c); put(sx - d, sy, c); put(sx, sy + d, c); put(sx, sy - d, c);
        }
        put(sx, sy, U('ffffff'));
      });

      // magic sparks off the hat
      S.sparks = S.sparks.filter((p) => {
        p.age++;
        p.x += p.vx; p.y += p.vy; p.vy *= 0.94;
        if (p.age > p.life) return false;
        const x = Math.round(p.x), y = Math.round(p.y);
        const on = p.age < p.life - 3 || p.age % 2 === 0;
        if (!on) return true;
        put(x, y, p.c);
        if (p.big && p.age < p.life * 0.6) { put(x + 1, y, p.c); put(x - 1, y, p.c); put(x, y + 1, p.c); put(x, y - 1, p.c); put(x, y, U('ffffff')); }
        return true;
      });

      bctx.putImageData(out, 0, 0);
    }

    // ---------- pointer: brush the sign, knock it, stir the potion, excite the hat ----------
    let lastPX = null;
    const toNative = (e) => {
      const r = root.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    root.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (lastPX) {
        const dt = Math.max(8, now - lastPX.t) / 1000;
        const vx = (e.clientX - lastPX.x) / dt;
        const [nx, ny] = toNative(e);
        if (ny > Ys - 4) S.omega += clamp(vx * 0.00009, -0.25, 0.25);
        if (Math.hypot(nx - 75, ny - 228) < 30) S.sloshV += clamp(vx * 0.0006, -1.5, 1.5);
        if (Math.hypot(nx - 512, ny - 128) < 34) S.excite = 1;
      }
      lastPX = { x: e.clientX, y: e.clientY, t: now };
    });
    root.addEventListener('pointerleave', () => { lastPX = null; });
    root.addEventListener('pointerdown', (e) => {
      const [nx] = toNative(e);
      S.omega += (nx < W / 2 ? 1 : -1) * rand(1.1, 1.5);
      bob();
    });

    // ---------- the loop ----------
    S.drop = -1;
    chains.style.transform = board.style.transform = 'translateY(-100%)';
    addLoop(makeLoop((dt) => {
      S.t += dt;
      if (!S.dropped) { S.dropped = true; S.omega = 0.9; }
      // drop-in spring, then the pendulum
      S.dropV += (-130 * S.drop - 11 * S.dropV) * dt;
      S.drop += S.dropV * dt;
      const prevOmega = S.omega;
      S.omega += (-9 * S.theta - 0.5 * S.omega) * dt;
      S.theta += S.omega * dt;
      S.theta = clamp(S.theta, -0.6, 0.6);
      S.alpha = (S.omega - prevOmega) / Math.max(dt, 1e-3);
      // the liquid lags behind the swing
      S.sloshV += (-38 * S.slosh - 2.4 * S.sloshV - 0.05 * S.alpha + 0.4 * Math.sin(S.t * 1.7) * 0.2) * dt;
      S.slosh = clamp(S.slosh + S.sloshV * dt, -0.7, 0.7);
      S.wave += dt * (2.5 + Math.abs(S.sloshV) * 3);

      const rootH = root.offsetHeight, th = S.theta, chainPx = (rootH * Ys) / H;
      const dropPx = S.drop * rootH;
      chains.style.transform = `translateY(${dropPx}px) skewX(${-th}rad) scaleY(${Math.cos(th)})`;
      board.style.transform = `translate(${-chainPx * Math.sin(th)}px, ${dropPx - chainPx * (1 - Math.cos(th))}px) rotate(${(-th * 0.22).toFixed(4)}rad)`;

      // pixel-art internals step at 12 frames a second, like the game
      S.pxTime += dt;
      if (S.pxTime >= 1 / 12) {
        S.pxTime %= 1 / 12;
        S.nextBob -= 1 / 12;
        if (S.nextBob <= 0) { bob(); S.nextBob = S.excite ? rand(0.7, 1.1) : rand(2.2, 3.4); S.excite = 0; }
        S.lift = S.liftT < LIFT.length ? LIFT[S.liftT++] : 0;
        if (Math.random() < 0.22) spark(false);
        drawPixels();
      }
    }));
    drawPixels();
  }

  // ---------- 2. tilt and glow ----------

  function initTilt() {
    const art = card.querySelector('[data-mt-art]');
    if (!art || reduceMotion || !finePointer) return;
    let raf = 0, pt = null;
    const apply = () => {
      raf = 0;
      if (!pt) return;
      const a = art.getBoundingClientRect(), c = card.getBoundingClientRect();
      const nx = clamp((pt.x - (a.left + a.width / 2)) / (c.width / 2), -1, 1);
      const ny = clamp((pt.y - (a.top + a.height / 2)) / (c.height / 2), -1, 1);
      art.style.setProperty('--rx', `${(-ny * 6).toFixed(2)}deg`);
      art.style.setProperty('--ry', `${(nx * 8).toFixed(2)}deg`);
      art.style.setProperty('--px', nx.toFixed(3));
      art.style.setProperty('--py', ny.toFixed(3));
      card.style.setProperty('--gx', `${(((pt.x - c.left) / c.width) * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${(((pt.y - c.top) / c.height) * 100).toFixed(1)}%`);
    };
    card.addEventListener('pointermove', (e) => {
      pt = { x: e.clientX, y: e.clientY };
      art.classList.add('is-tracking');
      if (!raf) raf = requestAnimationFrame(apply);
    });
    card.addEventListener('pointerleave', () => {
      pt = null;
      art.classList.remove('is-tracking');
      ['--rx', '--ry', '--px', '--py'].forEach((p) => art.style.removeProperty(p));
      card.style.removeProperty('--gx');
      card.style.removeProperty('--gy');
    });
  }

  // ---------- 3. voxel items ----------

  // Splits a sprite into its separate pieces (the three eyeballs come as one sprite).
  function pieces(img) {
    const { w, h, data } = img;
    const seen = new Uint8Array(w * h), out = [];
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || data[s * 4 + 3] < 20) continue;
      const px = [], stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i / w) | 0;
        px.push(i);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, j = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] || data[j * 4 + 3] < 20) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      if (px.length < 30) continue;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      px.forEach((i) => { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
      const pw = x1 - x0 + 1, ph = y1 - y0 + 1, d = new Uint8ClampedArray(pw * ph * 4);
      px.forEach((i) => { const x = i % w, y = (i / w) | 0, j = ((y - y0) * pw + x - x0) * 4; for (let k = 0; k < 4; k++) d[j + k] = data[i * 4 + k]; });
      out.push({ w: pw, h: ph, data: d });
    }
    return out;
  }

  // Extrudes a sprite into voxels. Depth grows with the distance from the outline, so
  // round things come out round: each pixel becomes a column, terraced like clay.
  function voxelize(sp, puff) {
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
      hd[i] = Math.max(0.5, Math.round(puff * Math.sqrt(Math.max(0, Rmax * Rmax - (Rmax - e) * (Rmax - e))) * 2) / 2);
    }
    const H = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : hd[y * w + x]);
    const solid = { p: [], n: [], c: [] }, glass = { p: [], n: [], c: [] }, voxels = [];
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
      if (col[3] >= 245) voxels.push([x0 + 0.5, yt - 0.5, rand(-z, z) * 0.8, col]);
    }
    return { w, h, solid, glass, voxels };
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

  async function initItems(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    const program = (vs, fs) => {
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
    };
    let meshProg, bitsProg;
    try { meshProg = program(VS_MESH, FS_MESH); bitsProg = program(VS_BITS, FS_BITS); } catch { return; }
    const loc = (p, n) => gl.getAttribLocation(p, n), uni = (p, n) => gl.getUniformLocation(p, n);

    function upload(m) {
      if (!m.p.length) return null;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = (data, name, size, type, norm) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const l = loc(meshProg, name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, type, norm, 0, 0);
      };
      buf(new Float32Array(m.p), 'aPos', 3, gl.FLOAT, false);
      buf(new Float32Array(m.n), 'aNrm', 3, gl.FLOAT, false);
      buf(new Uint8Array(m.c), 'aCol', 4, gl.UNSIGNED_BYTE, true);
      gl.bindVertexArray(null);
      return { vao, count: m.p.length / 3 };
    }

    // the sprites, cut into separate pieces and extruded
    const specs = [
      ['assets/magetender/mug.png', 0.32], ['assets/magetender/salt.png', 0.5], ['assets/magetender/horn.png', 0.85], ['assets/magetender/eyes.png', 0.9],
    ];
    let sprites;
    try { sprites = await Promise.all(specs.map(([s]) => loadPixels(s))); } catch { return; }
    const models = [];
    sprites.forEach((img, k) => pieces(img).forEach((sp) => {
      const v = voxelize(sp, specs[k][1]);
      models.push({ ...v, solidGL: upload(v.solid), glassGL: upload(v.glass) });
    }));
    // mug, salt, horn, eye, eye, eye
    const layout = [
      { m: 0, u: 0.13, v: 0.22, z: 1.2, size: 0.27 },
      { m: 1, u: 0.87, v: 0.17, z: 0.6, size: 0.22 },
      { m: 2, u: 0.91, v: 0.64, z: 1.6, size: 0.2 },
      { m: 3, u: 0.1, v: 0.74, z: 1.9, size: 0.1 },
      { m: 4, u: 0.75, v: 0.9, z: 0.9, size: 0.09 },
      { m: 5, u: 0.47, v: 0.06, z: 0.4, size: 0.085 },
    ].filter((it) => models[it.m]);
    const items = layout.map((it, n) => ({ ...it, ph: rand(0, 6.28), sp: rand(0.55, 0.9), ox: 0, oy: 0, vx: 0, vy: 0,
      yaw: 0, pitch: 0, state: 'in', scale: reduceMotion ? 1 : 0, scaleV: 0, gone: 0, delay: 0.15 + n * 0.08, spin: 0, spinV: 0 }));

    // particle cube
    const cubeVao = gl.createVertexArray();
    gl.bindVertexArray(cubeVao);
    const cp = [], cn = [];
    const face = (n, u, v) => {
      const c = n.map((x) => x * 0.5), corner = (a, b) => c.map((x, i) => x + u[i] * a * 0.5 + v[i] * b * 0.5);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { cp.push(...corner(a, b)); cn.push(...n); }
    };
    face([0, 0, 1], [1, 0, 0], [0, 1, 0]); face([0, 0, -1], [-1, 0, 0], [0, 1, 0]);
    face([1, 0, 0], [0, 0, -1], [0, 1, 0]); face([-1, 0, 0], [0, 0, 1], [0, 1, 0]);
    face([0, 1, 0], [1, 0, 0], [0, 0, -1]); face([0, -1, 0], [1, 0, 0], [0, 0, 1]);
    const attr = (data, name, size, type, norm, div) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, div ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      const l = loc(bitsProg, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, type, norm, 0, 0);
      if (div) gl.vertexAttribDivisor(l, 1);
      return b;
    };
    attr(new Float32Array(cp), 'aPos', 3, gl.FLOAT, false, 0);
    attr(new Float32Array(cn), 'aNrm', 3, gl.FLOAT, false, 0);
    const MAXB = 600;
    const bPos = new Float32Array(MAXB * 4), bCol = new Uint8Array(MAXB * 4), bRot = new Float32Array(MAXB * 4);
    const bufPos = attr(bPos, 'iPos', 4, gl.FLOAT, false, 1);
    const bufCol = attr(bCol, 'iCol', 4, gl.UNSIGNED_BYTE, true, 1);
    const bufRot = attr(bRot, 'iRot', 4, gl.FLOAT, false, 1);
    gl.bindVertexArray(null);
    let bits = [];

    // camera and layout
    const FOV = (28 * Math.PI) / 180, CAMZ = 12;
    let cw = 1, ch = 1, aspect = 1, PV = null;
    const halfH = (z) => Math.tan(FOV / 2) * (CAMZ - z);
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      cw = r.width; ch = r.height; aspect = cw / ch;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      PV = M.mul(M.persp(FOV, aspect, 0.1, 40), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -CAMZ, 1]);
    };
    resize();
    new ResizeObserver(resize).observe(canvas);

    const world = (u, v, z) => { const hh = halfH(z); return [(u - 0.5) * 2 * hh * aspect, (0.5 - v) * 2 * hh, z]; };
    const screen = (it) => [(it.u + it.ox) * cw, (it.v + it.oy) * ch];
    const radius = (it) => it.size * ch * 0.55;

    // pointer: push items away, tilt them toward the cursor, pop on click
    let pointer = null;
    const host = card;
    host.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      const over = items.some((it) => it.state === 'idle' && Math.hypot(...screen(it).map((s, k) => s - [pointer.x, pointer.y][k])) < radius(it));
      canvas.closest('[data-mt-art]').classList.toggle('is-poking', over);
    });
    host.addEventListener('pointerleave', () => { pointer = null; });
    host.addEventListener('pointerdown', (e) => {
      if (reduceMotion) return;
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let hit = null, best = Infinity;
      for (const it of items) {
        if (it.state !== 'idle') continue;
        const [sx, sy] = screen(it), d = Math.hypot(sx - x, sy - y);
        if (d < radius(it) && d < best) { best = d; hit = it; }
      }
      if (hit) pop(hit);
    });
    let lastScroll = window.scrollY;
    window.addEventListener('scroll', () => {
      const d = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      if (!visible || reduceMotion) return;
      items.forEach((it) => { it.vy += clamp(-d * 0.00035 * (1 + it.z * 0.3), -0.04, 0.04); it.spinV += clamp(d * 0.004, -0.3, 0.3); });
    }, { passive: true });

    function modelOf(it, t) {
      const m = models[it.m];
      const bobY = reduceMotion ? 0 : Math.sin(t * it.sp + it.ph) * 0.012;
      const [x, y, z] = world(it.u + it.ox, it.v + it.oy + bobY, it.z);
      const s = (it.size * 2 * halfH(it.z)) / Math.max(m.h, m.w * 0.8) * it.scale;
      const yaw = Math.sin(t * it.sp * 0.6 + it.ph) * 0.55 + it.yaw + it.spin;
      const pitch = Math.sin(t * it.sp * 0.5 + it.ph * 1.7) * 0.22 + it.pitch;
      const roll = Math.sin(t * it.sp * 0.4 + it.ph * 0.6) * 0.12;
      return M.model(x, y, z, pitch, yaw, roll, s);
    }

    function pop(it) {
      const t = performance.now() / 1000, mm = modelOf(it, t), m = models[it.m];
      const center = M.apply(mm, [0, 0, 0]);
      const pick = m.voxels.slice().sort(() => Math.random() - 0.5).slice(0, 48);
      const s = Math.hypot(mm[0], mm[1], mm[2]);
      pick.forEach(([x, y, z, col]) => {
        const p = M.apply(mm, [x, y, z]);
        const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
        const len = Math.hypot(...d) || 1;
        const sp = rand(3, 6.5);
        const ax = [rand(-1, 1), rand(-1, 1), rand(-1, 1)], al = Math.hypot(...ax) || 1;
        bits.push({ p, v: [d[0] / len * sp + rand(-0.6, 0.6), d[1] / len * sp + rand(1.2, 3.2), d[2] / len * sp + rand(0.5, 2)],
          axis: ax.map((a) => a / al), ang: rand(0, 6), spin: rand(-10, 10), size: s * rand(2.2, 3.6), col, age: 0, life: rand(0.9, 1.4) });
      });
      if (bits.length > MAXB) bits = bits.slice(bits.length - MAXB);
      it.state = 'gone';
      it.gone = 1.1;
      it.scale = 0;
    }

    let t0 = performance.now() / 1000;
    function draw(t, dt) {
      // items
      for (const it of items) {
        if (it.state === 'gone') {
          it.gone -= dt;
          if (it.gone <= 0) { it.state = 'in'; it.delay = 0; it.scale = 0; it.scaleV = 0; it.ox = 0; it.oy = 0; }
          continue;
        }
        if (it.state === 'in') {
          if (it.delay > 0) { it.delay -= dt; continue; }
          it.scaleV += (-170 * (it.scale - 1) - 11 * it.scaleV) * dt;
          it.scale += it.scaleV * dt;
          if (Math.abs(it.scale - 1) < 0.002 && Math.abs(it.scaleV) < 0.02) { it.scale = 1; it.state = 'idle'; }
        }
        // spring back home, pushed by the cursor
        let fx = -40 * it.ox - 7 * it.vx, fy = -40 * it.oy - 7 * it.vy;
        let tYaw = 0, tPitch = 0;
        if (pointer) {
          const [sx, sy] = screen(it), dx = sx - pointer.x, dy = sy - pointer.y, d = Math.hypot(dx, dy), r = radius(it) * 1.8;
          if (d < r && d > 0.1) { const k = (1 - d / r) * 2.2; fx += (dx / d) * k / aspect; fy += (dy / d) * k; }
          tYaw = clamp(-dx / cw, -0.6, 0.6) * 1.2;
          tPitch = clamp(-dy / ch, -0.6, 0.6) * 0.8;
        }
        it.vx += fx * dt; it.vy += fy * dt;
        it.ox += it.vx * dt; it.oy += it.vy * dt;
        it.yaw += (tYaw - it.yaw) * Math.min(1, dt * 3);
        it.pitch += (tPitch - it.pitch) * Math.min(1, dt * 3);
        it.spinV += -it.spinV * Math.min(1, dt * 1.8);
        it.spin += it.spinV * dt;
        it.spin += (-it.spin) * Math.min(1, dt * 0.8);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.useProgram(meshProg);
      gl.uniformMatrix4fv(uni(meshProg, 'uPV'), false, PV);
      const uModel = uni(meshProg, 'uModel'), uAlpha = uni(meshProg, 'uAlpha');
      gl.uniform1f(uAlpha, 1);
      const shown = items.filter((it) => it.scale > 0.001 && it.state !== 'gone').map((it) => [it, modelOf(it, t)]);
      for (const [it, mm] of shown) {
        const g = models[it.m].solidGL;
        if (!g) continue;
        gl.uniformMatrix4fv(uModel, false, mm);
        gl.bindVertexArray(g.vao);
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
      }
      // particles
      bits = bits.filter((b) => (b.age += dt) < b.life);
      if (bits.length) {
        bits.forEach((b, i) => {
          b.v[1] -= 9.5 * dt;
          b.p[0] += b.v[0] * dt; b.p[1] += b.v[1] * dt; b.p[2] += b.v[2] * dt;
          b.ang += b.spin * dt;
          const k = b.age / b.life, s = b.size * (1 - k * k);
          bPos.set([b.p[0], b.p[1], b.p[2], s], i * 4);
          bCol.set([b.col[0], b.col[1], b.col[2], 255], i * 4);
          bRot.set([b.axis[0], b.axis[1], b.axis[2], b.ang], i * 4);
        });
        gl.useProgram(bitsProg);
        gl.uniformMatrix4fv(uni(bitsProg, 'uPV'), false, PV);
        gl.bindVertexArray(cubeVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, bPos, 0, bits.length * 4);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.bufferSubData(gl.ARRAY_BUFFER, 0, bCol, 0, bits.length * 4);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufRot); gl.bufferSubData(gl.ARRAY_BUFFER, 0, bRot, 0, bits.length * 4);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, bits.length);
      }
      // glass last, see-through
      gl.useProgram(meshProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const [it, mm] of shown) {
        const g = models[it.m].glassGL;
        if (!g) continue;
        gl.uniformMatrix4fv(uModel, false, mm);
        gl.bindVertexArray(g.vao);
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
      }
      gl.depthMask(true);
      gl.bindVertexArray(null);
    }

    canvas.classList.add('is-live');
    if (reduceMotion) { draw(0, 0); return; }
    addLoop(makeLoop((dt, now) => draw(now - t0, dt)));
  }

  const sign = card.querySelector('[data-mt-sign]');
  if (sign) initSign(sign);
  initTilt();
  const itemsCanvas = card.querySelector('[data-mt-items]');
  if (itemsCanvas) initItems(itemsCanvas);
})();
