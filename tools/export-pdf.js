/* Click-by-click PDF preview: `npm run export` → dist/History-preview.pdf
   Every slide is shot on arrival and after each → through its stepper (no burn transition: slides are reached
   via #N); all frames land in dist/frames/. The PDF keeps only the clicks that show something new (see keepOf);
   `npm run export -- --pdf-only` rebuilds it from the frames already there. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const W = 1440;
const H = 900;
const SETTLE_SLIDE = 2800;
const SETTLE_STEP = 2400;
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const FRAMES = path.join(DIST, "frames");
const PDF = path.join(DIST, "History-preview.pdf");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frameName = (slide, click) => `s${String(slide + 1).padStart(2, "0")}-${String(click).padStart(2, "0")}.jpg`;

/** Runs in the page. Per slide: step count + which clicks (0 = on arrival) reach the PDF.
    Reveal steppers pile up → last click only. Flip cards → all closed + all turned.
    Event stacks (one date replaces the last) and quizzes (question → answer) → every click.
    data-burn steps burn a photo away → also the click just before. Roster → one page per member. */
function keepOf() {
  return [...document.querySelectorAll(".slide")].map((s) => {
    const st = s.querySelector(".stepper");
    const steps = st ? [...st.querySelectorAll(".step")] : [];
    const n = steps.length;
    const all = Array.from({ length: n + 1 }, (_, k) => k);
    let keep;
    if (!n) keep = [0];
    else if (st.hasAttribute("data-flip")) keep = [0, n];
    else if (st.matches(".ev-stack") || s.matches(".quiz")) keep = all;
    else if (!st.hasAttribute("data-reveal")) keep = all.slice(1);
    else keep = [...steps.flatMap((el, i) => (el.dataset.burn ? [i] : [])), n];
    return { n, keep };
  });
}

app.on("window-all-closed", () => {});

async function openDeck() {
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    show: false,
    backgroundColor: "#05040a",
    webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true },
  });
  win.webContents.setFrameRate(30);
  await win.loadFile(path.join(ROOT, "index.html"));
  await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  return win;
}

async function capture(win, plan) {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code);
  const total = plan.reduce((t, p) => t + p.n + 1, 0);
  let done = 0;

  const shoot = async (slide, click) => {
    let img = await win.webContents.capturePage();
    if (img.getSize().width !== W) img = img.resize({ width: W, height: H, quality: "best" });
    fs.writeFileSync(path.join(FRAMES, frameName(slide, click)), img.toJPEG(86));
    process.stdout.write(`\r${++done}/${total}`);
  };

  for (let i = 0; i < plan.length; i++) {
    await js(`location.hash = "#${i + 1}"`);
    await sleep(SETTLE_SLIDE);
    await shoot(i, 0);
    for (let k = 1; k <= plan[i].n; k++) {
      await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))`);
      await sleep(SETTLE_STEP);
      await shoot(i, k);
    }
  }
  console.log("");
}

async function print(files) {
  const html = path.join(FRAMES, "index.html");
  fs.writeFileSync(
    html,
    `<!DOCTYPE html><meta charset="utf-8"><style>
      @page { size: ${W}px ${H}px; margin: 0; }
      html, body { margin: 0; background: #05040a; }
      img { display: block; width: ${W}px; height: ${H}px; break-after: page; }
    </style>${files.map((f) => `<img src="${f}">`).join("")}`
  );
  const printer = new BrowserWindow({ show: false, width: W, height: H });
  await printer.loadFile(html);
  const pdf = await printer.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(PDF, pdf);
  console.log(`→ ${path.relative(ROOT, PDF)} (${(pdf.length / 1048576).toFixed(1)} MB, ${files.length} pages)`);
  printer.destroy();
}

app.whenReady().then(async () => {
  const win = await openDeck();
  const plan = await win.webContents.executeJavaScript(`(${keepOf})()`);
  console.log(`${plan.length} slides`);
  if (!process.argv.includes("--pdf-only")) await capture(win, plan);
  win.destroy();

  const files = plan.flatMap((p, i) => p.keep.map((k) => frameName(i, k)));
  const missing = files.filter((f) => !fs.existsSync(path.join(FRAMES, f)));
  if (missing.length) throw new Error(`missing frames (run without --pdf-only): ${missing.join(", ")}`);
  await print(files);
  app.quit();
});
