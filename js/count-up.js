/* .count[data-to] counts up from 0 when it shows: when its .step turns on, or — outside any step — when its
   slide becomes active. Hidden again → back to 0, so the next visit counts again. data-dur = ms (default 1400). */
(() => {
  const fmt = new Intl.NumberFormat("vi-VN");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const deck = document.getElementById("deck");

  const items = [...document.querySelectorAll(".count[data-to]")].map((el) => {
    const step = el.closest(".step");
    return {
      el,
      to: Number(el.dataset.to) || 0,
      dur: Number(el.dataset.dur) || 1400,
      gate: step || el.closest(".slide"),
      cls: step ? "is-on" : "active",
      on: null,
      raf: 0,
    };
  });
  if (!items.length) return;

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function run(it) {
    if (reduce) {
      it.el.textContent = fmt.format(it.to);
      return;
    }
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - t0) / it.dur));
      it.el.textContent = fmt.format(Math.round(it.to * ease(t)));
      if (t < 1) it.raf = requestAnimationFrame(tick);
    };
    it.raf = requestAnimationFrame(tick);
  }

  function sync() {
    for (const it of items) {
      const on = it.gate.classList.contains(it.cls);
      if (on === it.on) continue;
      it.on = on;
      cancelAnimationFrame(it.raf);
      if (on) run(it);
      else it.el.textContent = fmt.format(0);
    }
  }

  new MutationObserver(sync).observe(deck, { subtree: true, attributes: true, attributeFilter: ["class"] });
  sync();
})();
