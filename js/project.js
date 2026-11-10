// Case study pages: scroll reveals, the hero's scroll arrow and the footer's
// "Let's chat" colour change. The look lives in css/case-study.css; this file
// only adds and removes classes.
//
// The `js` class on <html> is set by a one-line script in each page's <head>,
// so content is only ever hidden when this file is going to reveal it.

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;

  // ---------- Scroll reveals ----------
  // [data-reveal] = "fade" (images), "slide" (copy, in from the right),
  // "rise" or "grow". Each plays once. Items that enter in the same frame,
  // like a row of columns, are staggered by STAGGER_MS so they cascade
  // instead of popping in together.

  const STAGGER_MS = 90;
  const revealItems = document.querySelectorAll('[data-reveal]');

  if (reduceMotion || !canObserve) {
    revealItems.forEach((el) => el.classList.add('is-in'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      const entering = entries.filter((entry) => entry.isIntersecting);
      entering.forEach((entry, i) => {
        const el = entry.target;
        if (entering.length > 1) el.style.setProperty('--reveal-delay', `${i * STAGGER_MS}ms`);
        el.classList.add('is-in');
        revealObserver.unobserve(el);
      });
    }, {
      // An element has to be 10% of the screen into view before it plays.
      rootMargin: '0px 0px -10% 0px',
    });

    revealItems.forEach((el) => revealObserver.observe(el));
  }

  // ---------- Hero scroll arrow ----------
  // Shrinks into view after a 3 s pause (CSS), then swells and fades away
  // once the page starts scrolling, and comes back at the top.

  const arrow = document.querySelector('.cs-hero-arrow');
  if (arrow && !reduceMotion) {
    let ticking = false;
    const update = () => {
      arrow.classList.toggle('is-away', window.scrollY > 40);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  // ---------- "Let's chat" ----------
  // Turns gold a second after it comes into view, and fades back to cream
  // when it leaves, so it plays again on the next visit.

  const chat = document.querySelector('.cs-chat');
  if (chat && canObserve && !reduceMotion) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => chat.classList.toggle('is-lit', entry.isIntersecting));
    }, { rootMargin: '0px 0px -10% 0px' }).observe(chat);
  } else if (chat) {
    chat.classList.add('is-lit');
  }
})();
