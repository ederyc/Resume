const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The section icons float in soap bubbles (.bubble in index.html, styled in style.css).
// The icon drifts on a slow wander, lags behind when the page scrolls, bounces off the
// bubble's wall and dents it, and gets knocked away from a click. Each bubble pops its
// icon in (small, then a springy bounce to size) the first time it's seen, and again when
// a shelf object lands in it: js/shelf.js sends 'bubble:incoming' at launch and
// 'bubble:catch' on landing. With reduced motion the icon just sits in the middle.
function initBubble(el) {
  const back = el.querySelector('.bubble-back');
  const shell = el.querySelector('.bubble-shell');
  const icon = el.querySelector('.bubble-icon');
  if (!back || !shell || !icon || prefersReducedMotion) return;

  const ph = Math.random() * 100; // each bubble wanders its own way
  // icon: position/velocity (px from center), tilt (deg), scale
  const P = { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, s: 0, vs: 0, sTo: 1 };
  // shell: stretch as a traceless 2x2 (a, b) so a squash can point any way, plus overall size
  const B = { a: 0, b: 0, va: 0, vb: 0, s: 1, vs: 0 };
  const pointer = { x: 0, y: 0, on: false };
  let R = 0, r = 0;
  let inView = false, raf = null, last = 0, popped = false, held = false;

  const measure = () => {
    R = el.offsetWidth / 2;
    r = icon.offsetWidth * 0.42; // the icon's collision radius
  };
  measure();
  new ResizeObserver(measure).observe(el);

  // stretch the bubble along (nx, ny); a negative amount squashes it along that line
  const stretch = (nx, ny, v) => {
    B.va += v * (nx * nx - ny * ny);
    B.vb += v * 2 * nx * ny;
  };

  function pop(from) {
    P.s = from;
    P.vs = 0;
    P.sTo = 1;
    B.vs -= 1.1;
    wake();
  }

  function step(dt, t) {
    // drift toward a slowly wandering point, like something suspended in water
    const w = (R - r) * 0.3;
    const tx = (Math.sin(t * 0.53 + ph) + Math.sin(t * 0.31 + ph * 1.7) * 0.6) * w;
    const ty = (Math.cos(t * 0.47 + ph * 0.8) + Math.sin(t * 0.23 + ph * 2.3) * 0.6) * w;
    let fx = (tx - P.x) * 6 - P.vx * 1.6;
    let fy = (ty - P.y) * 6 - P.vy * 1.6;

    // shy of the cursor
    if (pointer.on) {
      const dx = P.x - pointer.x, dy = P.y - pointer.y;
      const d = Math.hypot(dx, dy) || 1, reach = r * 2.2;
      if (d < reach) {
        const k = (1 - d / reach) * 1400;
        fx += (dx / d) * k;
        fy += (dy / d) * k;
      }
    }

    P.vx += fx * dt;
    P.vy += fy * dt;
    P.x += P.vx * dt;
    P.y += P.vy * dt;

    // the wall: bounce back in and bulge the bubble where it hit
    const lim = Math.max(1, R - r - 3);
    const d = Math.hypot(P.x, P.y);
    if (d > lim) {
      const nx = P.x / d, ny = P.y / d;
      P.x = nx * lim;
      P.y = ny * lim;
      const vn = P.vx * nx + P.vy * ny;
      if (vn > 0) {
        P.vx -= 1.55 * vn * nx;
        P.vy -= 1.55 * vn * ny;
        P.va += (P.vy * nx - P.vx * ny) * 0.6; // glancing hits spin it
        stretch(nx, ny, Math.min(vn / R, 6) * 0.45);
        B.vs += Math.min(vn / R, 6) * 0.08;
      }
    }

    // tilt leans into the motion, with a little sway
    const tilt = Math.max(-28, Math.min(28, P.vx * 0.05)) + Math.sin(t * 0.9 + ph) * 5;
    P.va += ((tilt - P.a) * 30 - P.va * 4.5) * dt;
    P.a += P.va * dt;

    // springs: the icon's pop overshoots, the shell jiggles
    P.vs += ((P.sTo - P.s) * 520 - P.vs * 14) * dt;
    P.s += P.vs * dt;
    B.va += (-B.a * 380 - B.va * 8.5) * dt;
    B.vb += (-B.b * 380 - B.vb * 8.5) * dt;
    B.vs += ((1 - B.s) * 420 - B.vs * 10) * dt;
    B.a = Math.max(-0.3, Math.min(0.3, B.a + B.va * dt));
    B.b = Math.max(-0.3, Math.min(0.3, B.b + B.vb * dt));
    B.s += B.vs * dt;

    const bob = Math.sin(t * 1.15 + ph) * 3;
    const m = `matrix(${B.s * (1 + B.a)}, ${B.s * B.b}, ${B.s * B.b}, ${B.s * (1 - B.a)}, 0, ${bob})`;
    back.style.transform = m;
    shell.style.transform = m;
    icon.style.transform = `translate(${P.x}px, ${P.y + bob}px) rotate(${P.a}deg) scale(${Math.max(0, P.s)})`;
    el.style.setProperty('--bubble-shadow', (1 - bob * 0.03).toFixed(3));
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    // two half steps keep fast hits from slipping through the wall
    step(dt / 2, now / 1000);
    step(dt / 2, now / 1000);
    raf = inView || held ? requestAnimationFrame(frame) : null;
  }

  function wake() {
    if (raf !== null) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  icon.style.transform = 'scale(0)'; // waits to pop in

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && !popped && !held && entry.intersectionRatio >= 0.6) {
      popped = true;
      setTimeout(() => pop(0), 120);
    }
    if (inView) wake();
  }, { threshold: [0, 0.6] }).observe(el);

  // poke: the bubble dents where it was touched and boings, the icon gets knocked away
  el.addEventListener('pointerdown', (e) => {
    const rect = el.getBoundingClientRect();
    const qx = e.clientX - rect.left - R, qy = e.clientY - rect.top - R;
    let dx = P.x - qx, dy = P.y - qy, d = Math.hypot(dx, dy);
    if (d < 1) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
    const kick = 380 + 320 * Math.max(0, 1 - d / (R * 1.2));
    P.vx += (dx / d) * kick;
    P.vy += (dy / d) * kick;
    P.va += (Math.random() < 0.5 ? -1 : 1) * (260 + Math.random() * 200);
    P.vs -= 5;
    const qd = Math.hypot(qx, qy);
    if (qd > R * 0.2) stretch(qx / qd, qy / qd, -3.2);
    B.vs -= 1.8;
    if (!popped) { popped = true; P.sTo = 1; }
    wake();
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    pointer.x = e.clientX - rect.left - R;
    pointer.y = e.clientY - rect.top - R;
    pointer.on = true;
  });
  el.addEventListener('pointerleave', () => { pointer.on = false; });

  // scrolling carries the bubble; the icon lags behind it
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const delta = window.scrollY - lastY;
    lastY = window.scrollY;
    if (!inView || held || document.documentElement.classList.contains('is-shelf-flying')) return;
    P.vy += Math.max(-140, Math.min(140, delta * 1.4));
    wake();
  }, { passive: true });

  // a shelf object is on its way: the icon ducks out, then the new one pops in on landing
  el.addEventListener('bubble:incoming', () => {
    held = true;
    popped = true;
    P.sTo = 0;
    wake();
  });
  el.addEventListener('bubble:catch', () => {
    held = false;
    P.x = 0; P.y = 0; P.vx = 0; P.vy = 260; P.va = 0;
    stretch(0, 1, -3); // squashed flat by the landing
    pop(0.3);
  });
}

