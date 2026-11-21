(() => {
  "use strict";
  const section = document.getElementById("feature");
  const canvas = section?.querySelector(".messaging-waves");
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, frame = 0, visible = false, last = 0, phase = 0;
  let pointerX = .65, pointerY = .5, pull = 0, targetPull = 0;
  let ink;

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = ink;
    // Offset the strands' phases to open the ribbon into folds.
    for (let strand = 0; strand < 28; strand++) {
      const offset = strand / 27 - .5;
      ctx.lineWidth = strand % 9 === 0 ? 1.4 : .85;
      ctx.globalAlpha = .42 + .34 * Math.abs(offset * 2);
      ctx.beginPath();
      for (let x = 0; x < width + 9; x += 9) {
        const u = x / width;
        const wave = Math.sin(u * 8 + phase + offset * 1.5);
        const fold = Math.cos(u * 12 - phase * .47 + offset * 2.4);
        let y = .88 - u * .28 + wave * .24 + fold * .09 + offset * .16;
        const distance = (u - pointerX) / .15;
        y += (pointerY - y) * Math.exp(-distance * distance) * pull * .55;
        ctx.lineTo(x, y * height);
      }
      ctx.stroke();
    }
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) return;
    const elapsed = Math.min(now - last, 60);
    if (elapsed >= 32) {
      phase += elapsed * .00019;
      pull += (targetPull - pull) * .14;
      draw();
      last = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function refresh() {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden) return;
    if (reduced.matches) pull = targetPull = 0;
    draw();
    last = performance.now();
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }

  function resize() {
    width = section.clientWidth;
    height = section.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ink = ctx.createLinearGradient(0, height, width, 0);
    ink.addColorStop(0, "#65d9cd");
    ink.addColorStop(.46, "#ab96ff");
    ink.addColorStop(.76, "#efa1c0");
    ink.addColorStop(1, "#ffba86");
    refresh();
  }

  section.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse" || reduced.matches) return;
    const rect = section.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / width;
    pointerY = (event.clientY - rect.top) / height;
    targetPull = 1;
  }, { passive: true });
  section.addEventListener("pointerleave", () => { targetPull = 0; });
  new ResizeObserver(resize).observe(section);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resize();
    else refresh();
  }).observe(section);
  document.addEventListener("visibilitychange", refresh);
  reduced.addEventListener("change", refresh);
})();
