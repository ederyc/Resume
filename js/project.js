const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// How far left the title slides and how quickly it fades, both measured in
// px of page scroll (not time) since the effect is tied to scroll position.
// Adjust these two numbers to change the feel:
const TITLE_FADE_DISTANCE = 320; // scroll px until fully faded out (smaller = faster fade)
const TITLE_MAX_SHIFT = 380;     // px traveled left at full fade (bigger = more force)

function initProjectTitleFill(el) {
  if (!el) return;
  const label = el.dataset.title;
  if (!label) return;

  // Keeps adding copies of the title until the row is wider than the
  // viewport (with a generous buffer so sliding left never runs out of
  // text), so it always looks like it repeats forever without actually
  // rendering an unbounded number of elements.
  function fill() {
    const target = window.innerWidth * 2 + TITLE_MAX_SHIFT;
    let guard = 0;
    while (el.scrollWidth < target && guard < 80) {
      const span = document.createElement('span');
      span.textContent = label;
      el.appendChild(span);
      guard++;
    }
  }

  fill();

  // The title font loads async; if it swaps in after this first measurement,
  // the row's real width can change, so re-check once it's actually ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fill);
  }
  window.addEventListener('load', fill);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fill, 150);
  });
}

function initProjectTitleParallax(el) {
  if (!el || prefersReducedMotion) return;

  let ticking = false;

  function update() {
    const progress = Math.min(1, Math.max(0, window.scrollY / TITLE_FADE_DISTANCE));
    el.style.opacity = String(1 - progress);
    el.style.transform = `translateX(${-TITLE_MAX_SHIFT * progress}px)`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  update();
}

document.querySelectorAll('.project-title-bg').forEach((el) => {
  initProjectTitleFill(el);
  initProjectTitleParallax(el);
});