document.querySelectorAll('[data-bubble]').forEach(initBubble);

function replayIntroAnimation() {
  if (prefersReducedMotion) return;

  const targets = document.querySelectorAll('.intro-anim, .intro-photo');
  targets.forEach((el) => { el.style.animation = 'none'; });
  void document.body.offsetHeight; // force reflow so the animation restarts
  targets.forEach((el) => { el.style.animation = ''; });
}

const headerName = document.querySelector('.site-header-name');
if (headerName) {
  headerName.addEventListener('click', replayIntroAnimation);
}

// The hero's scene. The poster is already on screen, so the video waits for the photo's
// jump to land, then for an idle moment. It never loads for reduced motion or data saver
// unless someone asks for it.
function initHeroScene(hero) {
  const video = hero.querySelector('video');
  const toggle = hero.querySelector('.hero-toggle');
  const label = toggle.querySelector('.visually-hidden');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  // Portrait screens get the tall cut of the scene. The inline script in index.html already
  // set the matching poster; this keeps the poster and the video in step when the screen turns.
  const tallQuery = hero.dataset.tallMedia ? window.matchMedia(hero.dataset.tallMedia) : null;
  const cut = () => {
    const tall = Boolean(tallQuery && tallQuery.matches);
    const d = hero.dataset;
    return tall
      ? { poster: d.tallPoster, webm: d.tallWebm, mp4: d.tallMp4 }
      : { poster: d.poster, webm: d.webm, mp4: d.mp4 };
  };

  let wanted = !prefersReducedMotion && !saveData;
  let onScreen = true;
  let loaded = false;
  let ready = false;

  function load() {
    if (loaded) return;
    loaded = true;
    const files = cut();
    const webm = document.createElement('source');
    webm.src = files.webm;
    webm.type = 'video/webm; codecs="av01.0.08M.08"';
    const mp4 = document.createElement('source');
    mp4.src = files.mp4;
    mp4.type = 'video/mp4';
    // If neither file can play, the poster stays and there's nothing to control.
    mp4.addEventListener('error', () => { toggle.hidden = true; });
    video.append(webm, mp4);
    video.load();
  }

  if (tallQuery) {
    tallQuery.addEventListener('change', () => {
      video.poster = cut().poster;
      if (!loaded) return;
      // Already playing the other cut: drop it and load this one the same way.
      video.pause();
      video.replaceChildren();
      video.removeAttribute('src');
      loaded = false;
      toggle.hidden = false;
      sync();
    });
  }

  function sync() {
    toggle.dataset.playing = String(wanted);
    label.textContent = wanted ? 'Pause background animation' : 'Play background animation';
    if (wanted && ready && onScreen && !document.hidden) {
      load();
      video.play().catch((err) => {
        // Autoplay refused, as in iOS Low Power Mode. Leave the choice to the button.
        if (err.name === 'NotAllowedError') {
          wanted = false;
          sync();
        }
      });
    } else {
      video.pause();
    }
  }

  toggle.addEventListener('click', () => {
    wanted = !wanted;
    ready = true;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }).observe(hero);

  // The button shows straight away, so nothing beside it shifts when the video starts.
  toggle.hidden = false;
  sync();

  const begin = () => {
    ready = true;
    sync();
  };
  const whenIdle = window.requestIdleCallback || ((run) => setTimeout(run, 200));
  const afterJump = () => setTimeout(() => whenIdle(begin, { timeout: 1000 }), 1500);
  if (document.readyState === 'complete') afterJump();
  else window.addEventListener('load', afterJump, { once: true });
}

