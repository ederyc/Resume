const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// How far left the title slides and how quickly it fades, both measured in
// px of page scroll (not time) since the effect is tied to scroll position.
// Adjust these two numbers to change the feel:
const TITLE_FADE_DISTANCE = 320; // scroll px until fully faded out (smaller = faster fade)
const TITLE_MAX_SHIFT = 380;     // px traveled left at full fade (bigger = more force)

function initProjectTitle(wrapper) {
  if (!wrapper) return;
  const track = wrapper.querySelector('.project-title-track');
  const label = wrapper.dataset.title;
  if (!track || !label) return;

  // Keeps adding copies of the title to the track until it's wider than the
  // viewport (with a generous buffer so sliding it left never runs out of
  // text), so it always looks like it repeats forever without actually
  // rendering an unbounded number of elements. The wrapper only clips;
  // the track is what actually gets the slide transform, so panning it
  // left reveals the extra copies instead of just dragging the clip
  // window along with the content (which reveals nothing new).
  function fill() {
    const target = window.innerWidth * 2 + TITLE_MAX_SHIFT;
    let guard = 0;
    while (track.scrollWidth < target && guard < 80) {
      const span = document.createElement('span');
      span.textContent = label;
      track.appendChild(span);
      guard++;
    }
  }

  fill();

  // The title font loads async; if it swaps in after this first measurement,
  // the track's real width can change, so re-check once it's actually ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fill);
  }
  window.addEventListener('load', fill);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fill, 150);
  });

  if (prefersReducedMotion) return;

  let ticking = false;

  function update() {
    const progress = Math.min(1, Math.max(0, window.scrollY / TITLE_FADE_DISTANCE));
    wrapper.style.opacity = String(1 - progress);
    track.style.transform = `translateX(${-TITLE_MAX_SHIFT * progress}px)`;
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

document.querySelectorAll('.project-title-bg').forEach(initProjectTitle);
