/* .crawl > .crawl-list scrolls upward forever: a hidden copy of the list follows it so the loop has no seam.
   Speed comes from the list height (--crawl-dur), so longer lists scroll at the same pace. */
(() => {
  const PX_PER_S = 34;
  document.querySelectorAll(".crawl").forEach((crawl) => {
    const list = crawl.querySelector(".crawl-list");
    if (!list) return;
    const track = document.createElement("div");
    track.className = "crawl-track";
    list.replaceWith(track);
    const copy = list.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    track.append(list, copy);
    const setDur = () => {
      const h = list.getBoundingClientRect().height;
      if (h > 0) crawl.style.setProperty("--crawl-dur", `${(h / PX_PER_S).toFixed(1)}s`);
    };
    setDur();
    document.fonts?.ready.then(setDur);
    window.addEventListener("resize", setDur);
  });
})();
