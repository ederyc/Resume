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

function initDockNav(list) {
  const items = Array.from(list.querySelectorAll('.section-link'));
  if (prefersReducedMotion || items.length === 0) return;

  const maxScale = 1.45;     // fixed size the moment the cursor is actually over a pill
  const neighborCap = 1;  // ceiling for proximity growth on every other pill —
                              // kept below maxScale so landing on a pill is a visible jump
  const sigma = 150;         // how far proximity influence reaches, in px
  const spinDuration = 480;  // ms for the quick hover spin

  let activeIndex = -1;

  function spinIcon(item) {
    const icon = item.querySelector('.section-icon');
    if (!icon) return;
    icon.getAnimations().forEach((anim) => anim.cancel());
    icon.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }],
      { duration: spinDuration, easing: 'ease-in-out' }
    );
  }

  function setActive(newIndex) {
    if (newIndex === activeIndex) return;
    activeIndex = newIndex;
    if (newIndex !== -1) spinIcon(items[newIndex]);
  }

  function onMove(e) {
    const rects = items.map((item) => item.getBoundingClientRect());
    let hovered = -1;
    rects.forEach((rect, i) => {
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        hovered = i;
      }
    });

    setActive(hovered);

    items.forEach((item, i) => {
      if (i === hovered) {
        item.style.transform = `scale(${maxScale})`;
        return;
      }
      const rect = rects[i];
      const center = rect.left + rect.width / 2;
      const distance = e.clientX - center;
      const falloff = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      const scale = 1 + (neighborCap - 1) * falloff;
      item.style.transform = scale > 1.001 ? `scale(${scale})` : '';
    });
  }

  function reset() {
    items.forEach((item) => { item.style.transform = ''; });
    activeIndex = -1;
  }

  list.addEventListener('mousemove', onMove);
  list.addEventListener('mouseleave', reset);

  items.forEach((item, i) => {
    item.addEventListener('focus', () => {
      items.forEach((it, j) => { it.style.transform = j === i ? `scale(${maxScale})` : ''; });
      setActive(i);
    });
  });
  list.addEventListener('focusout', (e) => {
    if (!list.contains(e.relatedTarget)) reset();
  });
}

document.querySelectorAll('.sections-list').forEach(initDockNav);

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

  let wanted = !prefersReducedMotion && !saveData;
  let onScreen = true;
  let loaded = false;
  let ready = false;

  function load() {
    if (loaded) return;
    loaded = true;
    const webm = document.createElement('source');
    webm.src = hero.dataset.webm;
    webm.type = 'video/webm; codecs="av01.0.08M.08"';
    const mp4 = document.createElement('source');
    mp4.src = hero.dataset.mp4;
    mp4.type = 'video/mp4';
    // If neither file can play, the poster stays and there's nothing to control.
    mp4.addEventListener('error', () => { toggle.hidden = true; });
    video.append(webm, mp4);
    video.load();
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
