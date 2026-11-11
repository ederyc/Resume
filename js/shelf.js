/* The sections shelf (landing page, under the bio).

   Three hand-made objects stand on a wooden plank, one per section: a game controller,
   a mouse cursor and a laptop. They're pixel-art sprites (the same pixels as each
   section's header icon) extruded into 3D voxels by js/voxel.js. They sway, lean toward
   the cursor, and hop and spin when their tag is hovered or focused. A stack of books
   and a potted cactus sit at the plank's ends when there's room, and everything on the
   shelf casts a soft shadow on the plank (spans in .shelf-plank).

   The paper tag under each object is the real link. Clicking an object or its tag
   tosses the object off the shelf; the page scrolls with it, and it lands in its
   section's icon ring. The flight is drawn on a fixed canvas over the page, created
   the first time it's needed.

   With reduced motion the objects are drawn once, still, and the links jump as normal.
   Without WebGL the small icons in the markup stay. */
(function () {
  'use strict';

  const shelf = document.querySelector('[data-shelf]');
  if (!shelf || !window.Voxel) return;
  const { voxelize, M, program, upload, VS_MESH, FS_MESH } = window.Voxel;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

  // ---------- sprites ----------
  // Each grid is the object at its native pixel size; '.' is empty.

  const CONTROLLER = [ // the same silhouette as #icon-controller, with the holes filled in
    '.......bbbbbbbbbb.......',
    '.....bbbbbbbbbbbbbb.....',
    '..bbbbbbbbbbbbbbbbbbbb..',
    'bbbbbbbbbbbbbbbbbbYYbbbb',
    'bbbbddbbbbbbbbbbbbYYbbbb',
    'bbbbddbbbbbbbbbbbbbbbbbb',
    'bbddddddbbbbbbbbBBbbRRbb',
    'bbddddddbbbbbbbbBBbbRRbb',
    'bbbbddbbbbbbbbbbbbbbbbbb',
    '.bbbddbbbbbbbbbbbbGGbbb.',
    '..bbbbbbbbbbbbbbbbGGbb..',
    '....bbbbbbbbbbbbbbbb....',
    '......bbbbbbbbbbbb......',
  ];
  const LAPTOP = [ // the same grid as #icon-laptop: a little sun-and-hills composition on screen
    '..kkkkkkkkkkkkkkkkkkkk..',
    '..kvvvvvvvvvvvvvvvvvvk..',
    '..kvvvvvvvvvvvvssvvvvk..',
    '..kvvvvvvvvvvvssssvvvk..',
    '..kvvvvvvvvvvvssssvvvk..',
    '..kvvvvvvvvvvvvssvvvvk..',
    '..kvvvvvpvvvvvvvvvvvvk..',
    '..kvvvvpppvvvvvvvvqvvk..',
    '..kvvvpppppvvvvvvqqqvk..',
    '..kvvpppppppvvvvqqqqqk..',
    '..kvpppppppppvvqqqqqqk..',
    '..kpppppppppppqqqqqqqk..',
    '..kkkkkkkkkkkkkkkkkkkk..',
    '...hhhhhhhhhhhhhhhhhh...',
    '.mmmmmmmmmmmmmmmmmmmmmm.',
    'nnnnnnnnnnnnnnnnnnnnnnnn',
    '.nnnnnnnnnnnnnnnnnnnnnn.',
  ];
  const CURSOR = [ // the classic arrow, outline included
    'X...........',
    'XX..........',
    'XwX.........',
    'XwwX........',
    'XwwwX.......',
    'XwwwwX......',
    'XwwwwwX.....',
    'XwwwwwwX....',
    'XwwwwwwwX...',
    'XwwwwwwwwX..',
    'XwwwwwwwwwX.',
    'XwwwwwXXXXXX',
    'XwwXwwX.....',
    'XwX.XwwX....',
    'XX..XwwX....',
    'X....XwwX...',
    '.....XwwX...',
    '......XX....',
  ];

  // decorations for the plank's ends
  const BOOKS = [
    '...TTTTTTTTTTTTTT...',
    '...TTTyyTTTTTTTTT...',
    '...TTTTTTTTTTTTTT...',
    '...tttttttttttttt...',
    '.RRRRRRRRRRRRRRRRR..',
    '.RRRRyRRRRRRRRyRRR..',
    '.RRRRRRRRRRRRRRRRR..',
    '.rrrrrrrrrrrrrrrrr..',
  ];
  const CACTUS = [
    '......FF......',
    '.....GgGG.....',
    '.....GgGG.GG..',
    '.GG..GgGG.GG..',
    '.GG..GgGG.GG..',
    '.GG..GgGGGGG..',
    '.GGGGGgGGGG...',
    '..GGGGgGG.....',
    '.....GgGG.....',
    '.....GgGG.....',
    '.....GgGG.....',
    '..PPPPPPPPPP..',
    '..pPPPPPPPPp..',
    '...PPPPPPPP...',
    '...PPPPPPPP...',
    '....pPPPPp....',
  ];

  const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

  // Paints a grid into RGBA pixels. colorAt(char, x, y) returns a hex color or null.
  function paint(rows, colorAt, outline) {
    const pad = outline ? 1 : 0;
    const h = rows.length + pad * 2, w = rows[0].length + pad * 2;
    const data = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, hex) => { const i = (y * w + x) * 4; data.set([...rgb(hex), 255], i); };
    const filled = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && rows[y][x] !== '.';
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const hex = ch === '.' ? null : colorAt(ch, x, y);
      if (hex) set(x + pad, y + pad, hex);
    }));
    // a one-pixel dark outline around the whole shape, like the game's sprites
    if (outline) {
      for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
        if (filled(x, y)) continue;
        if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) set(x + pad, y + pad, outline);
      }
    }
    return { w, h, data };
  }

  const OBJECTS = {
    controller: {
      sprite: paint(CONTROLLER, (ch, x, y) => ({
        d: '2a1c33', Y: 'f2c14e', B: '6fa8dc', R: 'e2603f', G: '86d86c',
        b: y <= 1 ? 'c3a6ea' : y === 2 ? 'a98ad8' : y >= 10 ? '6a4a97' : '8e6bbf',
      })[ch], '2a1c33'),
      puff: 0.5,
      foot: 0.8,
    },
    laptop: {
      sprite: paint(LAPTOP, (ch, x, y) => ({
        k: '2e2a38', h: '54506a', s: 'f2c14e', p: '8e5670', q: '3f6b55',
        v: y <= 2 ? 'fbe3c8' : y <= 5 ? 'f5c6b8' : 'e7b0c7',
        m: 'd6d1e2', n: '8d879e',
      })[ch], '1e1a15'),
      puff: 0.4,
      depth: 1.5, // a flat slab, so the screen doesn't terrace
      foot: 0.95,
    },
    cursor: {
      sprite: paint(CURSOR, (ch) => (ch === 'X' ? '1e1a15' : 'fbf7ef'), null),
      puff: 0.5,
      foot: 0.55,
    },
    books: {
      sprite: paint(BOOKS, (ch) => ({ T: '4e8c86', t: '36635f', y: 'e8c46a', R: 'a5463c', r: '7a3029' })[ch], '2a1c33'),
      puff: 0.45,
      foot: 0.95,
    },
    cactus: {
      sprite: paint(CACTUS, (ch) => ({ F: 'f08bb0', G: '5e9e62', g: '8ccb7e', P: 'c96f45', p: '9c4f2e' })[ch], '2a1c33'),
      puff: 0.5,
      foot: 0.62,
    },
  };
  for (const o of Object.values(OBJECTS)) o.mesh = voxelize(o.sprite, o.puff, o.depth);
  // the largest side among the section objects, so they all share one pixel size
  const LINKED = ['controller', 'cursor', 'laptop'];
  const SPAN = Math.max(...LINKED.map((n) => Math.max(OBJECTS[n].sprite.w * 0.62, OBJECTS[n].sprite.h)));
  const WIDEST = Math.max(...LINKED.map((n) => OBJECTS[n].sprite.w));

  // ---------- a small scene: a canvas, a camera, the three models ----------

  function makeScene(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) return null;
    let prog;
    try { prog = program(gl, VS_MESH, FS_MESH); } catch { return null; }
    const uPV = gl.getUniformLocation(prog, 'uPV'), uModel = gl.getUniformLocation(prog, 'uModel'), uAlpha = gl.getUniformLocation(prog, 'uAlpha');
    const models = {};
    for (const [name, o] of Object.entries(OBJECTS)) models[name] = upload(gl, prog, o.mesh.solid);

    const FOV = (26 * Math.PI) / 180, CAMZ = 12;
    const halfH = (z) => Math.tan(FOV / 2) * (CAMZ - z);
    let cw = 1, ch = 1, aspect = 1, PV = null;

    return {
      resize(w, h) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cw = Math.max(1, w); ch = Math.max(1, h); aspect = cw / ch;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        PV = M.mul(M.persp(FOV, aspect, 0.1, 40), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -CAMZ, 1]);
      },
      // list: [{ name, x, y (canvas px, the object's center), px (css px per sprite pixel), rx, ry, rz, alpha }]
      draw(list) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (!list.length) return;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(prog);
        gl.uniformMatrix4fv(uPV, false, PV);
        for (const o of list) {
          const m = models[o.name];
          if (!m || o.px <= 0.01) continue;
          const z = o.z || 0, hh = halfH(z);
          const x = ((o.x / cw) * 2 - 1) * hh * aspect, y = (1 - (o.y / ch) * 2) * hh;
          gl.uniformMatrix4fv(uModel, false, M.model(x, y, z, o.rx, o.ry, o.rz, (o.px / ch) * 2 * hh));
          gl.uniform1f(uAlpha, o.alpha ?? 1);
          gl.bindVertexArray(m.vao);
          gl.drawArrays(gl.TRIANGLES, 0, m.count);
        }
        gl.bindVertexArray(null);
      },
    };
  }

  // ---------- the shelf ----------

  const canvas = shelf.querySelector('.shelf-canvas');
  const plank = shelf.querySelector('.shelf-plank');
  const scene = canvas && makeScene(canvas);
  if (!scene) return;
  shelf.classList.add('is-live');

  const fresh = (name, n) => ({ name, ph: n * 2.1 + 0.4, hover: 0, hoverV: 0, spin: 0, spinV: 0, spinTo: 0, yaw: 0, pitch: 0,
    wob: 0, wobV: 0, away: false, scale: 1, scaleV: 0 });
  const items = [...shelf.querySelectorAll('.shelf-item')]
    .map((el, n) => ({ ...fresh(el.dataset.object, n), el, spot: el.querySelector('.shelf-spot') }))
    .filter((it) => OBJECTS[it.name]);
  // the decorations: books on the left end, the cactus on the right (side -1 / 1)
  const decor = [{ ...fresh('books', 3), side: -1, turn: -0.2 }, { ...fresh('cactus', 4), side: 1, turn: 0.3 }];
  const everything = [...items, ...decor];
  for (const o of everything) {
    o.shadow = document.createElement('span');
    o.shadow.className = 'shelf-shadow';
    plank.append(o.shadow);
  }

  let cr = null, px = 4, plankTop = 0;
  const DECOR_SCALE = 0.72;
  const sizeOf = (o) => px * (o.side ? DECOR_SCALE : 1);
  function layout() {
    cr = canvas.getBoundingClientRect();
    scene.resize(cr.width, cr.height);
    const s = items[0] && items[0].spot.getBoundingClientRect();
    if (s) px = Math.min((s.width * 0.82) / WIDEST, (s.height * 0.9) / SPAN);
    const pr = plank.getBoundingClientRect(), lr = shelf.querySelector('.shelf-list').getBoundingClientRect();
    plankTop = pr.top - cr.top;
    for (const it of items) {
      const r = it.spot.getBoundingClientRect();
      it.cx = r.left + r.width / 2 - cr.left;
    }
    // the decorations only come out where the plank reaches past the tags far enough to hold them
    const room = (pr.width - lr.width) / 2;
    for (const d of decor) {
      const w = OBJECTS[d.name].sprite.w * sizeOf(d);
      d.hidden = room < w * 0.85 + 6;
      d.cx = (d.side < 0 ? pr.left + room * 0.52 : pr.right - room * 0.52) - cr.left;
    }
    // each shadow sits on the plank's top face under its object
    for (const o of everything) {
      const w = OBJECTS[o.name].sprite.w * sizeOf(o) * OBJECTS[o.name].foot;
      o.shadow.style.width = `${w.toFixed(1)}px`;
      o.shadow.style.left = `${(o.cx + cr.left - pr.left - w / 2).toFixed(1)}px`;
    }
  }

  // where an object stands: its center, resting on the plank's top face
  const restY = (it) => plankTop + 8 - (OBJECTS[it.name].sprite.h * sizeOf(it)) / 2;

  function pose(it, t) {
    const still = reduceMotion ? 0 : 1;
    if (it.side) { // decorations don't hop or bob; they lean a little and wobble when jostled
      return {
        name: it.name, x: it.cx, y: restY(it), px: sizeOf(it), z: 0,
        rx: 0.2 + it.pitch * 0.4, ry: it.turn + it.yaw * 0.4,
        rz: it.wob + (it.name === 'cactus' ? Math.sin(t * 0.9 + it.ph) * 0.025 * still : 0),
      };
    }
    const lift = it.hover * px * 3.2 + Math.sin(t * 1.1 + it.ph) * px * 0.25 * still;
    it.lift = lift;
    return {
      name: it.name, x: it.cx, y: restY(it) - lift, px: px * it.scale * (1 + it.hover * 0.06), z: 0,
      rx: 0.16 + it.pitch + it.hover * 0.1,
      ry: -0.28 + Math.sin(t * 0.55 + it.ph) * 0.2 * still + it.yaw + it.spin,
      rz: Math.sin(t * 0.7 + it.ph * 1.3) * 0.05 * still - it.hover * 0.06 + it.wob,
    };
  }

  let pointer = null;
  if (finePointer) {
    window.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  }
  for (const it of items) {
    const on = () => { if (!it.away && it.hover < 0.5) it.spinTo += Math.PI * 2; it.target = 1; wake(); };
    const off = () => { it.target = 0; wake(); };
    it.el.addEventListener('pointerenter', on);
    it.el.addEventListener('pointerleave', off);
    it.el.addEventListener('focus', on);
    it.el.addEventListener('blur', off);
    it.el.addEventListener('click', (e) => {
      if (reduceMotion || flight || it.away) return; // reduced motion: a plain jump to the section
      const section = document.querySelector(it.el.hash);
      if (!section) return;
      e.preventDefault();
      launch(it, section);
    });
  }

  function stepShelf(dt, t) {
    for (const o of everything) {
      o.wobV += (-o.wob * 120 - o.wobV * 7) * dt;
      o.wob += o.wobV * dt;
    }
    for (const d of decor) {
      if (!pointer || !cr) continue;
      const dx = pointer.x - (cr.left + d.cx), dy = pointer.y - (cr.top + restY(d));
      d.yaw += (clamp(dx / 600, -1, 1) * 0.45 - d.yaw) * Math.min(1, dt * 4);
      d.pitch += (clamp(dy / 500, -1, 1) * 0.25 - d.pitch) * Math.min(1, dt * 4);
    }
    for (const it of items) {
      // hover is a spring, so the hop overshoots a little
      it.hoverV += ((it.target || 0) - it.hover) * 160 * dt - it.hoverV * 14 * dt;
      it.hover += it.hoverV * dt;
      it.spinV += (it.spinTo - it.spin) * 70 * dt - it.spinV * 11 * dt;
      it.spin += it.spinV * dt;
      // lean toward the cursor
      let ty = 0, tp = 0;
      if (pointer && cr) {
        cr = canvas.getBoundingClientRect();
        const dx = pointer.x - (cr.left + it.cx), dy = pointer.y - (cr.top + restY(it));
        ty = clamp(dx / 600, -1, 1) * 0.45;
        tp = clamp(dy / 500, -1, 1) * 0.25;
      }
      it.yaw += (ty - it.yaw) * Math.min(1, dt * 4);
      it.pitch += (tp - it.pitch) * Math.min(1, dt * 4);
      // popping back after a flight
      if (!it.away && it.scale < 1) {
        it.scaleV += (1 - it.scale) * 220 * dt - it.scaleV * 12 * dt;
        it.scale += it.scaleV * dt;
        if (Math.abs(1 - it.scale) < 0.002 && Math.abs(it.scaleV) < 0.02) { it.scale = 1; it.scaleV = 0; }
      }
    }
    const shown = everything.filter((o) => !o.away && !o.hidden && o.scale > 0.01);
    const poses = shown.map((o) => pose(o, t));
    scene.draw(poses);
    // shadows shrink and fade as an object lifts off the plank
    for (const o of everything) {
      const on = !o.away && !o.hidden;
      const k = on ? clamp((o.lift || 0) / (px * 4), 0, 1) : 1;
      o.shadow.style.opacity = on ? (o.scale * (1 - k * 0.6)).toFixed(3) : '0';
      o.shadow.style.transform = `scale(${(o.scale * (1 - k * 0.35)).toFixed(3)})`;
    }
  }

  // ---------- the flight ----------
  // The object travels in page coordinates from the shelf to the icon ring while the page
  // scrolls on the same easing, so it seems to fall with the camera following it. Any
  // wheel, touch or key during the flight hands the scroll back; the object still lands.

  let flight = null, overlay = null;

  function getOverlay() {
    if (overlay) return overlay;
    const c = document.createElement('canvas');
    c.className = 'shelf-flight';
    c.setAttribute('aria-hidden', 'true');
    document.body.append(c);
    const sc = makeScene(c);
    if (!sc) { c.remove(); return null; }
    const fit = () => sc.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener('resize', fit);
    overlay = { canvas: c, scene: sc };
    return overlay;
  }

  function launch(it, section) {
    const ov = getOverlay();
    if (!ov) { section.scrollIntoView(); return; }
    const icon = section.querySelector('.category-icon') || section;
    cr = canvas.getBoundingClientRect();
    const p = pose(it, performance.now() / 1000);
    const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2)); // drop the hover spins already done
    const scrollPad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const s0 = window.scrollY;
    const s1 = clamp(section.getBoundingClientRect().top + s0 - scrollPad, 0, document.documentElement.scrollHeight - window.innerHeight);
    const dist = Math.abs(s1 - s0);
    flight = {
      it, section, icon, k: 0, s0, s1, ownScroll: true,
      dur: clamp(0.75 + dist / 3400, 0.95, 1.7),
      from: { x: cr.left + p.x, y: cr.top + p.y + s0, px: p.px, ry: wrapAngle(p.ry), rx: p.rx, rz: p.rz },
      hop: clamp(90 + dist * 0.04, 110, 200),
      turn: Math.PI * 2 * (it.cx < cr.width / 2 ? 1 : -1),
    };
    it.away = true;
    it.target = 0;
    for (const o of everything) if (o !== it) o.wobV += (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.2);
    document.documentElement.classList.add('is-shelf-flying');
    ov.canvas.classList.add('is-on');
    wake();
  }

  const handBack = () => { if (flight) flight.ownScroll = false; };
  window.addEventListener('wheel', handBack, { passive: true });
  window.addEventListener('touchstart', handBack, { passive: true });
  window.addEventListener('keydown', handBack);

  function stepFlight(dt) {
    const f = flight;
    f.k = Math.min(1, f.k + dt / f.dur);
    const e = easeInOut(f.k);
    if (f.ownScroll) window.scrollTo({ top: f.s0 + (f.s1 - f.s0) * e, behavior: 'instant' });
    const r = f.icon.getBoundingClientRect(), sy = window.scrollY;
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 + sy };
    const size = OBJECTS[f.it.name].sprite;
    const toPx = (r.width * 0.5) / Math.max(size.w, size.h);
    const hop = f.hop * Math.sin(Math.PI * f.k) * (1 - f.k * 0.35);
    const o = {
      name: f.it.name,
      x: f.from.x + (to.x - f.from.x) * e,
      y: f.from.y + (to.y - f.from.y) * e - sy - hop,
      px: f.from.px + (toPx - f.from.px) * e,
      z: Math.sin(Math.PI * f.k) * 2.5, // comes toward the viewer mid-flight
      rx: f.from.rx * (1 - e) + Math.sin(Math.PI * f.k) * 0.5,
      ry: f.from.ry * (1 - e) + f.turn * e,
      rz: f.from.rz * (1 - e),
    };
    overlay.scene.draw([o]);
    if (f.k >= 1) land(f);
  }

  function land(f) {
    flight = null;
    overlay.scene.draw([]);
    overlay.canvas.classList.remove('is-on');
    document.documentElement.classList.remove('is-shelf-flying');
    // the ring catches it
    const wrap = f.icon.closest('.category-icon-wrap') || f.icon;
    wrap.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.16, 0.86)', offset: 0.22 },
      { transform: 'scale(0.94, 1.07)', offset: 0.5 },
      { transform: 'scale(1.02, 0.98)', offset: 0.75 },
      { transform: 'scale(1)' },
    ], { duration: 560, easing: 'ease-out' });
    wrap.classList.remove('is-caught');
    void wrap.offsetWidth;
    wrap.classList.add('is-caught');
    // the link's job: the address and keyboard focus move to the section
    if (location.hash !== f.it.el.hash) history.pushState(null, '', f.it.el.hash);
    if (!f.section.hasAttribute('tabindex')) f.section.setAttribute('tabindex', '-1');
    f.section.focus({ preventScroll: true });
    // and a fresh one pops back onto the shelf
    setTimeout(() => { f.it.away = false; f.it.scale = 0; f.it.scaleV = 0; wake(); }, 450);
  }

  // ---------- the loop: runs while the shelf is on screen or something is flying ----------

  let visible = false, raf = 0, last = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    raf = 0;
    if (flight) stepFlight(dt);
    if (visible) stepShelf(dt, now / 1000);
    if (flight || visible) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf || reduceMotion || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (reduceMotion) { layout(); stepShelf(0, 0); } else wake();
  }, { rootMargin: '60px 0px' }).observe(shelf);
  document.addEventListener('visibilitychange', wake);

  // the canvas is cleared on resize, so lay out again and redraw
  new ResizeObserver(() => { layout(); if (reduceMotion || !raf) stepShelf(0, performance.now() / 1000); }).observe(shelf);
  layout();
})();
