/* Archival photos with eroded glowing edges — every <figure class="ero-photo"><img></figure> on the visible
   slide is drawn by ONE shared WebGL context, then copied into the figure's own 2D canvas (Chrome caps live
   GL contexts, so one-per-photo doesn't scale). Ink→gold duotone, film grain, edges grow in when the photo
   becomes visible. .is-focus = stronger glow + shockwave, .is-dim = darker (deck.js sets both from steps).
   Attributes: data-focal="50% 30%" (object-position), data-tint="#ff8a3a" (glow colour). */
(() => {
  const BLEED = 120;
  const DEFAULT_TINT = "#ff8a3a";

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uReveal, uFocus, uDim, uShock, uSeed, uBurn;
uniform vec4 uBox;
uniform vec2 uImg;
uniform vec2 uFocal;
uniform vec3 uTint;
uniform sampler2D uTex;
${window.HisEroGLSL}

vec3 duotone(float L) {
  vec3 ink = vec3(0.035, 0.028, 0.045);
  vec3 umber = vec3(0.30, 0.15, 0.08);
  vec3 gold = vec3(0.86, 0.69, 0.44);
  vec3 paper = vec3(1.0, 0.95, 0.84);
  vec3 c = mix(ink, umber, smoothstep(0.0, 0.38, L));
  c = mix(c, gold, smoothstep(0.32, 0.74, L));
  return mix(c, paper, smoothstep(0.7, 1.0, L));
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 hs = uBox.zw;
  vec2 l = s - uBox.xy;
  float t = uTime;
  float E = mix(18.0, 30.0, uFocus) + (1.0 - uReveal) * (min(hs.x, hs.y) + 40.0);
  if (uShock >= 0.0) E += sin(uShock * 3.14159) * 20.0;
  E += uBurn * (min(hs.x, hs.y) * 1.3 + 60.0);
  float k = mix(11.0, 22.0, uFocus) + uBurn * 14.0;
  vec2 e = edge(s, l, hs, E, uSeed, 5.0 * k);
  e -= vec2(uBurn * uBurn * (min(hs.x, hs.y) * 1.25 + 40.0));

  vec3 col = vec3(0.0);
  float a = 0.0;
  if (e.x > 0.0) {
    vec2 box = hs * 2.0;
    float sc = max(box.x / uImg.x, box.y / uImg.y);
    vec2 drawn = uImg * sc;
    vec2 uv = (l + hs - (box - drawn) * uFocal) / drawn;
    vec3 c = texture2D(uTex, clamp(uv, 0.001, 0.999)).rgb;
    float L = dot(c, vec3(0.3, 0.59, 0.11));
    L = smoothstep(0.03, 0.97, L);
    L += (hash(s + floor(t * 24.0) * 17.0) - 0.5) * 0.07;
    float d = min(hs.x - abs(l.x), hs.y - abs(l.y));
    col = duotone(clamp(L, 0.0, 1.0)) * mix(0.72, 1.0, smoothstep(0.0, 80.0, d));
    col *= mix(1.0, 0.42, uDim);
    col = mix(col, mix(uTint, vec3(1.0), 0.55), rimMask(s, e.x, mix(4.0, 7.0, uFocus)) * (1.0 - 0.5 * uDim));
    a = 1.0;
  }

  float I = mix(0.55, 1.4, uFocus) * (1.0 - 0.55 * uDim) * (1.0 + uBurn * (1.0 - uBurn) * 4.0);
  vec3 glow = mix(uTint, vec3(1.0), uFocus * 0.3) * glowAmt(e.y, k, 0.6, 0.5) * flicker(l, uSeed) * I;
  float sp = hash(floor(s / 2.0) + uSeed * 31.0);
  float ember = step(0.994, sp) * step(-k * 1.6, e.y) * step(e.y, 0.0);
  glow += mix(uTint, vec3(1.0), 0.4) * ember * (0.5 + 0.5 * sin(t * 4.0 + sp * 80.0)) * I;
  if (uShock >= 0.0) glow += mix(uTint, vec3(1.0), 0.5) * shock(s, l, e.y, uShock, min(hs.x, hs.y) * 1.2, uSeed);
  glow *= bleedFade(s, uRes, ${BLEED}.0);

  vec3 rgb = min(col * a + glow, vec3(1.0));
  gl_FragColor = vec4(rgb, clamp(max(a, max(rgb.r, max(rgb.g, rgb.b))), 0.0, 1.0));
}`;

  const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";
  const UNIFORMS = ["uRes", "uTime", "uReveal", "uFocus", "uDim", "uShock", "uSeed", "uBurn", "uBox", "uImg", "uFocal", "uTint", "uTex"];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

  const glCanvas = document.createElement("canvas");
  const gl = glCanvas.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });
  const figures = [...document.querySelectorAll(".ero-photo")];
  if (!figures.length) return;
  if (!gl) {
    figures.forEach((f) => f.classList.add("is-dom"));
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
  gl.uniform1i(U.uTex, 0);
  gl.activeTexture(gl.TEXTURE0);

  const items = figures.map((fig, i) => {
    const canvas = document.createElement("canvas");
    canvas.className = "ero-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.inset = `-${BLEED}px`;
    fig.appendChild(canvas);
    const focal = (fig.dataset.focal || "50% 50%").split(/\s+/).map((v) => parseFloat(v) / 100);
    const item = {
      fig,
      slide: fig.closest(".slide"),
      canvas,
      ctx: canvas.getContext("2d"),
      img: fig.querySelector("img"),
      tex: null,
      focal: [focal[0] ?? 0.5, focal[1] ?? 0.5],
      tint: hex(fig.dataset.tint || DEFAULT_TINT),
      seed: 0.37 + i * 1.91,
      reveal: 0,
      revealAt: 0,
      focus: 0.5,
      dim: 0,
      shock: -1,
      shockAt: -1e9,
      burn: 0,
      burnAt: 0,
      wasBurnt: false,
      wasFocus: false,
      shown: false,
    };
    const upload = () => {
      if (!item.img?.naturalWidth) return;
      try {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, item.img);
        item.tex = tex;
      } catch (err) {
        console.warn("[ero-photo] fell back to DOM", err);
        fig.classList.add("is-dom");
      }
    };
    if (item.img?.complete) upload();
    else item.img?.addEventListener("load", upload, { once: true });
    return item;
  });

  let time = 0;
  let last = performance.now();

  function draw(item, w, h) {
    if (glCanvas.width < w || glCanvas.height < h) {
      glCanvas.width = Math.max(glCanvas.width, w);
      glCanvas.height = Math.max(glCanvas.height, h);
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform4f(U.uBox, w / 2, h / 2, w / 2 - BLEED, h / 2 - BLEED);
    gl.uniform2f(U.uImg, item.img.naturalWidth, item.img.naturalHeight);
    gl.uniform2f(U.uFocal, item.focal[0], item.focal[1]);
    gl.uniform3fv(U.uTint, item.tint);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uReveal, 1 - Math.pow(1 - item.reveal, 3));
    gl.uniform1f(U.uFocus, item.focus);
    gl.uniform1f(U.uDim, item.dim);
    gl.uniform1f(U.uShock, item.shock < 0 ? -1 : 1 - (1 - item.shock) ** 2);
    gl.uniform1f(U.uSeed, item.seed);
    gl.uniform1f(U.uBurn, item.burn);
    gl.bindTexture(gl.TEXTURE_2D, item.tex);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    item.ctx.clearRect(0, 0, w, h);
    item.ctx.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const ease = 1 - Math.exp(-dt * 7);
    for (const item of items) {
      const live = item.slide?.classList.contains("active") || item.slide?.classList.contains("is-leaving");
      const visible = live && item.tex && item.fig.checkVisibility({ visibilityProperty: true });
      if (!visible) {
        if (item.shown) item.ctx.clearRect(0, 0, item.canvas.width, item.canvas.height);
        item.shown = false;
        continue;
      }
      if (!item.shown) item.revealAt = now;
      item.shown = true;
      const focused = item.fig.classList.contains("is-focus");
      if (focused && !item.wasFocus) item.shockAt = now;
      item.wasFocus = focused;
      item.focus += ((focused ? 1 : 0.5) - item.focus) * ease;
      item.dim += ((item.fig.classList.contains("is-dim") ? 1 : 0) - item.dim) * ease;
      item.reveal = Math.min(1, (now - item.revealAt) / 1100);
      const burnt = item.fig.classList.contains("is-burnt");
      if (burnt !== item.wasBurnt) item.burnAt = now;
      item.wasBurnt = burnt;
      item.burn = burnt ? Math.min(1, (now - item.burnAt) / 2600) ** 1.6 : 0;
      const sp = (now - item.shockAt) / 600;
      item.shock = sp >= 0 && sp <= 1 ? sp : -1;
      const w = Math.round(item.fig.offsetWidth) + BLEED * 2;
      const h = Math.round(item.fig.offsetHeight) + BLEED * 2;
      if (item.canvas.width !== w || item.canvas.height !== h) {
        item.canvas.width = w;
        item.canvas.height = h;
      }
      draw(item, w, h);
    }
  }
  requestAnimationFrame(frame);
})();