const hero = document.querySelector('[data-hero]');
if (hero) initHeroScene(hero);

// Project slabs: the window tilts and catches light under the cursor, and a slab with a
// clip plays it only while it's on screen. Reduced motion and data saver keep the poster
// until someone presses play.
const canTilt = !prefersReducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function initSlabTilt(slab) {
  const maxTiltX = 5; // deg, top/bottom
  const maxTiltY = 7; // deg, left/right
  let rect = null;

  slab.addEventListener('pointerenter', () => { rect = slab.getBoundingClientRect(); });
  slab.addEventListener('pointermove', (e) => {
    if (!rect) rect = slab.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    slab.classList.add('is-tracking');
    slab.style.setProperty('--ry', `${((x - 0.5) * 2 * maxTiltY).toFixed(2)}deg`);
    slab.style.setProperty('--rx', `${((0.5 - y) * 2 * maxTiltX).toFixed(2)}deg`);
    slab.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    slab.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  });
  slab.addEventListener('pointerleave', () => {
    rect = null;
    slab.classList.remove('is-tracking'); // the spring transition carries it home
    ['--rx', '--ry', '--mx', '--my'].forEach((p) => slab.style.removeProperty(p));
  });
}

function initSlabVideo(slab) {
  const video = slab.querySelector('video');
  const toggle = slab.querySelector('.slab-toggle');
  if (!video || !toggle) return;
  const label = toggle.querySelector('.visually-hidden');
  const name = slab.dataset.name || 'project';
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  let wanted = !prefersReducedMotion && !saveData;
  let onScreen = false;
  let loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    const webm = document.createElement('source');
    webm.src = slab.dataset.webm;
    webm.type = 'video/webm; codecs="av01.0.08M.08"';
    const mp4 = document.createElement('source');
    mp4.src = slab.dataset.mp4;
    mp4.type = 'video/mp4';
    mp4.addEventListener('error', () => { toggle.hidden = true; });
    video.append(webm, mp4);
    video.load();
  }

  function sync() {
    toggle.dataset.playing = String(wanted);
    label.textContent = `${wanted ? 'Pause' : 'Play'} the ${name} preview`;
    if (wanted && onScreen && !document.hidden) {
      load();
      video.play().catch((err) => {
        if (err.name === 'NotAllowedError') {
          wanted = false;
          sync();
        }
      });
    } else {
      video.pause();
    }
  }

  toggle.addEventListener('click', () => {
    wanted = !wanted;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }, { threshold: 0.35 }).observe(slab);

  toggle.hidden = false;
  sync();
}

