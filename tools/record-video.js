/* Walkthrough video for the presenter: `npm run record` → dist/History-walkthrough.mp4
   Plays the whole deck with real transitions: → after every click once its effects have finished + HOLD ms.
   Renders offscreen at 1440×900, encodes small (OUT_W×OUT_H, FPS, x264 CRF) with ffmpeg-static. */
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("ffmpeg-static");

const W = 1440;
const H = 900;
const OUT_W = 960;
const OUT_H = 600;
const FPS = 24;
const CRF = 30;
const HOLD = 1000;
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist", "History-walkthrough.mp4");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs in the page: resolves once the slide flip is over and no finite animation/transition is still running
    (ambient infinite loops don't count). MIN covers JS-timed effects that start late (count-up, map pop-ups). */
const SETTLE = `(() => new Promise((done) => {
  const MIN = 1600, CAP = 6000, t0 = performance.now();
  const busy = () => document.body.classList.contains("is-flipping") ||
    document.getAnimations().some((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming().endTime));
  const tick = () => {
    const t = performance.now() - t0;
    if (t > CAP || (t > MIN && !busy())) done(Math.round(t));
    else setTimeout(tick, 100);
  };
  tick();
}))()`;

app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    show: false,
    backgroundColor: "#05040a",
    webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true },
  });
  win.webContents.setFrameRate(30);
  const js = (code) => win.webContents.executeJavaScript(code);

  /** @type {Electron.NativeImage | null} */
  let latest = null;
  win.webContents.on("paint", (_e, _dirty, image) => { latest = image; });

  await win.loadFile(path.join(ROOT, "index.html"));
  await js("document.fonts.ready.then(() => true)");
  while (!latest) await sleep(50);
  // Paints arrive at device scale (2880×1800 on Retina): shrink here so the pipe carries OUT_W×OUT_H frames.
  const shrink = (img) => img.resize({ width: OUT_W, height: OUT_H, quality: "good" }).toBitmap();
  const probe = shrink(latest);
  const scale = Math.sqrt(probe.length / (4 * OUT_W * OUT_H));
  const fw = Math.round(OUT_W * scale);
  const fh = Math.round(OUT_H * scale);

  const log = fs.openSync(OUT.replace(/\.mp4$/, ".ffmpeg.log"), "w");
  const enc = spawn(ffmpeg, [
    "-y", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${fw}x${fh}`, "-r", String(FPS), "-i", "-",
    ...(fw === OUT_W ? [] : ["-vf", `scale=${OUT_W}:${OUT_H}`]),
    "-c:v", "libx264", "-preset", "medium", "-crf", String(CRF), "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", OUT,
  ], { stdio: ["pipe", "ignore", log] });
  let failed = false;
  const encoded = new Promise((r) => enc.on("close", (code, signal) => {
    if (code !== 0) {
      failed = true;
      console.error(`ffmpeg stopped (code ${code}, signal ${signal}) — see ${path.basename(OUT, ".mp4")}.ffmpeg.log`);
    }
    r();
  }));
  enc.stdin.on("error", () => {});

  // Wall-clock frame pacing: duplicate the latest paint so the video runs in real time even if timers jitter.
  const start = Date.now();
  let written = 0;
  const pump = setInterval(() => {
    const due = Math.floor(((Date.now() - start) / 1000) * FPS);
    if (failed || written >= due) return;
    const frame = shrink(latest);
    while (written < due) {
      enc.stdin.write(frame);
      written++;
    }
  }, 1000 / FPS / 2);

  const steps = await js(`[...document.querySelectorAll(".slide")].map((s) => {
    const st = s.querySelector(".stepper");
    return st ? st.querySelectorAll(".step").length : 0;
  })`);
  const clicks = Math.min(Number(process.env.CLICKS) || Infinity, steps.reduce((t, n) => t + n + 1, 0) - 1);
  console.log(`${steps.length} slides · ${clicks} clicks · frames ${fw}×${fh}`);

  await js(SETTLE);
  await sleep(HOLD);
  for (let c = 1; c <= clicks && !failed; c++) {
    await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))`);
    await js(SETTLE);
    await sleep(HOLD);
    if (c % 10 === 0) console.log(`${c}/${clicks} · ${Math.round((Date.now() - start) / 1000)}s`);
  }
  await sleep(1500);

  clearInterval(pump);
  enc.stdin.end();
  await encoded;
  win.destroy();
  if (failed) app.exit(1);
  const mb = fs.statSync(OUT).size / 1048576;
  console.log(`→ ${path.relative(ROOT, OUT)} (${mb.toFixed(1)} MB, ${Math.round(written / FPS)}s)`);
  app.quit();
});
