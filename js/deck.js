(() => {
  const deck = document.getElementById("deck");
  const slides = [...deck.querySelectorAll(".slide")];
  const overview = document.getElementById("overview");
  const fx = window.HisFx;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FX_SEL = [
    ".reveal", ".goal", ".t-item", ".flow-card", ".tri", ".cause",
    ".lesson-card", ".prac", ".quote", ".stat", ".event-row", ".stack",
    ".callout", ".spotlight", ".archival-frame", ".city-badge",
    "h1", "h2", ".lede", ".body", ".chip-row", ".check-list li",
    ".finale-keys", ".thanks", ".seal", ".section-tag", ".subhead",
    ".ask-box", ".mini-h", ".er-body",
  ].join(",");

  let index = 0;
  let locked = false;

  slides.forEach((s, i) => {
    // Gold corner HUD is global (#hud-frame) — don't inject per-slide frames

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
    slide.querySelectorAll(".burn-in, .burn-out").forEach((el) => {
      el.classList.remove("burn-in", "burn-out");
      el.style.removeProperty("--stagger");
    });
  }

  function markBurn(slide, cls) {
    const els = [...slide.querySelectorAll(".fx-el")];
    els.forEach((el, i) => {
      el.style.setProperty("--stagger", `${Math.min(i, 8) * 28}ms`);
      el.classList.remove("burn-in", "burn-out");
      void el.offsetWidth;
      el.classList.add(cls);
    });
    return els;
  }

  function setScene(n) {
    const s = slides[n];
    document.body.classList.toggle("scene-hero", n === 0);
    document.body.classList.toggle("scene-split", !!(s && s.querySelector(".split-visual")));
    document.body.classList.toggle("scene-finale", !!(s && (s.querySelector(".finale-bg") || s.classList.contains("finale"))));
  }

  /** Per-slide rest pose in the night cloud — same palette, different vantage. */
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
    setScene(n);
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
    // Drift the night cloud toward the destination slide's vantage
    setCloud(n);

    const finish = () => {
      if (finished) return;
      finished = true;
      index = n;
      old.classList.remove("active");
      clearFx(old);
      neu.classList.add("active");
      neu.classList.remove("is-entering");
      setScene(n);
      neu.querySelectorAll(".burn-in").forEach((el) => {
        el.classList.remove("burn-in");
        el.style.removeProperty("--stagger");
      });
      document.body.classList.remove("is-flipping");
      applyHash();
      locked = false;
    };

    // Keep outgoing pixels visible for snapshot; canvases hide them after capture
    old.classList.add("is-leaving");

    const runIn = () => {
      if (inbound || finished) return;
      inbound = true;
      old.classList.remove("active", "is-leaving");
      clearFx(old);
      neu.classList.add("active", "is-entering");
      setScene(n);
      markBurn(neu, "burn-in");
      window.setTimeout(finish, 920);
    };

    // Per-element method-2 burn; swap to next slide mid-cascade
    if (fx?.start) {
      fx.start({
        root: old,
        onHalfway: runIn,
        onDone: () => { /* overlays cleared */ },
      });
      window.setTimeout(runIn, 2400);
    } else {
      window.setTimeout(runIn, 340);
    }
  }

  function next() { go(index + 1); }
  function prev() { go(index - 1); }

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
    const rect = deck.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.28) next();
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

  if (overview) overview.remove();

  function readHash() {
    const fromHash = Number.parseInt(location.hash.replace("#", ""), 10);
    const n = Number.isFinite(fromHash) && fromHash >= 1 ? fromHash - 1 : 0;
    index = n;
    paint(index);
  }

  window.addEventListener("hashchange", readHash);
  readHash();
  deck.focus();
})();