// A live slab runs the real thing instead of a recording: a scene exported from the
// Elaborate Backgrounds editor as a live wallpaper, in an iframe under the screen link.
// It loads the first time the window is on screen, plays only while it's on screen,
// and the button pauses it. The scene's player answers postMessage({ player: 'play' | 'pause' })
// and says { player: 'ready' } once its first frame is drawn, which swaps out the poster.
function initSlabLive(slab) {
  const toggle = slab.querySelector('.slab-toggle');
  if (!toggle) return;
  const label = toggle.querySelector('.visually-hidden');
  const name = slab.dataset.name || 'project';
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  let wanted = !prefersReducedMotion && !saveData;
  let onScreen = false;
  let frame = null;
  let ready = false;
  let loadTimer = 0;

  // Starting the scene costs the page one short stall (about 140 ms on a laptop GPU), so it
  // waits until scrolling has settled and the browser is idle, and never lands mid-scroll.
  function loadWhenStill() {
    if (frame) return;
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      loadTimer = 0;
      if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 1000 });
      else load();
    }, 200);
  }
  window.addEventListener('scroll', () => { if (loadTimer) loadWhenStill(); }, { passive: true });

  function load() {
    if (frame || !(wanted && onScreen)) return;
    const small = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    frame = document.createElement('iframe');
    frame.className = 'slab-frame';
    frame.title = `${name} live preview`;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = `${slab.dataset.live}?quality=${small ? 'low' : 'high'}`;
    slab.prepend(frame);
  }

  function sync() {
    const run = wanted && onScreen && !document.hidden;
    toggle.dataset.playing = String(wanted);
    label.textContent = `${wanted ? 'Pause' : 'Play'} the ${name} preview`;
    slab.classList.toggle('is-paused', !run);
    if (run) loadWhenStill();
    if (ready) frame.contentWindow.postMessage({ player: run ? 'play' : 'pause' }, '*');
  }

  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || !e.data || e.data.player !== 'ready') return;
    ready = true;
    slab.classList.add('is-live');
    sync();
  });

  toggle.addEventListener('click', () => {
    wanted = !wanted;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }, { threshold: 0.35 }).observe(slab);

  toggle.hidden = false;
  sync();
}

