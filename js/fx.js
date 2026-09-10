/* quiet night — stars/embers behind type, no glyph fire, no particle bloom */
window.HisFx = (() => {
  const amb = document.getElementById("amb");
  const sparks = document.getElementById("sparks");
  const actx = amb.getContext("2d", { alpha: true });
  const xctx = sparks.getContext("2d", { alpha: true });

  let W = 0, H = 0, dpr = 1, time = 0;
  const stars = [];
  const embers = [];

  let burning = false;
  let onBurnDone = null;
  let burnGen = 0;
  let debug = new URLSearchParams(location.search).has("debug");
  let fps = 0, frames = 0, fpsT = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    for (const c of [amb, sparks]) {
      c.width = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
      c.style.width = W + "px";
      c.style.height = H + "px";
    }
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    xctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    stars.length = 0;
    embers.length = 0;
    const ns = Math.max(120, Math.min(220, Math.floor((W * H) / 9000)));
    for (let i = 0; i < ns; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.82,
        r: Math.random() > 0.88 ? 1.7 : 0.45 + Math.random() * 0.9,
        a: 0.42 + Math.random() * 0.5,
        tw: Math.random() * 6.28,
        sp: 0.25 + Math.random() * 0.7,
      });
    }
    for (let i = 0; i < 90; i++) spawnEmber();
  }

  function spawnEmber() {
    embers.push({
      x: Math.random() * W,
      y: H * (0.68 + Math.random() * 0.34),
      vx: (Math.random() - 0.5) * 22,
      vy: -20 - Math.random() * 70,
      life: 0.85 + Math.random() * 0.55,
      decay: 0.07 + Math.random() * 0.12,
      r: 0.55 + Math.random() * 1.45,
      glow: Math.random() > 0.7,
    });
    if (embers.length > 160) embers.shift();
  }

  function start({ onDone, onHalfway, root } = {}) {
    burnGen += 1;
    const gen = burnGen;
    burning = true;
    onBurnDone = typeof onDone === "function" ? onDone : null;

    const finish = () => {
      if (gen !== burnGen) return;
      burning = false;
      const cb = onBurnDone;
      onBurnDone = null;
      if (cb) cb();
    };

    const burn = window.HisBurn;
    if (burn?.play && root) {
      Promise.resolve(
        burn.play({
          root,
          onHalfway: typeof onHalfway === "function" ? onHalfway : null,
          onComplete: finish,
        })
      ).catch((err) => {
        console.warn("[HisFx] burn failed", err);
        if (typeof onHalfway === "function") onHalfway();
        finish();
      });
      return;
    }
    if (typeof onHalfway === "function") onHalfway();
    window.setTimeout(finish, 360);
  }

  function burstFromRects() {}

  function drawAmb(dt) {
    actx.clearRect(0, 0, W, H);
    actx.globalCompositeOperation = "source-over";

    for (const d of stars) {
      d.tw += dt * d.sp;
      const a = d.a * (0.72 + 0.28 * Math.sin(d.tw));
      actx.fillStyle = `rgba(255, 236, 200, ${a})`;
      actx.beginPath();
      actx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      actx.fill();
    }

    const pulse = 0.62 + 0.22 * Math.sin(time * 1.1);
    const g = actx.createRadialGradient(W * 0.5, H * 1.12, 4, W * 0.5, H * 0.88, H * 0.28);
    g.addColorStop(0, `rgba(255, 90, 20, ${0.1 * pulse})`);
    g.addColorStop(0.55, `rgba(180, 40, 10, ${0.04 * pulse})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    actx.fillStyle = g;
    actx.fillRect(0, H * 0.86, W, H * 0.14);
  }

  function drawSparks(dt) {
    xctx.clearRect(0, 0, W, H);
    if (Math.random() < dt * 22) spawnEmber();
    if (Math.random() < dt * 10) spawnEmber();

    xctx.globalCompositeOperation = "lighter";
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.life -= e.decay * dt;
      if (e.y < H * 0.16) e.life -= dt * 0.85;
      if (e.life <= 0) {
        embers.splice(i, 1);
        continue;
      }
      const yFade = e.y < H * 0.28 ? Math.max(0, (e.y - H * 0.08) / (H * 0.2)) : 1;
      const a = Math.min(0.9, e.life) * yFade;
      if (a <= 0.02) {
        embers.splice(i, 1);
        continue;
      }
      if (e.glow) {
        xctx.fillStyle = `rgba(255, 150, 50, ${a * 0.22})`;
        xctx.beginPath();
        xctx.arc(e.x, e.y, e.r * 3.2, 0, Math.PI * 2);
        xctx.fill();
      }
      xctx.fillStyle = `rgba(255, 196, 90, ${a})`;
      xctx.beginPath();
      xctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      xctx.fill();
    }
    xctx.globalCompositeOperation = "source-over";
  }

  function drawDebug() {
    if (!debug) return;
    const el = document.getElementById("fx-debug");
    if (!el) return;
    el.hidden = false;
    el.textContent = [
      `FPS ${fps}`,
      `stars ${stars.length}`,
      `embers ${embers.length}`,
      `burn ${window.HisBurn?.busy ? "on" : "off"}`,
    ].join(" · ");
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    frames += 1;
    fpsT += dt;
    if (fpsT >= 0.4) {
      fps = Math.round(frames / fpsT);
      frames = 0;
      fpsT = 0;
    }
    drawAmb(dt);
    drawSparks(dt);
    drawDebug();
    requestAnimationFrame(tick);
  }

  function ensureDebugEl() {
    let el = document.getElementById("fx-debug");
    if (!el) {
      el = document.createElement("div");
      el.id = "fx-debug";
      el.hidden = !debug;
      document.body.appendChild(el);
    }
    document.body.classList.toggle("debug", debug);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "d" && e.key !== "D") return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    debug = !debug;
    document.body.classList.toggle("debug", debug);
    const el = document.getElementById("fx-debug");
    if (el) el.hidden = !debug;
  });

  resize();
  ensureDebugEl();
  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);

  return {
    start,
    burstFromRects,
    play() { return true; },
    get busy() { return burning; },
  };
})();
