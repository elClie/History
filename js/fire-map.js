/* Phần 2 fire map — <div class="fire-map" data-view="full|north"> becomes an SVG Vietnam (Hoàng Sa, Trường Sa
   included) with a WebGL fire layer that spreads from towns as the slide's .stepper advances.
   Map attributes:  data-ember / data-late / data-occupied / data-labels / data-ref = space-separated town ids.
   Step attributes (cumulative up to the current step): data-light, data-ember, data-spread, data-all, data-arrow.
   Current step only: data-shock (shockwave at towns), data-pop (shows .fm-pop[data-pop=…] with a leader line). */
(() => {
  const data = window.HisMapData;
  const maps = [...document.querySelectorAll(".fire-map")];
  if (!data || !maps.length) return;

  const [LON0, , , LAT1, KX, SY] = data.box;
  const proj = (lon, lat) => [(lon - LON0) * KX, (LAT1 - lat) * SY];
  const VIEWS = {
    full: [0, 0, data.w, data.h],
    north: (() => {
      const [x0, y0] = proj(102.2, 23.5);
      const [x1, y1] = proj(109.4, 17.5);
      return [x0, y0, x1 - x0, y1 - y0];
    })(),
  };
  const REGIONS = { dbsh: proj(106.35, 20.62) };
  const NAMES = {
    hanoi: "Hà Nội", hue: "Huế", saigon: "Sài Gòn", tantrao: "Tân Trào", thainguyen: "Thái Nguyên",
    bacgiang: "Bắc Giang", haiduong: "Hải Dương", hatinh: "Hà Tĩnh", quangnam: "Quảng Nam",
    dongnaithuong: "Đồng Nai Thượng", hatien: "Hà Tiên", thanhhoa: "Thanh Hóa", nghean: "Nghệ An",
    dbsh: "ĐB sông Hồng",
  };
  const SIDE = { hanoi: "l", tantrao: "l", thanhhoa: "l", nghean: "l", hatien: "l", dongnaithuong: "l", bacgiang: "t", thainguyen: "r", dbsh: "r" };
  const MAJOR = new Set(["hanoi", "hue", "saigon"]);
  const NP = 80;
  const SVGNS = "http://www.w3.org/2000/svg";

  const FRAG = `
precision highp float;
#define NP ${NP}
uniform vec2 uRes;
uniform float uTime, uAll, uScale;
uniform int uCount;
uniform vec4 uPt[NP];
uniform vec4 uShock[4];
uniform sampler2D uMask;
${window.HisEroGLSL}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec4 m = texture2D(uMask, s / uRes);
  float land = m.r;
  float soft = m.g;
  vec2 p = s / uScale;
  // Everything built on warp/flame is multiplied by land: the sea skips both fbm passes.
  // warp is in [-0.5, 0.44], so a town can only light pixels within 1.53 * radius; its glow is < 0.003 past 4.64 * radius.
  bool onLand = land > 0.002;
  float warp = 0.0;
  bool hasWarp = false;

  float f = 0.0;
  float near = 0.0;
  for (int i = 0; i < NP; i++) {
    if (i >= uCount) break;
    vec4 q = uPt[i];
    float d = length(s - q.xy);
    if (d > q.z * 4.64 + 5.8) continue;
    near = max(near, q.w * exp(-d / (q.z * 0.8 + 1.0)));
    if (!onLand || d > q.z * 1.53) continue;
    if (!hasWarp) {
      warp = fbm(p * 0.03 + vec2(0.0, uTime * 0.06), 4) - 0.5;
      hasWarp = true;
    }
    float dd = d + warp * q.z * 0.95;
    f = max(f, q.w * (1.0 - smoothstep(q.z * 0.5, q.z * 1.05, dd)));
  }
  if (onLand && uAll > 0.0) {
    if (!hasWarp) warp = fbm(p * 0.03 + vec2(0.0, uTime * 0.06), 4) - 0.5;
    f = max(f, clamp(uAll * 1.7 - 0.45 + warp * 1.1, 0.0, 1.0));
  }

  vec3 deep = vec3(0.30, 0.03, 0.02);
  vec3 hot = vec3(1.0, 0.40, 0.07);
  vec3 white = vec3(1.0, 0.86, 0.56);

  float lit = 0.0;
  vec3 col = vec3(0.0);
  if (onLand && f > 0.0) {
    lit = smoothstep(0.46, 0.54, f) * land;
    float rim = exp(-pow((f - 0.5) / 0.09, 2.0)) * land;
    float flame = fbm(p * 0.07 + vec2(warp * 2.0, uTime * 0.8), 4);
    float core = smoothstep(0.55, 1.0, f);
    col = mix(deep, hot, smoothstep(0.2, 0.7, flame)) * lit * (0.8 + 0.9 * flame);
    col += mix(hot, white, 0.5) * core * lit * flame * 0.8;
    col += white * rim * (1.3 + 0.9 * flame);
    col += hot * smoothstep(0.04, 0.45, f) * (1.0 - lit) * land * (0.45 + 1.0 * flame);
    float sp = hash(floor(s / 2.0) + floor(uTime * 9.0) * 7.0);
    col += white * step(0.99, sp) * lit * 1.6;
  }
  col += hot * near * (0.3 + soft * 0.7) * 0.7 * (1.0 - land * 0.6);

  for (int j = 0; j < 4; j++) {
    vec4 k = uShock[j];
    if (k.z < 0.0 || k.z > 1.0) continue;
    float d = length(s - k.xy);
    float fade = (1.0 - k.z) * (1.0 - k.z);
    float R = k.z * k.w * uScale;
    float jit = (noise(s * 0.04 + k.xy * 0.01) - 0.5) * 18.0 * uScale;
    float w = (5.0 + 22.0 * k.z) * uScale;
    float ring = exp(-pow((d - R + jit) / w, 2.0));
    col += mix(white, hot, k.z) * ring * fade * 1.7;
    col += white * exp(-d / (24.0 * uScale)) * fade * 1.3;
  }

  col = 1.0 - exp(-col * 1.25);
  float a = clamp(max(col.r, max(col.g, col.b)) + lit * 0.55, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;
  const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";

  const ids = (s) => (s || "").split(/\s+/).filter(Boolean);
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  function svg(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    parent?.appendChild(el);
    return el;
  }

  function buildSvg(root, view) {
    const s = svg("svg", { class: "fm-svg", viewBox: view.join(" "), preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    svg("path", { class: "fm-near", d: data.near }, s);
    svg("path", { class: "fm-land", d: data.vn }, s);
    const isl = svg("g", { class: "fm-islands" }, s);
    for (const [x, y, r] of [...data.hoangSa, ...data.truongSa, ...data.islets]) svg("circle", { cx: x, cy: y, r }, isl);
    const label = (txt, lon, lat) => {
      const [x, y] = proj(lon, lat);
      svg("text", { class: "fm-isl-label", x, y }, s).textContent = txt;
    };
    label("QĐ. Hoàng Sa", 111.9, 15.3);
    label("QĐ. Trường Sa", 112.6, 11.95);
    label("Biển Đông", 112.4, 14.2);
    root.prepend(s);
    return s;
  }

  function buildArrow(root, view) {
    const s = svg("svg", { class: "fm-over", viewBox: view.join(" "), preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" }, root);
    const [tx, ty] = data.towns.tantrao;
    const [nx, ny] = data.towns.thainguyen;
    const arrow = svg("g", { class: "fm-arrow" }, s);
    svg("path", { d: `M${tx},${ty} Q${(tx + nx) / 2 + 2},${Math.min(ty, ny) - 16} ${nx - 4},${ny - 3}`, pathLength: 1 }, arrow);
    svg("path", { class: "fm-arrow-head", d: `M${nx - 4},${ny - 3} l-7,-6 l1.5,8.5 z` }, arrow);
  }

  function setupMap(root) {
    const view = VIEWS[root.dataset.view] || VIEWS.full;
    const slide = root.closest(".slide");
    root.style.aspectRatio = `${view[2]} / ${view[3]}`;
    root.style.setProperty("--ar", (view[2] / view[3]).toFixed(4));
    buildSvg(root, view);

    const canvas = document.createElement("canvas");
    canvas.className = "fm-fire";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    buildArrow(root, view);

    const marks = document.createElement("div");
    marks.className = "fm-marks";
    root.appendChild(marks);
    const lead = svg("svg", { class: "fm-lead", "aria-hidden": "true" }, root);
    const leadLine = svg("path", { pathLength: 1 }, lead);

    const labels = new Set(ids(root.dataset.labels));
    const refs = new Set(ids(root.dataset.ref));
    const occupied = new Set(ids(root.dataset.occupied));
    const late = new Set(ids(root.dataset.late));
    const inView = ([x, y]) => x >= view[0] && x <= view[0] + view[2] && y >= view[1] && y <= view[1] + view[3];
    const pct = ([x, y]) => [((x - view[0]) / view[2]) * 100, ((y - view[1]) / view[3]) * 100];

    const towns = Object.entries(data.towns).map(([id, xy]) => {
      const el = document.createElement("span");
      el.className = "fm-town";
      if (MAJOR.has(id)) el.classList.add("is-major");
      if (occupied.has(id)) el.classList.add("is-occupied");
      if (id === "tantrao") el.classList.add("is-base");
      const [l, t] = pct(xy);
      el.style.left = `${l}%`;
      el.style.top = `${t}%`;
      if (labels.has(id) || refs.has(id)) {
        const lab = document.createElement("span");
        lab.className = `fm-label side-${SIDE[id] || "r"}`;
        lab.textContent = NAMES[id] || id;
        el.appendChild(lab);
        el.classList.add("has-label");
        if (refs.has(id)) el.classList.add("is-ref");
      }
      if (inView(xy)) marks.appendChild(el);
      return { id, xy, el, kind: null, t0: 0, R: MAJOR.has(id) ? 96 : 62 };
    });
    const regionEls = {};
    for (const id of labels) {
      if (!REGIONS[id]) continue;
      const el = document.createElement("span");
      el.className = "fm-region";
      const [l, t] = pct(REGIONS[id]);
      el.style.left = `${l}%`;
      el.style.top = `${t}%`;
      el.textContent = NAMES[id];
      marks.appendChild(el);
      regionEls[id] = el;
    }
    const byId = Object.fromEntries(towns.map((t) => [t.id, t]));
    const pops = [...root.querySelectorAll(".fm-pop")];

    const st = { at: null, allT0: -1, shocks: [], pop: null };

    function apply(stepper, now) {
      const at = Number(stepper.dataset.at ?? -1);
      if (at === st.at) return;
      const steps = [...stepper.querySelectorAll(".step")];
      const lit = new Set();
      const ember = new Set(ids(root.dataset.ember));
      let spread = false;
      let all = false;
      let arrow = false;
      for (let k = 0; k <= at && k < steps.length; k++) {
        const d = steps[k].dataset;
        ids(d.light).forEach((id) => lit.add(id));
        ids(d.ember).forEach((id) => ember.add(id));
        if ("spread" in d) spread = true;
        if ("all" in d) all = true;
        if ("arrow" in d) arrow = true;
      }
      const spreadSet = new Set();
      if (spread) {
        for (const t of towns) {
          if (!late.has(t.id) && !occupied.has(t.id) && t.id !== "tantrao" && !lit.has(t.id)) spreadSet.add(t.id);
        }
      }
      const centres = ["hanoi", "hue", "saigon"].map((id) => data.towns[id]);
      const forward = st.at === null || at > st.at;
      const cur = steps[at];
      const curDelay = forward ? Number(cur?.dataset.delay || 0) : 0;
      for (const t of towns) {
        let kind = null;
        if (occupied.has(t.id)) kind = null;
        else if (lit.has(t.id) || spreadSet.has(t.id)) kind = "lit";
        else if (ember.has(t.id)) kind = "ember";
        if (kind !== t.kind) {
          let delay = curDelay;
          if (kind === "lit" && spreadSet.has(t.id) && forward) {
            delay = Math.min(...centres.map(([x, y]) => Math.hypot(t.xy[0] - x, t.xy[1] - y))) * 5;
          }
          t.kind = kind;
          t.t0 = now + delay;
        }
        t.el.classList.toggle("is-lit", kind === "lit");
        t.el.classList.toggle("is-ember", kind === "ember");
      }
      for (const id in regionEls) regionEls[id].classList.toggle("is-on", ember.has(id));
      if (all && st.allT0 < 0) st.allT0 = now + 400;
      if (!all) st.allT0 = -1;
      root.classList.toggle("is-all", all);
      root.classList.toggle("show-arrow", arrow);

      if (cur && forward) {
        for (const id of ids(cur.dataset.shock)) {
          const t = byId[id];
          if (t) st.shocks.push({ xy: t.xy, t0: now + curDelay, R: MAJOR.has(id) ? 300 : 180 });
        }
        st.shocks = st.shocks.slice(-4);
      }
      st.pop = cur?.dataset.pop || null;
      pops.forEach((p) => p.classList.toggle("is-shown", p.dataset.pop === st.pop));
      st.at = at;
      root.classList.remove("lead-on");
      requestAnimationFrame(() => placeLead());
    }

    function placeLead() {
      const popEl = pops.find((p) => p.dataset.pop === st.pop);
      const t = popEl && byId[popEl.dataset.city || st.pop];
      if (!popEl || !t) return;
      const w = root.clientWidth;
      const h = root.clientHeight;
      lead.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const x = ((t.xy[0] - view[0]) / view[2]) * w;
      const y = ((t.xy[1] - view[1]) / view[3]) * h;
      const L = popEl.offsetLeft;
      const T = popEl.offsetTop;
      const ex = Math.min(Math.max(x, L), L + popEl.offsetWidth);
      const ey = Math.min(Math.max(y, T), T + popEl.offsetHeight);
      leadLine.setAttribute("d", `M${x.toFixed(1)},${y.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
      void lead.getBoundingClientRect();
      root.classList.add("lead-on");
    }

    const stepper = slide.querySelector(".stepper");
    if (stepper) {
      new MutationObserver(() => apply(stepper, performance.now())).observe(stepper, { attributes: true, attributeFilter: ["data-at"] });
    }

    if (!gl) {
      root.classList.add("no-gl");
      return null;
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
    ["uRes", "uTime", "uAll", "uScale", "uCount", "uPt", "uShock", "uMask"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uMask, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const land = new Path2D(data.vn);
    const pts = new Float32Array(NP * 4);
    const shocks = new Float32Array(16);
    let scale = 1;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(root.clientWidth * dpr));
      const h = Math.max(1, Math.round(root.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      scale = w / view[2];
      const mask = document.createElement("canvas");
      mask.width = w;
      mask.height = h;
      const c = mask.getContext("2d");
      c.setTransform(scale, 0, 0, scale, -view[0] * scale, -view[1] * scale);
      c.fillStyle = "#f00";
      c.fill(land);
      c.globalCompositeOperation = "lighter";
      c.filter = `blur(${Math.round(10 * scale)}px)`;
      c.fillStyle = "#0f0";
      c.fill(land);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
      if (st.pop) placeLead();
    }
    new ResizeObserver(resize).observe(root);

    return function render(now, time) {
      const live = slide.classList.contains("active") || slide.classList.contains("is-leaving");
      if (!live) {
        if (st.at !== null) {
          st.at = null;
          st.shocks = [];
          st.allT0 = -1;
          towns.forEach((t) => { t.kind = null; });
        }
        return;
      }
      if (stepper) apply(stepper, now);
      resize();
      let n = 0;
      // Only burning towns go to the GPU — the shader loops over uCount for every pixel
      for (const t of towns) {
        if (n >= NP) break;
        const age = (now - t.t0) / 1300;
        const grow = t.kind && age > 0 ? ease(age) : 0;
        const r = t.kind === "lit" ? t.R * scale * grow : t.kind === "ember" ? 36 * scale * grow : 0;
        if (r <= 0) continue;
        const o = n * 4;
        pts[o] = (t.xy[0] - view[0]) * scale;
        pts[o + 1] = (t.xy[1] - view[1]) * scale;
        pts[o + 2] = r;
        pts[o + 3] = t.kind === "lit" ? 1 : 0.42;
        n++;
      }
      shocks.fill(-1);
      st.shocks.forEach((k, i) => {
        shocks[i * 4] = (k.xy[0] - view[0]) * scale;
        shocks[i * 4 + 1] = (k.xy[1] - view[1]) * scale;
        shocks[i * 4 + 2] = now < k.t0 ? -1 : (now - k.t0) / 1300;
        shocks[i * 4 + 3] = k.R;
      });
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uScale, scale);
      gl.uniform1f(U.uAll, st.allT0 < 0 ? 0 : ease((now - st.allT0) / 2600));
      gl.uniform1i(U.uCount, n);
      gl.uniform4fv(U.uPt, pts);
      gl.uniform4fv(U.uShock, shocks);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  }

  const renderers = maps.map((m) => {
    try {
      return setupMap(m);
    } catch (err) {
      console.warn("[fire-map]", err);
      m.classList.add("no-gl");
      return null;
    }
  }).filter(Boolean);

  const t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const time = (now - t0) / 1000;
    for (const r of renderers) r(now, time);
  }
  requestAnimationFrame(frame);
})();