document.querySelectorAll('[data-slab]').forEach((slab) => {
  if (canTilt) initSlabTilt(slab);
  if (slab.dataset.live) initSlabLive(slab);
  else initSlabVideo(slab);
});

// Paper sheets (landing page, paper theme): each section below the intro is its own sheet
// of paper laid over the one before, with a torn top edge. The edge is three clip-path
// layers made here (a soft shadow, the pale fibers where the paper tore, and the sheet),
// each torn along the same random line so no two edges match. As a sheet scrolls through
// the screen its shadow shifts a little, so the layers read as having depth.
function initPaperSheets() {
  if (!document.documentElement.classList.contains('theme-paper')) return;
  const sheets = document.querySelectorAll('main > .category, main > .design-system, .site-footer');
  if (!sheets.length) return;

  // A small seeded random, so an edge is the same on every visit.
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  function tear(seed, height) {
    const r = rng(seed);
    const steps = 90;
    const top = [], rim = [];
    const f1 = 2 + r() * 3, f2 = 7 + r() * 6, p1 = r() * 6.3, p2 = r() * 6.3;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * 100;
      const wave = Math.sin((x / 100) * f1 * Math.PI + p1) * 0.22 + Math.sin((x / 100) * f2 * Math.PI + p2) * 0.1;
      const y = height * (0.5 + wave + (r() - 0.5) * 0.3);
      const yy = Math.max(1, Math.min(height - 4, y));
      top.push(`${x.toFixed(2)}% ${yy.toFixed(1)}px`);
      rim.push(`${x.toFixed(2)}% ${(yy + 1.5 + r() * 2.5).toFixed(1)}px`); // fibers show a little below the tear
    }
    const poly = (pts) => `polygon(0% 100%, ${pts.join(', ')}, 100% 100%)`;
    return { fibers: poly(top), sheet: poly(rim) };
  }

  // The first sheet is the one under the hero: the bio and shelf, laid over the bottom of the
  // scene so the hero ends in a torn edge instead of a fade. It's the page's own shade, so the
  // sections after it keep their light/base order and their edges.
  const first = document.querySelector('.theme-paper .hero + .intro-hero');
  const all = first ? [[first, 'sheet-base', 4243], ...[...sheets].map((s, n) => [s, null, n])] : [...sheets].map((s, n) => [s, null, n]);

  const tears = [];
  all.forEach(([sheet, shade, n]) => {
    sheet.classList.add('has-tear', shade || (sheet.classList.contains('site-footer') ? 'sheet-kraft' : n % 2 ? 'sheet-base' : 'sheet-light'));
    const edge = document.createElement('span');
    edge.className = 'tear';
    edge.setAttribute('aria-hidden', 'true');
    const height = 30;
    const { fibers, sheet: body } = tear(n * 7919 + 101, height);
    edge.innerHTML = '<i class="tear-shadow"></i><i class="tear-fibers"></i><i class="tear-sheet"></i>';
    edge.querySelector('.tear-shadow').style.setProperty('--clip', fibers); // shaped inside, blurred outside
    edge.querySelector('.tear-fibers').style.clipPath = fibers;
    edge.querySelector('.tear-sheet').style.clipPath = body;
    sheet.prepend(edge);
    tears.push(edge);
  });

  if (prefersReducedMotion) return;
  const onScreen = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target)));
    update();
  });
  tears.forEach((t) => io.observe(t));
  let raf = 0;
  function update() {
    raf = 0;
    const h = window.innerHeight;
    onScreen.forEach((t) => {
      const y = t.getBoundingClientRect().top / h; // 0 at the top of the screen, 1 at the bottom
      t.style.setProperty('--tear-depth', (Math.max(-0.2, Math.min(1.2, y))).toFixed(3));
    });
  }
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
}

initPaperSheets();
