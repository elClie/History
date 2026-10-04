/* Roster erosion — one WebGL canvas behind each .roster draws the frame and every portrait strip with
   eroded, glowing edges (same look as lab/erosion.html). The DOM .member-photo boxes only drive layout;
   photos are sampled from an atlas so the jagged edge cuts into the picture itself. */
(() => {
  const MAX = 6;
  const CELL_W = 600;
  const CELL_H = 800;
  const BLEED = 120;

  const FRAG = `
precision highp float;
#define N ${MAX}
uniform vec2 uRes;
uniform float uTime, uTan, uCount, uReveal;
uniform vec4 uBox[N];
uniform vec4 uState[N];
uniform vec4 uFrame;
uniform vec3 uTint[N];
uniform sampler2D uAtlas;

const vec3 GLOW = vec3(1.0, 0.48, 0.16);

${window.HisEroGLSL}
vec2 toLocal(vec2 s, vec4 b) {
  vec2 r = s - b.xy;
  return vec2(r.x - uTan * r.y, r.y);
}

vec3 frameTex(vec2 q) {
  float t = uTime;
  float mesh = 0.5 + 0.5 * sin(q.x * 2.2) * sin(q.y * 2.2);
  float moire = 0.5 + 0.5 * sin(q.y * 0.85 + sin(q.x * 0.005 + t * 0.1) * 14.0 + fbm(q * 0.004, 3) * 8.0);
  float grain = fbm(q * 0.06, 3) * 0.6 + noise(q * 0.45) * 0.4;
  vec3 dark = mix(vec3(0.035, 0.028, 0.07), vec3(0.24, 0.085, 0.09), grain * 0.8 + moire * 0.16);
  dark *= 0.82 + 0.18 * mesh;
  float sp = hash(floor(q / 2.0));
  dark += step(0.9976, sp) * (0.55 + 0.45 * sin(t * 3.0 + sp * 60.0)) * 0.6;
  return dark;
}

vec3 photo(int i, vec2 s, vec2 l, vec4 b, vec4 st) {
  vec2 r = s - b.xy;
  float w = 2.0 * b.z, h = 2.0 * b.w;
  float imgW = max(h * 0.75, w + h * abs(uTan));
  float imgH = imgW / 0.75;
  float u = clamp(r.x / imgW + 0.5, 0.004, 0.996);
  float v = clamp((r.y + b.w + (imgH - h) * 0.25) / imgH, 0.0, 1.0);
  vec3 c = texture2D(uAtlas, vec2((float(i) + u) / float(N), v)).rgb;
  float g = dot(c, vec3(0.3, 0.59, 0.11));
  return mix(c, mix(vec3(g), c, 0.4) * 0.36, st.y);
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float t = uTime;
  float hide = 1.0 - uReveal;
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 glow = vec3(0.0);

  // Frame edge takes the colour of the portrait nearest along the row
  vec3 ft = vec3(0.0);
  float fw = 0.0;
  for (int i = 0; i < N; i++) {
    if (float(i) >= uCount) break;
    float dx = (s.x - uBox[i].x) / (uBox[i].z + 30.0);
    float w = exp(-dx * dx);
    ft += uTint[i] * w;
    fw += w;
  }
  ft = fw > 1e-4 ? ft / fw : GLOW;

  vec2 lf = toLocal(s, uFrame);
  float Ef = 30.0 + hide * (uFrame.w + 40.0);
  vec2 ef = edge(s, lf, uFrame.zw, Ef, 0.37, 80.0);
  float gf = glowAmt(ef.y, 16.0, 0.75, 0.35);
  if (gf > 0.002) glow += ft * gf * flicker(lf, 0.37) * 0.5;

  for (int i = 0; i < N; i++) {
    if (float(i) >= uCount) break;
    vec4 b = uBox[i];
    vec4 st = uState[i];
    vec3 tint = uTint[i];
    float focus = st.x;
    float E = mix(12.0, 26.0, focus) + hide * (b.w + 40.0);
    // st.z = shockwave progress (0..1, < 0 = idle): the edge bites in and snaps back while rings race out and in
    float p = st.z;
    if (p >= 0.0) E += sin(p * 3.14159) * 22.0;
    float k = mix(10.0, 24.0, focus);
    float I = mix(0.6, 1.5, focus) * (1.0 - 0.6 * st.y);
    vec2 l = toLocal(s, b);
    vec2 e = edge(s, l, b.zw, E, st.w, 5.0 * k);
    if (e.x > 0.0) {
      col = photo(i, s, l, b, st);
      a = 1.0;
      col = mix(col, mix(tint, vec3(1.0), 0.55), rimMask(s, e.x, mix(4.0, 7.0, focus)) * (1.0 - 0.5 * st.y));
    }
    float g = glowAmt(e.y, k, 0.45, 0.6);
    if (g > 0.002) glow += mix(tint, vec3(1.0), focus * 0.35) * g * flicker(l, st.w) * I;
    float sp = hash(floor(s / 2.0) + st.w * 31.0);
    float ember = step(0.994, sp) * step(-k * 1.6, e.y) * step(e.y, 0.0);
    glow += mix(tint, vec3(1.0), 0.4) * ember * (0.5 + 0.5 * sin(t * 4.0 + sp * 80.0)) * I;

    if (p >= 0.0) glow += mix(tint, vec3(1.0), 0.5) * shock(s, l, e.y, p, b.z * 1.2, st.w);
  }
  // Frame sits under the portraits: only pay for its noise texture where no photo covered the pixel
  if (a < 1.0 && ef.x > 0.0) {
    col = frameTex(s);
    a = 0.9;
    col = mix(col, mix(ft, vec3(1.0), 0.5), rimMask(s, ef.x, 5.0) * 0.7);
  }
  glow *= bleedFade(s, uRes, ${BLEED}.0);

  vec3 rgb = col * a + glow;
  float alpha = clamp(a + max(glow.r, max(glow.g, glow.b)) * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(min(rgb, vec3(1.0)), alpha);
}`;

  const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";
  const UNIFORMS = ["uRes", "uTime", "uTan", "uCount", "uReveal", "uBox", "uState", "uFrame", "uTint", "uAtlas"];
  const DEFAULT_TINT = [1, 0.48, 0.16];

  /** Glow colour of a portrait: average of its bright, saturated pixels, pushed to full brightness. */
  function tintOf(img) {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 32;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const lum = 0.3 * R + 0.59 * G + 0.11 * B;
      const w = lum * lum * (0.25 + (mx > 0 ? (mx - mn) / mx : 0));
      r += R * w; g += G * w; b += B * w; sum += w;
    }
    if (sum < 1e-6) return DEFAULT_TINT;
    const avg = (r + g + b) / (3 * sum);
    const out = [r, g, b].map((v) => Math.max(0, avg + (v / sum - avg) * 1.35));
    const m = Math.max(...out) || 1;
    return out.map((v) => v / m);
  }

  function drawPlaceholder(ctx, x) {
    ctx.save();
    ctx.translate(x, 0);
    const lin = ctx.createLinearGradient(CELL_W * 0.59, 0, CELL_W * 0.41, CELL_H);
    lin.addColorStop(0, "#2a1814");
    lin.addColorStop(0.7, "#0c080c");
    lin.addColorStop(1, "#0c080c");
    ctx.fillStyle = lin;
    ctx.fillRect(0, 0, CELL_W, CELL_H);
    const r = 0.6 * Math.hypot(CELL_W * 0.5, CELL_H * 0.7);
    const rad = ctx.createRadialGradient(CELL_W * 0.5, CELL_H * 0.3, 0, CELL_W * 0.5, CELL_H * 0.3, r);
    rad.addColorStop(0, "rgba(226,59,47,0.22)");
    rad.addColorStop(1, "rgba(226,59,47,0)");
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, CELL_W, CELL_H);
    const k = CELL_W / 300;
    ctx.fillStyle = "rgba(240,217,160,0.16)";
    ctx.beginPath();
    ctx.arc(150 * k, 150 * k, 52 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(240,217,160,0.11)";
    ctx.beginPath();
    ctx.ellipse(150 * k, 400 * k, 122 * k, 98 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** object-fit: cover; object-position: 50% 25% */
  function drawCover(ctx, img) {
    const s = Math.max(CELL_W / img.naturalWidth, CELL_H / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (CELL_W - w) * 0.5, (CELL_H - h) * 0.25, w, h);
  }

  function mount(roster) {
    const slide = roster.closest(".slide");
    const members = [...roster.querySelectorAll(".member")].slice(0, MAX);
    const photos = members.map((m) => m.querySelector(".member-photo"));

    const canvas = document.createElement("canvas");
    canvas.className = "roster-fx";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.inset = `-${BLEED}px`;
    canvas.style.width = canvas.style.height = `calc(100% + ${BLEED * 2}px)`;
    roster.prepend(canvas);

    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) {
      roster.classList.add("no-gl");
      return;
    }

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, "a");
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

    // Atlas: placeholders first, real photos patched in per cell (a tainted image just falls back to the DOM <img>)
    const atlas = document.createElement("canvas");
    atlas.width = CELL_W * MAX;
    atlas.height = CELL_H;
    const actx = atlas.getContext("2d");
    for (let i = 0; i < MAX; i++) drawPlaceholder(actx, i * CELL_W);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.uniform1i(U.uAtlas, 0);

    const tints = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) tints.set(DEFAULT_TINT, i * 3);

    photos.forEach((ph, i) => {
      const img = ph?.querySelector("img");
      if (!img) return;
      const upload = () => {
        if (!img.naturalWidth) return;
        const cell = document.createElement("canvas");
        cell.width = CELL_W;
        cell.height = CELL_H;
        drawCover(cell.getContext("2d"), img);
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, i * CELL_W, 0, gl.RGBA, gl.UNSIGNED_BYTE, cell);
          tints.set(tintOf(img), i * 3);
        } catch (err) {
          console.warn("[roster-fx] photo fell back to DOM", err);
          ph.classList.add("is-dom");
        }
      };
      if (img.complete) upload();
      else img.addEventListener("load", upload, { once: true });
    });

    const state = members.map((_, i) => ({ focus: 0, dim: 0, shock: -1, current: false, seed: 0.21 + i * 1.37 }));
    const boxes = new Float32Array(MAX * 4);
    const states = new Float32Array(MAX * 4);
    const skew = Math.tan((parseFloat(getComputedStyle(roster).getPropertyValue("--skew")) || -9) * Math.PI / 180);
    let time = 0;
    let reveal = 1;
    let wasActive = false;
    let last = performance.now();

    function resize() {
      const w = Math.max(1, Math.round(canvas.clientWidth));
      const h = Math.max(1, Math.round(canvas.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    new ResizeObserver(resize).observe(canvas);

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const active = slide.classList.contains("active") || slide.classList.contains("is-leaving");
      if (!active) {
        wasActive = false;
        return;
      }
      if (!wasActive && slide.classList.contains("is-entering")) reveal = 0;
      wasActive = true;
      time += dt;
      reveal = Math.min(1, reveal + dt / 1.1);

      const c = canvas.getBoundingClientRect();
      const hasCurrent = roster.classList.contains("has-current");
      const ease = 1 - Math.exp(-dt * 7);
      let left = Infinity;
      let right = -Infinity;
      let minHh = Infinity;
      let cy = 0;
      members.forEach((m, i) => {
        const ph = photos[i];
        const r = ph.getBoundingClientRect();
        const hw = ph.offsetWidth / 2;
        const hh = ph.offsetHeight / 2;
        const x = (r.left + r.right) / 2 - c.left;
        const y = (r.top + r.bottom) / 2 - c.top;
        boxes.set([x, y, hw, hh], i * 4);
        left = Math.min(left, x - hw);
        right = Math.max(right, x + hw);
        minHh = Math.min(minHh, hh);
        cy += y;

        const s = state[i];
        const current = m.classList.contains("is-current");
        if (current && !s.current) s.shock = 0;
        s.current = current;
        const hover = !current && m.matches(":hover") ? 0.22 : 0;
        s.focus += ((current ? 1 : hover) - s.focus) * ease;
        s.dim += ((hasCurrent && !current ? 1 : 0) - s.dim) * ease;
        if (s.shock >= 0) {
          s.shock += dt / 0.6;
          if (s.shock > 1) s.shock = -1;
        }
        const shock = s.shock < 0 ? -1 : 1 - (1 - s.shock) ** 2;
        states.set([s.focus, s.dim, shock, s.seed], i * 4);
      });
      cy /= members.length || 1;

      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uTan, skew);
      gl.uniform1f(U.uCount, members.length);
      gl.uniform1f(U.uReveal, 1 - Math.pow(1 - reveal, 3));
      gl.uniform4fv(U.uBox, boxes);
      gl.uniform4fv(U.uState, states);
      gl.uniform3fv(U.uTint, tints);
      gl.uniform4f(U.uFrame, (left + right) / 2, cy, (right - left) / 2 + 18, minHh + 18);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    resize();
    requestAnimationFrame(frame);
  }

  document.querySelectorAll(".roster").forEach((r) => {
    try {
      mount(r);
    } catch (err) {
      console.warn("[roster-fx] disabled", err);
      r.classList.add("no-gl");
    }
  });
})();
