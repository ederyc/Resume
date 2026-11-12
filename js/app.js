const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initSpinIcon(el) {
  if (prefersReducedMotion) return;

  const scrollSensitivity = .039 // deg of spin velocity added per px of scroll
  const maxVelocity = 20;          // deg/frame cap, keeps top speed from feeling glitchy
  const friction = .99;         // per-frame velocity decay — the "momentum" tail
  const restThreshold = 0.02;     // velocity below this stops the animation loop

  let rotation = 0;
  let velocity = 0;
  let lastY = window.scrollY;
  let inView = false;
  let rafId = null;

  const io = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView) startLoop();
    },
    { threshold: 0 }
  );
  io.observe(el);

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    // a shelf object is flying down to its ring (js/shelf.js); the ring waits to catch it
    if (document.documentElement.classList.contains('is-shelf-flying')) return;
    if (inView && delta !== 0) {
      velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity + delta * scrollSensitivity));
      startLoop();
    }
  }, { passive: true });

  function startLoop() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    rotation += velocity;
    velocity *= friction;
    el.style.transform = `rotateY(${rotation}deg)`;
    if (Math.abs(velocity) > restThreshold) {
      rafId = requestAnimationFrame(tick);
    } else {
      velocity = 0;
      rafId = null;
    }
  }
}

document.querySelectorAll('[data-spin-icon]').forEach(initSpinIcon);

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
