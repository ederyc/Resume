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
