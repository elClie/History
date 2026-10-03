/* Phần 3 world map — <div class="world-map" data-axis="lon lat" data-axis-label="…" data-embers="lon lat, lon lat, …">
   becomes a faint SVG world (js/world-map-data.js) with Vietnam lit. Everything moves in CSS, keyed off the slide's
   steps: [data-wm="axis"].is-on burns the Axis mark out, [data-wm="embers"].is-on sends arcs + rings from Vietnam
   and flares the ember points (each carries --d, a delay proportional to its distance from Vietnam). */
(() => {
  const data = window.HisWorldData;
  if (!data) return;
  const NS = "http://www.w3.org/2000/svg";
  const [LON0, , , LAT1, KX, SY] = data.box;
  const proj = (lon, lat) => [(lon - LON0) * KX, (LAT1 - lat) * SY];
  const pairs = (s) =>
    (s || "")
      .split(",")
      .map((p) => p.trim().split(/\s+/).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite));

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent?.appendChild(n);
    return n;
  }

  document.querySelectorAll(".world-map").forEach((root) => {
    root.style.setProperty("--ar", (data.w / data.h).toFixed(4));
    const s = el("svg", { class: "wm-svg", viewBox: `0 0 ${data.w} ${data.h}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    el("path", { class: "wm-land", d: data.land }, s);
    el("path", { class: "wm-vn", d: data.vn }, s);
    const isl = el("g", { class: "wm-isl" }, s);
    for (const [x, y] of data.isl) el("circle", { cx: x, cy: y, r: 2.4 }, isl);

    const [vx, vy] = proj(106.2, 16.2);
    const rings = el("g", { class: "wm-rings" }, s);
    for (let k = 0; k < 3; k++) el("circle", { cx: vx, cy: vy, r: 700, style: `--k:${k}` }, rings);

    const arcs = el("g", { class: "wm-arcs" }, s);
    const embers = el("g", { class: "wm-embers" }, s);
    for (const [lon, lat] of pairs(root.dataset.embers)) {
      const [x, y] = proj(lon, lat);
      const dx = x - vx;
      const dy = y - vy;
      const dist = Math.hypot(dx, dy);
      const d = `${Math.round(500 + dist * 2.2)}ms`;
      const bend = Math.min(0.32, 60 / Math.max(dist, 1)) * dist;
      const cx = (vx + x) / 2 + (dy / (dist || 1)) * bend;
      const cy = (vy + y) / 2 - (Math.abs(dx) / (dist || 1)) * bend;
      el("path", { d: `M${vx},${vy} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`, pathLength: 1, style: `--d:${d}` }, arcs);
      el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 7, style: `--d:${d}` }, embers);
    }

    const axis = pairs(root.dataset.axis)[0];
    if (axis) {
      const [ax, ay] = proj(...axis);
      const g = el("g", { class: "wm-axis", transform: `translate(${ax.toFixed(1)} ${ay.toFixed(1)})` }, s);
      el("circle", { class: "wm-axis-ring", r: 16 }, g);
      el("circle", { class: "wm-axis-dot", r: 6 }, g);
      el("path", { class: "wm-axis-x", d: "M-12,-12L12,12M12,-12L-12,12", pathLength: 1 }, g);
      el("text", { class: "wm-axis-label", x: 0, y: 44 }, g).textContent = root.dataset.axisLabel || "";
    }

    const core = el("g", { class: "wm-core", transform: `translate(${vx.toFixed(1)} ${vy.toFixed(1)})` }, s);
    el("circle", { r: 9 }, core);
    el("text", { class: "wm-vn-label", x: -28, y: 6 }, core).textContent = "Việt Nam";
    root.prepend(s);
  });
})();
