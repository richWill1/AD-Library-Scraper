// Messaging intelligence background: a field of fine line waves. Moving the
// mouse (or tapping) sends ripples through the lines; a gentle ambient ripple
// shows the effect on touch screens. Reduced motion draws one still frame.
(() => {
  "use strict";
  const section = document.getElementById("feature");
  const canvas = section?.querySelector(".messaging-waves");
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const GAP = 13, STEP = 10, SPEED = 260, LIFE = 1.9, MAX_RIPPLES = 10;
  let width = 0, height = 0, frame = 0, visible = false, last = 0, time = 0;
  let ripples = [], lastSpawn = 0, lastX = -999, lastY = -999, nextAmbient = 1.5;
  let ink;

  function addRipple(x, y, strength) {
    ripples.push({ x, y, born: time, a: strength });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = ink;
    ctx.lineWidth = .8;
    const live = ripples.map((r) => ({ ...r, age: time - r.born }));
    const rows = Math.ceil(height / GAP) + 1;
    for (let row = 0; row < rows; row++) {
      const base = row * GAP;
      const v = base / height;
      ctx.globalAlpha = .16 + .2 * Math.sin(v * Math.PI);
      ctx.beginPath();
      for (let x = 0; x <= width + STEP; x += STEP) {
        let y = base + Math.sin(x * .012 + time * .9 + row * .45) * 2.4
          + Math.sin(x * .004 - time * .35 + row * .12) * 3.2;
        for (const r of live) {
          const dx = x - r.x, dy = base - r.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const front = d - r.age * SPEED;
          if (front > 60 || front < -160) continue;
          const decay = Math.max(0, 1 - r.age / LIFE);
          y += Math.sin(front * .075) * Math.exp(-(front * front) / 4200) * r.a * decay * decay;
        }
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ripples = ripples.filter((r) => time - r.born < LIFE);
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) return;
    const elapsed = Math.min(now - last, 60);
    if (elapsed >= 32) {
      time += elapsed / 1000;
      if (time > nextAmbient) {
        addRipple(width * (.55 + Math.random() * .4), height * (.2 + Math.random() * .6), 5);
        nextAmbient = time + 4 + Math.random() * 3;
      }
      draw();
      last = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function refresh() {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden) return;
    if (reduced.matches) ripples = [];
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
    ink.addColorStop(0, "#3fbfb1");
    ink.addColorStop(.48, "#8f74f0");
    ink.addColorStop(.78, "#e07aa8");
    ink.addColorStop(1, "#f19463");
    refresh();
  }

  function point(event) {
    const rect = section.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  section.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || reduced.matches) return;
    const [x, y] = point(event);
    if (time - lastSpawn < .12 || Math.hypot(x - lastX, y - lastY) < 45) return;
    addRipple(x, y, 6);
    lastSpawn = time; lastX = x; lastY = y;
  }, { passive: true });
  section.addEventListener("pointerdown", (event) => {
    if (reduced.matches) return;
    const [x, y] = point(event);
    addRipple(x, y, 11);
  }, { passive: true });

  new ResizeObserver(resize).observe(section);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resize();
    else refresh();
  }).observe(section);
  document.addEventListener("visibilitychange", refresh);
  reduced.addEventListener("change", refresh);
})();
