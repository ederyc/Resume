const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initSpinIcon(el) {
  if (prefersReducedMotion) return;

  const scrollSensitivity = 0.45; // deg of spin velocity added per px of scroll
  const maxVelocity = 5;          // deg/frame cap, keeps top speed from feeling glitchy
  const friction = 0.945;         // per-frame velocity decay — the "momentum" tail
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
