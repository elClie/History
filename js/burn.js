/* Method A glyph burn — bake letter stencil once, burn on GPU (WebGL).
   Same heat/rim/ash recipe as the CPU demo; no screen-capture boxes. */
window.HisBurn = (() => {
  const LAYER_ID = "burn-layer";
  const MAX_ELS = 12;
  const DURATION = 2200;
  const STAGGER = 80;
  const PAD = 40;
  const SCORCH_FADE = 920; // brown afterglow ease-out after burn

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

  /* ---- shared WebGL ---- */
  let glCanvas = null;
  let gl = null;
  let program = null;
  let loc = null;
  let quadBuf = null;
  let useGpu = false;

  const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  // Port of Method A heat/rim logic; fBm edge + soft orange bloom via taps
  const FRAG = `
precision mediump float;
uniform sampler2D u_glyph;
uniform float u_progress;
uniform vec2 u_res;
uniform float u_dpr;
varying vec2 v_uv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * (noise(p) * 2.0 - 1.0);
    p *= 2.02;
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

void main() {
  vec4 gSample = texture2D(u_glyph, v_uv);
  float g = gSample.a;
  vec2 px = v_uv * u_res;
  float inv = 1.0 / max(u_dpr, 1.0);
  float t = u_progress;
  float edge = fbm(vec2(px.x * inv * 0.045 + 2.1, px.y * inv * 0.045 + 0.8 + t * 0.9));
  // Gate heat so frame 0 matches the live text (no sudden brighten)
  float heat = clamp((t - (edge - 0.22)) / 0.22, 0.0, 1.0);
  heat *= smoothstep(0.02, 0.12, t);
  float gone = step(edge, t);

  vec3 base = gSample.rgb;
  vec3 col = base;
  float a = g;

  if (g >= 0.04) {
    if (gone > 0.5) {
      float rim = max(0.0, 1.0 - (t - edge) / 0.055);
      // Charred brown imprint — hangs around, dies as t climbs in the tail
      float scorch = g * 0.34 * smoothstep(edge, edge + 0.1, t);
      scorch *= (1.0 - smoothstep(1.08, 1.48, t));
      if (rim > 0.02) {
        col = vec3(1.0, (125.0 + 35.0 * rim) / 255.0, 32.0 / 255.0);
        a = rim * g * 0.95;
      } else if (scorch > 0.015) {
        col = vec3(0.27, 0.15, 0.09);
        a = scorch;
      } else {
        a = 0.0;
      }
    } else if (heat > 0.0) {
      float peak = heat < 0.55 ? heat / 0.55 : 1.0 - (heat - 0.55) / 0.45;
      float glow = pow(peak, 0.85);
      float ashAmt = max(0.0, (heat - 0.5) / 0.5);
      col = mix(base, vec3(1.0, 155.0 / 255.0, 55.0 / 255.0), glow * 0.95);
      col = mix(col, vec3(55.0, 32.0, 18.0) / 255.0, ashAmt * 0.92);
      col += vec3(85.0, 18.0, 0.0) / 255.0 * glow * (1.0 - ashAmt);
      a = g * (0.35 + 0.65 * (1.0 - ashAmt * 0.85));
    }
  } else {
    a = 0.0;
  }

  // soft bloom taps — only once fire has actually started
  float bloom = 0.0;
  float wHeat = max(heat * g, a * gone);
  if (wHeat > 0.08 && t > 0.08) {
    vec2 texel = 1.0 / u_res;
    float rad = mix(9.0, 7.0, gone) * u_dpr;
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.785398;
      vec2 off = vec2(cos(ang), sin(ang)) * texel * rad;
      bloom += texture2D(u_glyph, clamp(v_uv + off, 0.0, 1.0)).a;
      bloom += texture2D(u_glyph, clamp(v_uv + off * 0.45, 0.0, 1.0)).a * 0.55;
    }
    bloom = (bloom / 12.4) * max(wHeat, heat * 0.35) * 0.6;
    if (bloom > 0.02) {
      vec3 bcol = vec3(1.0, 0.49, 0.14);
      if (a < 0.02) {
        col = bcol;
        a = bloom * 0.7;
      } else {
        col = mix(col, bcol, clamp(bloom, 0.0, 0.85));
        a = max(a, bloom * 0.55);
      }
    }
  }

  if (a < 0.02) discard;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[HisBurn] shader", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function ensureGpu() {
    if (useGpu && gl && program) return true;
    try {
      glCanvas = document.createElement("canvas");
      gl = glCanvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) return false;
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn("[HisBurn] link", gl.getProgramInfoLog(program));
        return false;
      }
      loc = {
        a_pos: gl.getAttribLocation(program, "a_pos"),
        u_glyph: gl.getUniformLocation(program, "u_glyph"),
        u_progress: gl.getUniformLocation(program, "u_progress"),
        u_res: gl.getUniformLocation(program, "u_res"),
        u_dpr: gl.getUniformLocation(program, "u_dpr"),
      };
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      useGpu = true;
      return true;
    } catch (err) {
      console.warn("[HisBurn] WebGL unavailable", err);
      useGpu = false;
      return false;
    }
  }

  function uploadTexture(imageSource, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource);
    return tex;
  }

  function drawGpu(job, progress) {
    const { W, H, dpr, tex } = job;
    if (glCanvas.width !== W || glCanvas.height !== H) {
      glCanvas.width = W;
      glCanvas.height = H;
    }
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(loc.a_pos);
    gl.vertexAttribPointer(loc.a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc.u_glyph, 0);
    gl.uniform1f(loc.u_progress, progress);
    gl.uniform2f(loc.u_res, W, H);
    gl.uniform1f(loc.u_dpr, dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const ctx = job.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(glCanvas, 0, 0);
    // Additive glow ramps in with fire — not on the handoff frame
    const glow = Math.max(0, Math.min(1, (progress - 0.08) / 0.32));
    if (glow > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.3 * glow;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
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
      return (el.innerText || "").trim().length > 0;
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

  /** Match CSS text-transform — canvas fillText ignores it otherwise. */
  function displayChar(ch, transform, full, index) {
    if (!ch || ch === "\n" || ch === "\r") return ch;
    const t = (transform || "none").toLowerCase();
    if (t === "uppercase") return ch.toLocaleUpperCase("vi-VN");
    if (t === "lowercase") return ch.toLocaleLowerCase("vi-VN");
    if (t === "capitalize") {
      const prev = index > 0 ? full[index - 1] : " ";
      if (/\s/.test(prev) || prev === "/" || prev === "-" || prev === "·") {
        return ch.toLocaleUpperCase("vi-VN");
      }
      return ch.toLocaleLowerCase("vi-VN");
    }
    return ch;
  }

  /** Place fillText so the glyph sits on the same baseline as the live Range box. */
  function paintChar(ctx, drawn, rangeRect, originX, originY) {
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const m = ctx.measureText(drawn);
    const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    let baselineY;
    if (ascent != null && descent != null) {
      const fontBox = ascent + descent;
      // Range often includes line-height leading — center the font box in it
      const lead = Math.max(0, rangeRect.height - fontBox);
      baselineY = rangeRect.top - originY + lead * 0.5 + ascent;
    } else if (ascent != null) {
      baselineY = rangeRect.top - originY + ascent;
    } else {
      // Latin-ish: baseline ~78% down the em box
      baselineY = rangeRect.top - originY + rangeRect.height * 0.78;
    }
    // inkLeft = alignX - actualBoundingBoxLeft → alignX = inkLeft + left
    const left = m.actualBoundingBoxLeft || 0;
    ctx.fillText(
      drawn,
      rangeRect.left - originX + left,
      baselineY
    );
  }

  /** Bake letter ink once → canvas + sparse ember seeds. */
  function bakeGlyphs(el) {
    const rect = el.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    // Exact CSS↔device mapping (floor/ceil mismatch stretches sideways)
    const cssW = rect.width + PAD * 2;
    const cssH = rect.height + PAD * 2;
    if (cssW < 4 || cssH < 4) return null;

    const canvasW = Math.max(1, Math.round(cssW * dpr));
    const canvasH = Math.max(1, Math.round(cssH * dpr));
    const styleW = canvasW / dpr;
    const styleH = canvasH / dpr;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, styleW, styleH);

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

      ctx.font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color || "#f2e6d0";

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
        const rects = range.getClientRects();
        const r = rects.length ? rects[0] : range.getBoundingClientRect();
        if (r.width < 0.25 && ch === " ") continue;
        if (r.height < 0.5) continue;
        const drawn = displayChar(ch, cs.textTransform, raw, i);
        paintChar(ctx, drawn, r, originX, originY);
        painted++;
      }
    }

    if (!painted) {
      const cs = getComputedStyle(el);
      ctx.font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color || "#f2e6d0";
      ctx.textBaseline = "alphabetic";
      let text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const tr = (cs.textTransform || "none").toLowerCase();
      if (tr === "uppercase") text = text.toLocaleUpperCase("vi-VN");
      else if (tr === "lowercase") text = text.toLocaleLowerCase("vi-VN");
      else if (tr === "capitalize") {
        text = text.replace(/\S+/g, (w) =>
          w.charAt(0).toLocaleUpperCase("vi-VN") + w.slice(1).toLocaleLowerCase("vi-VN")
        );
      }
      const maxW = rect.width;
      const fontSize = parseFloat(cs.fontSize) || 16;
      const lineH = parseFloat(cs.lineHeight) || fontSize * 1.3;
      const m0 = ctx.measureText("Hg");
      const ascent = m0.fontBoundingBoxAscent ?? fontSize * 0.8;
      const words = text.split(" ");
      let line = "";
      let y = PAD + (lineH - (m0.fontBoundingBoxAscent ?? fontSize) - (m0.fontBoundingBoxDescent ?? fontSize * 0.2)) * 0.5 + ascent;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, PAD, y);
          painted++;
          line = w;
          y += lineH;
          if (y > PAD + rect.height) break;
        } else line = test;
      }
      if (line && y <= PAD + rect.height) {
        ctx.fillText(line, PAD, y);
        painted++;
      }
    }

    if (!painted) return null;

    // sparse seeds for rising ash (no per-frame full scan)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const seeds = [];
    const step = Math.max(3, Math.floor(Math.min(canvas.width, canvas.height) / 48));
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        if (img.data[(y * canvas.width + x) * 4 + 3] > 40) {
          seeds.push(x, y);
        }
      }
    }

    return {
      bake: canvas,
      seeds,
      width: canvasW,
      height: canvasH,
      cssW: styleW,
      cssH: styleH,
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

  function maybeSpawnAsh(job, progress, dt) {
    const seeds = job.seeds;
    if (!seeds.length) return;
    const n = Math.min(6, Math.floor(3 + progress * 8));
    const count = seeds.length / 2;
    for (let k = 0; k < n; k++) {
      if (Math.random() > 0.55 + progress * 0.25) continue;
      const i = ((Math.random() * count) | 0) * 2;
      spawnAsh(job, seeds[i], seeds[i + 1], Math.random() > 0.4);
    }
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
    if (useGpu && job.tex) {
      drawGpu(job, progress);
    } else {
      // emergency: just show baked glyph fading
      const { ctx, bake, W, H } = job;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.drawImage(bake, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (progress > 0.12 && progress < 1.02) maybeSpawnAsh(job, progress, dt);
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

      if (u < 1) {
        alive = true;
        job.canvas.style.opacity = "1";
        renderJob(job, eased * 1.05, dt);
        continue;
      }

      // Burn finished — keep brown scorch + ash, ease them out
      if (job.tailT0 == null) job.tailT0 = now;
      const tail = (now - job.tailT0) / SCORCH_FADE;
      const ashAlive = job.ash.length > 0;
      // Let ash hang a beat, then opacity ease (quadratic) clears the scorch
      const fadeGate = ashAlive ? 0.25 : 0;
      const fadeU = Math.max(0, Math.min(1, (tail - fadeGate) / Math.max(0.001, 1 - fadeGate)));
      const scorchProgress = 1.05 + Math.min(0.42, tail * 0.45);

      if (fadeU < 1 || ashAlive) {
        alive = true;
        job.canvas.style.opacity = String(1 - fadeU * fadeU);
        renderJob(job, scorchProgress, dt);
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
    for (const job of jobs) {
      if (job.tex && gl) {
        try { gl.deleteTexture(job.tex); } catch (_) { /* ignore */ }
      }
    }
    if (layer) {
      layer.innerHTML = "";
      layer.classList.remove("is-burning");
    }
    jobs = [];
  }

  function restoreSources() {
    document.querySelectorAll(".fx-el.is-burn-src, .fx-el.is-burn-fade").forEach((el) => {
      el.classList.remove("is-burn-src", "is-burn-fade");
      el.style.removeProperty("visibility");
      el.style.removeProperty("opacity");
    });
  }

  function fadeSlideChrome(root, burnedSet) {
    // Soft-fade cards/boxes/labels so chrome doesn't hard-pop when text burns
    root.querySelectorAll(".fx-el").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      el.classList.add("is-burn-fade");
      if (burnedSet.has(el)) el.classList.add("is-burn-src");
    });
  }

  async function play({ root, onComplete, onHalfway } = {}) {
    abort();
    if (!root) {
      if (typeof onComplete === "function") onComplete();
      return false;
    }

    const myGen = gen;
    ensureLayer();
    ensureGpu();
    onDone = typeof onComplete === "function" ? onComplete : null;
    onMid = typeof onHalfway === "function" ? onHalfway : null;
    midFired = false;

    try {
      const els = pickElements(root);
      if (!els.length) {
        // still fade chrome even if nothing burns
        fadeSlideChrome(root, new Set());
        if (onDone) onDone();
        return false;
      }

      const built = [];
      const burnedSet = new Set();
      for (let i = 0; i < els.length; i++) {
        if (myGen !== gen) return false;
        const el = els[i];
        const data = bakeGlyphs(el);
        if (!data) continue;

        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;
        canvas.className = "burn-el";
        canvas.style.left = `${data.left}px`;
        canvas.style.top = `${data.top}px`;
        canvas.style.width = `${data.cssW}px`;
        canvas.style.height = `${data.cssH}px`;

        burnedSet.add(el);
        layer.appendChild(canvas);

        let tex = null;
        if (useGpu) tex = uploadTexture(data.bake, data.width, data.height);

        built.push({
          source: el,
          canvas,
          ctx: canvas.getContext("2d"),
          bake: data.bake,
          seeds: data.seeds,
          tex,
          W: data.width,
          H: data.height,
          dpr: data.dpr,
          delay: i * STAGGER,
          ash: [],
          tailT0: null,
        });
      }

      if (myGen !== gen) return false;
      if (!built.length) {
        fadeSlideChrome(root, burnedSet);
        if (onDone) onDone();
        return false;
      }

      // Show burn canvases first at progress 0 (matched glyphs), THEN fade DOM
      // so text doesn't snap when the source disappears.
      jobs = built;
      layer.classList.add("is-burning");
      for (const job of jobs) renderJob(job, 0, 0);

      requestAnimationFrame(() => {
        if (myGen !== gen) return;
        fadeSlideChrome(root, burnedSet);
        running = true;
        t0 = performance.now();
        lastTs = t0;
        raf = requestAnimationFrame(tick);
      });
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

  // warm GL early
  if (document.readyState === "complete") ensureGpu();
  else window.addEventListener("load", () => ensureGpu(), { once: true });

  return {
    play,
    abort,
    get busy() { return running; },
    get supported() { return true; },
    get usingGpu() { return useGpu; },
  };
})();
