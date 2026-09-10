/* Method A — glyph-stencil burn (no screen capture → no boxes).
   Paints each .fx-el's characters onto a transparent canvas, then
   runs the demo heat/bloom/ash pass only on letter alpha. */
window.HisBurn = (() => {
  const LAYER_ID = "burn-layer";
  const MAX_ELS = 12;
  const DURATION = 1600;
  const STAGGER = 70;
  const PAD = 40;

  let layer = null;
  let running = false;
  let gen = 0;
  let raf = 0;
  let jobs = [];
  let onDone = null;
  let onMid = null;
  let midFired = false;
  let t0 = 0;
  let lastTs = 0;

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  const perm = new Uint8Array(512);
  {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  function grad(h, x, y) {
    const u = (h & 1) ? x : y;
    const v = (h & 2) ? y : x;
    return ((h & 4) ? -u : u) + ((h & 8) ? -v : v) * 0.5;
  }
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[X + perm[Y]], ab = perm[X + perm[Y + 1]];
    const ba = perm[X + 1 + perm[Y]], bb = perm[X + 1 + perm[Y + 1]];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  }
  function fbm(x, y) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < 4; i++) {
      v += a * noise2(x * f, y * f);
      a *= 0.5;
      f *= 2.02;
    }
    return v * 0.5 + 0.5;
  }

  function ensureLayer() {
    layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = LAYER_ID;
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    return layer;
  }

  function pickElements(root) {
    const all = [...root.querySelectorAll(".fx-el")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return false;
      const text = (el.innerText || "").trim();
      return text.length > 0;
    });
    all.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    const picked = [];
    for (const el of all) {
      if (picked.length >= MAX_ELS) break;
      if (picked.some((p) => p.contains(el))) continue;
      picked.push(el);
    }
    picked.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 24) return ra.top - rb.top;
      return ra.left - rb.left;
    });
    return picked;
  }

  /** Paint only ink (characters) onto a transparent canvas — Method A. */
  function rasterizeGlyphs(el) {
    const rect = el.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const tw = Math.ceil(rect.width + PAD * 2);
    const th = Math.ceil(rect.height + PAD * 2);
    if (tw < 4 || th < 4) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(tw * dpr));
    canvas.height = Math.max(1, Math.floor(th * dpr));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tw, th);

    const originX = rect.left - PAD;
    const originY = rect.top - PAD;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    let painted = 0;

    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      if (!raw || !raw.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;

      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color || "#f2e6d0";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      // char-by-char using live layout rects → true glyph positions
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === "\n" || ch === "\r") continue;
        const range = document.createRange();
        try {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
        } catch {
          continue;
        }
        const r = range.getBoundingClientRect();
        if (r.width < 0.25 && ch === " ") continue;
        if (r.height < 0.5) continue;
        ctx.fillText(ch, r.left - originX, r.top - originY);
        painted++;
      }
    }

    if (!painted) {
      // fallback: wrap innerText inside the box
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color || "#f2e6d0";
      ctx.textBaseline = "top";
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const maxW = rect.width;
      const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      const words = text.split(" ");
      let line = "";
      let y = PAD + 4;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, PAD, y);
          painted++;
          line = w;
          y += lineH;
          if (y > PAD + rect.height) break;
        } else {
          line = test;
        }
      }
      if (line && y <= PAD + rect.height) {
        ctx.fillText(line, PAD, y);
        painted++;
      }
    }

    if (!painted) return null;

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const alpha = new Float32Array(canvas.width * canvas.height);
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
      alpha[p] = img.data[i + 3] / 255;
      rgb[p * 3] = img.data[i];
      rgb[p * 3 + 1] = img.data[i + 1];
      rgb[p * 3 + 2] = img.data[i + 2];
    }

    return {
      alpha,
      rgb,
      width: canvas.width,
      height: canvas.height,
      cssW: tw,
      cssH: th,
      left: originX,
      top: originY,
      dpr,
    };
  }

  function spawnAsh(job, x, y, hot) {
    if (job.ash.length > 100) job.ash.shift();
    const inv = 1 / job.dpr;
    job.ash.push({
      x: x * inv,
      y: y * inv,
      vx: (Math.random() - 0.5) * 18,
      vy: -22 - Math.random() * 55,
      life: 0.7 + Math.random() * 0.75,
      decay: 0.35 + Math.random() * 0.45,
      r: (hot ? 0.9 : 0.55) + Math.random() * 1.4,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 4,
      hot: hot || Math.random() > 0.55,
      wob: Math.random() * 6.28,
    });
  }

  function stepAsh(job, dt) {
    for (let i = job.ash.length - 1; i >= 0; i--) {
      const p = job.ash[i];
      p.wob += dt * 3.2;
      p.vx += Math.sin(p.wob) * 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 8 * dt;
      p.vx *= 0.985;
      p.rot += p.spin * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y < -30) job.ash.splice(i, 1);
    }
  }

  function drawAsh(job) {
    const { ctx, ash, dpr } = job;
    if (!ash.length) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (const p of ash) {
      const a = Math.max(0, Math.min(1, p.life));
      if (a < 0.04) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.hot) {
        ctx.fillStyle = `rgba(255, 130, 40, ${a * 0.75})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.1, p.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 200, 90, ${a * 0.35})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(160, 130, 105, ${a * 0.55})`;
        ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2.2, p.r * 0.7);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function renderJob(job, progress, dt) {
    const { ctx, alpha, rgb, dpr, canvas } = job;
    const W = canvas.width;
    const H = canvas.height;
    const img = ctx.createImageData(W, H);
    const bloom = ctx.createImageData(W, H);
    const d = img.data;
    const bd = bloom.data;
    const t = progress;
    const inv = 1 / dpr;
    const budget = { n: 0, max: 8 };

    function stampBloom(cx, cy, strength, radius) {
      const r0 = Math.max(2, Math.round(radius * dpr));
      const r2 = r0 * r0;
      const x0 = Math.max(0, cx - r0), x1 = Math.min(W - 1, cx + r0);
      const y0 = Math.max(0, cy - r0), y1 = Math.min(H - 1, cy + r0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r2) continue;
          const fall = 1 - Math.sqrt(dist2) / r0;
          const w = strength * fall * fall;
          const o = (y * W + x) * 4;
          bd[o] = Math.min(255, bd[o] + 255 * w);
          bd[o + 1] = Math.min(255, bd[o + 1] + 125 * w);
          bd[o + 2] = Math.min(255, bd[o + 2] + 35 * w);
          bd[o + 3] = Math.min(255, bd[o + 3] + 230 * w);
        }
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const g = alpha[i];
        if (g < 0.04) continue;

        const n = fbm(x * inv * 0.045 + 2.1, y * inv * 0.045 + 0.8 + t * 0.9);
        const edge = n;
        const heat = Math.max(0, Math.min(1, (t - (edge - 0.22)) / 0.22));
        const gone = t > edge;

        const baseR = rgb[i * 3];
        const baseG = rgb[i * 3 + 1];
        const baseB = rgb[i * 3 + 2];
        let r, gch, b, a;

        if (gone) {
          const rim = Math.max(0, 1 - (t - edge) / 0.055);
          if (rim <= 0.02) continue;
          r = 255;
          gch = 125 + 35 * rim;
          b = 32;
          a = rim * g * 0.95;
          if (rim > 0.25 && ((x + y) & 3) === 0) stampBloom(x, y, rim * 0.58 * g, 7);
          if (rim > 0.35 && rim < 0.95 && budget.n < budget.max && Math.random() < 0.045 * g) {
            spawnAsh(job, x, y, Math.random() > 0.4);
            budget.n++;
          }
        } else if (heat > 0) {
          const peak = heat < 0.55 ? heat / 0.55 : 1 - (heat - 0.55) / 0.45;
          const glow = Math.pow(peak, 0.85);
          const ashAmt = Math.max(0, (heat - 0.5) / 0.5);
          r = lerp(baseR, 255, glow * 0.95);
          gch = lerp(baseG, 155, glow * 0.85);
          b = lerp(baseB, 55, glow * 0.9);
          r = lerp(r, 55, ashAmt * 0.92);
          gch = lerp(gch, 32, ashAmt * 0.92);
          b = lerp(b, 18, ashAmt * 0.92);
          r = Math.min(255, r + 85 * glow * (1 - ashAmt));
          gch = Math.min(255, gch + 18 * glow * (1 - ashAmt));
          a = g * (0.35 + 0.65 * (1 - ashAmt * 0.85));
          if (glow > 0.2 && ((x + y) & 2) === 0) {
            stampBloom(x, y, glow * 0.48 * g * (1 - ashAmt * 0.5), 9);
          }
          if (heat > 0.55 && heat < 0.92 && budget.n < budget.max && Math.random() < 0.02 * g) {
            spawnAsh(job, x, y, true);
            budget.n++;
          }
        } else {
          r = baseR; gch = baseG; b = baseB; a = g;
        }

        const o = i * 4;
        d[o] = r; d[o + 1] = gch; d[o + 2] = b; d[o + 3] = Math.min(255, a * 255);
      }
    }

    const glowCvs = document.createElement("canvas");
    glowCvs.width = W; glowCvs.height = H;
    glowCvs.getContext("2d").putImageData(bloom, 0, 0);
    const blurCvs = document.createElement("canvas");
    blurCvs.width = W; blurCvs.height = H;
    const bx = blurCvs.getContext("2d");
    bx.filter = `blur(${Math.max(5, 7 * dpr)}px)`;
    bx.drawImage(glowCvs, 0, 0);
    bx.filter = "none";
    const glyphCvs = document.createElement("canvas");
    glyphCvs.width = W; glyphCvs.height = H;
    glyphCvs.getContext("2d").putImageData(img, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(blurCvs, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(blurCvs, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(glyphCvs, 0, 0);

    stepAsh(job, dt);
    drawAsh(job);
  }

  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    const elapsed = now - t0;

    if (!midFired && elapsed > DURATION * 0.38) {
      midFired = true;
      const cb = onMid;
      onMid = null;
      if (cb) cb();
    }

    let alive = false;
    for (const job of jobs) {
      const local = Math.max(0, elapsed - job.delay);
      const u = Math.min(1, local / DURATION);
      const eased = 1 - Math.pow(1 - u, 2.1);
      if (u < 1 || job.ash.length) {
        alive = true;
        renderJob(job, u < 1 ? eased * 1.05 : 1.05, dt);
      } else {
        job.canvas.style.opacity = "0";
      }
    }

    if (alive) {
      raf = requestAnimationFrame(tick);
      return;
    }
    finish();
  }

  function finish() {
    running = false;
    cancelAnimationFrame(raf);
    clearLayer();
    restoreSources();
    const cb = onDone;
    onDone = null;
    onMid = null;
    if (cb) cb();
  }

  function clearLayer() {
    if (!layer) return;
    layer.innerHTML = "";
    layer.classList.remove("is-burning");
  }

  function restoreSources() {
    document.querySelectorAll(".fx-el.is-burn-src").forEach((el) => {
      el.classList.remove("is-burn-src");
      el.style.removeProperty("visibility");
    });
    jobs = [];
  }

  async function play({ root, onComplete, onHalfway } = {}) {
    abort();
    if (!root) {
      if (typeof onComplete === "function") onComplete();
      return false;
    }

    const myGen = gen;
    ensureLayer();
    onDone = typeof onComplete === "function" ? onComplete : null;
    onMid = typeof onHalfway === "function" ? onHalfway : null;
    midFired = false;

    try {
      const els = pickElements(root);
      if (!els.length) {
        if (onDone) onDone();
        return false;
      }

      const built = [];
      for (let i = 0; i < els.length; i++) {
        if (myGen !== gen) return false;
        const el = els[i];
        const data = rasterizeGlyphs(el);
        if (!data) continue;

        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;
        canvas.className = "burn-el";
        canvas.style.left = `${data.left}px`;
        canvas.style.top = `${data.top}px`;
        canvas.style.width = `${data.cssW}px`;
        canvas.style.height = `${data.cssH}px`;

        el.classList.add("is-burn-src");
        el.style.visibility = "hidden";

        layer.appendChild(canvas);
        built.push({
          source: el,
          canvas,
          ctx: canvas.getContext("2d", { willReadFrequently: true }),
          alpha: data.alpha,
          rgb: data.rgb,
          dpr: data.dpr,
          delay: i * STAGGER,
          ash: [],
        });
      }

      if (myGen !== gen) return false;
      if (!built.length) {
        if (onDone) onDone();
        return false;
      }

      jobs = built;
      layer.classList.add("is-burning");
      running = true;
      t0 = performance.now();
      lastTs = t0;
      raf = requestAnimationFrame(tick);
      return true;
    } catch (err) {
      console.warn("[HisBurn] play error", err);
      clearLayer();
      restoreSources();
      if (onDone) onDone();
      return false;
    }
  }

  function abort() {
    gen += 1;
    running = false;
    cancelAnimationFrame(raf);
    onDone = null;
    onMid = null;
    clearLayer();
    restoreSources();
  }

  return {
    play,
    abort,
    get busy() { return running; },
    get supported() { return true; },
  };
})();
