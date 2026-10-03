/* Slide engine — navigation, burn hand-off, per-slide sky pose */
(() => {
  const deck = document.getElementById("deck");
  const slides = [...deck.querySelectorAll(".slide")];
  const fx = window.HisFx;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Elements that burn out (outgoing) and glow in (incoming). HisBurn bakes at most 12 per slide, outermost first. */
  const FX_SEL = [
    ".reveal", ".goal", ".t-item", ".flow-card", ".tri", ".cause",
    ".lesson-card", ".prac", ".quote", ".stat", ".event-row", ".stack",
    ".callout", ".spotlight", ".archival-frame", ".city-badge",
    "h1", "h2", ".lede", ".body", ".chip-row", ".check-list li",
    ".finale-keys", ".thanks", ".seal", ".section-tag", ".subhead",
    ".ask-box", ".mini-h", ".er-body", ".member", ".roster-fx",
    ".chapter-num", ".tl-row", ".side", ".ero-photo", ".photo-cap", ".window", ".scale",
    ".fire-map", ".ev", ".ev-intro", ".step-dots", ".bd-birth",
    ".flip", ".cg-head", ".yoke", ".flap", ".sig", ".world-map",
    ".fig", ".fig-head", ".bar-row", ".eth", ".crawl", ".quiz-opt", ".quiz-prog",
  ].join(",");

  let index = 0;
  let locked = false;

  slides.forEach((s, i) => {
    const gw = document.createElement("div");
    gw.className = "ghost-word";
    gw.setAttribute("aria-hidden", "true");
    gw.textContent = s.dataset.ghost || s.dataset.title || "";
    s.appendChild(gw);

    const gn = document.createElement("div");
    gn.className = "ghost-num";
    gn.setAttribute("aria-hidden", "true");
    gn.textContent = String(i + 1).padStart(2, "0");
    s.appendChild(gn);

    s.querySelectorAll(FX_SEL).forEach((el) => el.classList.add("fx-el"));
  });

  function clearFx(slide) {
    slide.classList.remove("is-leaving", "is-entering");
    slide.querySelectorAll(".burn-in, .is-burn-src, .is-burn-fade").forEach((el) => {
      el.style.transition = "none";
      el.classList.remove("burn-in", "is-burn-src", "is-burn-fade");
      el.style.removeProperty("--stagger");
      el.style.removeProperty("visibility");
      el.style.removeProperty("opacity");
      el.style.removeProperty("transition");
    });
  }

  function markBurnIn(slide) {
    slide.querySelectorAll(".fx-el").forEach((el, i) => {
      el.style.setProperty("--stagger", `${Math.min(i, 8) * 28}ms`);
      el.classList.remove("burn-in");
      void el.offsetWidth;
      el.classList.add("burn-in");
    });
  }

  /** A .stepper walks its .step items before the deck moves on (-1 = nothing picked yet).
      data-reveal steppers keep later steps hidden; a step's data-focus="id id" lights .ero-photo[data-id],
      data-burn="id" (kept on for later steps) burns that photo away; .step-dots children follow data-dot.
      data-flip steppers (flip cards) also come back at their last step when entered backwards. */
  const stepsOf = (stepper) => [...stepper.querySelectorAll(".step")];
  const idList = (s) => (s || "").split(/\s+/).filter(Boolean);

  function pick(stepper, i) {
    const slide = stepper.closest(".slide");
    const steps = stepsOf(stepper);
    stepper.dataset.at = String(i);
    slide.dataset.at = String(i);
    stepper.classList.toggle("has-current", i >= 0);
    steps.forEach((el, k) => {
      el.classList.toggle("is-current", k === i);
      el.classList.toggle("is-on", k <= i);
    });
    const ids = idList(steps[i]?.dataset.focus);
    const burnt = steps.slice(0, i + 1).flatMap((el) => idList(el.dataset.burn));
    slide.querySelectorAll(".ero-photo[data-id]").forEach((ph) => {
      const on = ids.includes(ph.dataset.id);
      ph.classList.toggle("is-focus", on);
      ph.classList.toggle("is-dim", ids.length > 0 && !on);
      ph.classList.toggle("is-burnt", burnt.includes(ph.dataset.id));
    });
    const dot = Number(steps[i]?.dataset.dot ?? -1);
    slide.querySelectorAll(".step-dots > *").forEach((d, k) => {
      d.classList.toggle("is-on", k <= dot);
      d.classList.toggle("is-current", k === dot);
    });
  }

  /** .typeon text types itself out when its step turns on (each glyph gets --i for its delay). */
  document.querySelectorAll(".typeon").forEach((el) => {
    let i = 0;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((w, wi) => {
      const word = document.createElement("span");
      word.className = "tw";
      for (const ch of w) {
        const c = document.createElement("span");
        c.className = "ch";
        c.style.setProperty("--i", i++);
        c.textContent = ch;
        word.appendChild(c);
      }
      el.appendChild(word);
      if (wi < words.length - 1) {
        el.appendChild(document.createTextNode(" "));
        i++;
      }
    });
  });

  function resetSteps(slide, { atEnd = false } = {}) {
    const stepper = slide.querySelector(".stepper");
    const toEnd = atEnd && (stepper?.hasAttribute("data-reveal") || stepper?.hasAttribute("data-flip"));
    if (stepper) pick(stepper, toEnd ? stepsOf(stepper).length - 1 : -1);
  }

  function step(dir) {
    const stepper = slides[index].querySelector(".stepper");
    if (!stepper || locked) return false;
    const i = Number(stepper.dataset.at ?? -1) + dir;
    if (i < -1 || i >= stepsOf(stepper).length) return false;
    pick(stepper, i);
    return true;
  }

  /** Per-slide rest pose in the night cloud — same palette, different vantage (golden-angle walk). */
  function cloudPose(i) {
    const a = i * 2.399963;
    const b = i * 1.618034;
    return {
      cloudX: Math.sin(a) * 20,
      cloudY: Math.cos(a * 0.87) * 15,
      cloudS: 1.04 + (i % 4) * 0.025,
      cloudHue: Math.sin(a) * 7,
      cloudSat: 1 + Math.sin(b) * 0.1,
      washX: Math.sin(a + 1.15) * 24,
      washY: Math.cos(a + 0.65) * 17,
      washS: 1.06 + (i % 3) * 0.03,
      washHue: Math.sin(a + 0.4) * 9,
      washSat: 1.02 + Math.cos(b) * 0.1,
      washBri: 0.96 + (i % 5) * 0.02,
    };
  }

  function setCloud(n, { instant = false } = {}) {
    const sky = document.querySelector(".sky");
    const root = document.documentElement;
    const p = cloudPose(n);
    if (instant && sky) sky.classList.add("is-cloud-snap");
    root.style.setProperty("--cloud-x", `${p.cloudX.toFixed(2)}%`);
    root.style.setProperty("--cloud-y", `${p.cloudY.toFixed(2)}%`);
    root.style.setProperty("--cloud-s", p.cloudS.toFixed(3));
    root.style.setProperty("--cloud-hue", `${p.cloudHue.toFixed(2)}deg`);
    root.style.setProperty("--cloud-sat", p.cloudSat.toFixed(3));
    root.style.setProperty("--wash-x", `${p.washX.toFixed(2)}%`);
    root.style.setProperty("--wash-y", `${p.washY.toFixed(2)}%`);
    root.style.setProperty("--wash-s", p.washS.toFixed(3));
    root.style.setProperty("--wash-hue", `${p.washHue.toFixed(2)}deg`);
    root.style.setProperty("--wash-sat", p.washSat.toFixed(3));
    root.style.setProperty("--wash-bri", p.washBri.toFixed(3));
    if (instant && sky) {
      void sky.offsetWidth;
      sky.classList.remove("is-cloud-snap");
    }
  }

  function paint(n) {
    slides.forEach((s, i) => {
      s.classList.toggle("active", i === n);
      if (i !== n) clearFx(s);
    });
    resetSteps(slides[n]);
    setCloud(n, { instant: true });
  }

  function go(n, { hash = true, instant = false } = {}) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === index) {
      paint(n);
      return;
    }
    if (locked) return;

    const applyHash = () => {
      if (hash) history.replaceState(null, "", `#${index + 1}`);
    };

    if (instant || reduce) {
      index = n;
      paint(index);
      applyHash();
      return;
    }

    locked = true;
    const old = slides[index];
    const neu = slides[n];
    let finished = false;
    let inbound = false;
    document.body.classList.add("is-flipping");
    setCloud(n);

    const finish = () => {
      if (finished) return;
      finished = true;
      index = n;
      old.classList.remove("active");
      clearFx(old);
      neu.classList.add("active");
      neu.classList.remove("is-entering");
      neu.querySelectorAll(".burn-in").forEach((el) => {
        el.classList.remove("burn-in");
        el.style.removeProperty("--stagger");
      });
      document.body.classList.remove("is-flipping");
      applyHash();
      locked = false;
    };

    // Outgoing slide stays painted until HisBurn has baked its glyphs
    old.classList.add("is-leaving");

    const runIn = () => {
      if (inbound || finished) return;
      inbound = true;
      old.classList.remove("active", "is-leaving");
      clearFx(old);
      resetSteps(neu, { atEnd: n < index });
      neu.classList.add("active", "is-entering");
      markBurnIn(neu);
      window.setTimeout(finish, 920);
    };

    if (fx?.start) {
      fx.start({ root: old, onHalfway: runIn });
      window.setTimeout(runIn, 2400);
    } else {
      window.setTimeout(runIn, 340);
    }
  }

  function next() { if (!step(1)) go(index + 1); }
  function prev() { if (!step(-1)) go(index - 1); }

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      prev();
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(slides.length - 1);
    } else if (e.key === "f" || e.key === "F") {
      if (window.HisApp?.toggleFullscreen) {
        window.HisApp.toggleFullscreen();
      } else if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }
  });

  deck.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    const item = e.target.closest(".slide.active .stepper:not([data-reveal]) .step");
    if (item && !locked) {
      const stepper = item.closest(".stepper");
      pick(stepper, stepsOf(stepper).indexOf(item));
      return;
    }
    const rect = deck.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width * 0.28) next();
    else prev();
  });

  let touchX = null;
  deck.addEventListener("touchstart", (e) => {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  deck.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchX = null;
  }, { passive: true });

  function readHash() {
    const fromHash = Number.parseInt(location.hash.replace("#", ""), 10);
    index = Number.isFinite(fromHash) && fromHash >= 1 ? Math.min(fromHash, slides.length) - 1 : 0;
    paint(index);
  }

  window.addEventListener("hashchange", readHash);
  readHash();
  deck.focus();
})();
