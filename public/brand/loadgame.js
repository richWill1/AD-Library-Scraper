/* Snoop dash: a tiny runner game inside the loading bar.
   The coloured part of the track is the real loading progress; the AdSnoop
   eyes run along it towards the finish flag while hurdles roll in.
   Jump with space / up arrow, or tap/click the track. Loading never waits
   for the game, and there is no game over. */
(function () {
  "use strict";
  const COLORS = ["#ff4f81", "#ff8a3d", "#ffc23d", "#3ccf91", "#3d9bff", "#8a5cff"];
  const BEST_KEY = "adsnoop-dash-best";
  let host, canvas, ctx, hud, hint, raf = 0, last = 0, running = false, w = 0, h = 0, dpr = 1;
  let pct = 0, shown = 0, target = 0, played = false, score = 0, best = 0, dizzy = 0, finished = false;
  let hurdles = [], confetti = [], sparks = [], nextHurdle = 0, t = 0;
  const eyes = { y: 0, vy: 0, grounded: true, squash: 0 };
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  try { best = Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch {}

  const ground = () => h - 24;
  const runnerX = () => 26 + shown * (w - 80);

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = Math.max(200, r.width); h = Math.max(60, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function jump() {
    if (!running || finished) return;
    if (eyes.grounded) { eyes.vy = -7.4; eyes.grounded = false; }
  }
  function userJump(e) {
    if (!played) { played = true; score = 0; paintHud(); }
    jump();
    if (e) e.preventDefault();
  }

  function spawn() {
    const kinds = ["popup", "cookie", "shield"];
    const kind = kinds[(Math.random() * kinds.length) | 0];
    const hh = kind === "cookie" ? 22 : 25 + Math.random() * 7;
    hurdles.push({ x: w + 20, w: kind === "cookie" ? 22 : 27, h: hh, kind, c: COLORS[(Math.random() * COLORS.length) | 0], scored: false, hit: false });
  }

  function roundRect(x, y, ww, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); }

  function drawTrack() {
    const g = ground();
    // Track ahead
    ctx.fillStyle = "#ececf3"; roundRect(10, g, w - 20, 16, 8); ctx.fill();
    // Progress: animated rainbow
    const filled = Math.max(14, (w - 20) * shown);
    const grad = ctx.createLinearGradient(10 - (t * 0.06) % (w / 2), 0, 10 + w - (t * 0.06) % (w / 2), 0);
    COLORS.concat(COLORS[0]).forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = grad; roundRect(10, g, filled, 16, 8); ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = "#fff"; roundRect(14, g + 2, Math.max(0, filled - 8), 4, 2); ctx.fill(); ctx.restore();
    // Finish flag
    const fx = w - 24, fy = g - 34;
    ctx.fillStyle = "#0b1734"; ctx.fillRect(fx, fy, 2.5, 34);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = (r + c) % 2 ? "#0b1734" : "#fff"; ctx.fillRect(fx + 2 + c * 4, fy + r * 4, 4, 4); }
    ctx.strokeStyle = "#0b1734"; ctx.lineWidth = 1; ctx.strokeRect(fx + 2, fy, 16, 12);
  }

  function drawHurdle(o) {
    const g = ground(), y = g - o.h;
    ctx.save();
    if (o.hit) ctx.globalAlpha = 0.45;
    if (o.kind === "cookie") {
      ctx.fillStyle = "#d9a066"; ctx.beginPath(); ctx.arc(o.x + o.w / 2, g - o.h / 2, o.h / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6b3e1e"; [[-3, -3], [3, 1], [-1, 4], [4, -4]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(o.x + o.w / 2 + dx, g - o.h / 2 + dy, 1.4, 0, Math.PI * 2); ctx.fill(); });
    } else if (o.kind === "popup") {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = o.c; ctx.lineWidth = 2; roundRect(o.x, y, o.w, o.h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = o.c; roundRect(o.x, y, o.w, 6, 3); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(o.x + o.w - 7, y + 1.5); ctx.lineTo(o.x + o.w - 3, y + 4.5); ctx.moveTo(o.x + o.w - 3, y + 1.5); ctx.lineTo(o.x + o.w - 7, y + 4.5); ctx.stroke();
    } else {
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, y); ctx.lineTo(o.x + o.w, y + 5); ctx.lineTo(o.x + o.w - 2, y + o.h - 6); ctx.lineTo(o.x + o.w / 2, y + o.h); ctx.lineTo(o.x + 2, y + o.h - 6); ctx.lineTo(o.x, y + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 7px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText("AD", o.x + o.w / 2, y + o.h / 2 + 3);
    }
    ctx.restore();
  }

  function drawEyes() {
    const g = ground(), x = runnerX(), y = g - 13 + eyes.y;
    // Sparkle trail while running
    if (running && !finished && Math.random() < 0.55) sparks.push({ x: x - 20, y: y + (Math.random() * 10 - 2), vx: -1.2 - Math.random() * 1.4, vy: (Math.random() - 0.5) * 0.8, life: 1, c: COLORS[(Math.random() * COLORS.length) | 0], r: 1.5 + Math.random() * 2.5 });
    for (const p of sparks) { p.x += p.vx; p.y += p.vy; p.life -= 0.035; ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    sparks = sparks.filter(p => p.life > 0);
    const sq = eyes.squash, sx = 1 + sq * 0.18, sy = 1 - sq * 0.18;
    // shadow
    ctx.save(); ctx.globalAlpha = 0.18 * (1 + eyes.y / 70); ctx.fillStyle = "#0b1734"; ctx.beginPath(); ctx.ellipse(x, g - 1, 18 * (1 + eyes.y / 120), 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y - 4); ctx.scale(sx * 1.25, sy * 1.25);
    for (const dx of [-10, 10]) {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b1734"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(dx, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (dizzy > 0) {
        ctx.strokeStyle = "#0b1734"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(dx - 4, -4); ctx.lineTo(dx + 4, 4); ctx.moveTo(dx + 4, -4); ctx.lineTo(dx - 4, 4); ctx.stroke();
      } else {
        const look = finished ? 0 : 3, up = eyes.grounded ? 0 : -2.5;
        ctx.fillStyle = "#0b1734"; ctx.beginPath(); ctx.arc(dx + look, up, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(dx + look + 1.4, up - 1.4, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawConfetti(dt) {
    for (const p of confetti) {
      p.vy += 0.18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
    }
    confetti = confetti.filter(p => p.y < h + 10);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(2.5, last ? (now - last) / 16.67 : 1); last = now; t += dt * 16.67;
    // Ease the runner towards the real progress.
    shown += (target - shown) * Math.min(1, 0.06 * dt);
    if (finished && shown > 0.995) shown = 1;
    // Physics
    if (!eyes.grounded) { eyes.vy += 0.42 * dt; eyes.y += eyes.vy * dt; if (eyes.y >= 0) { eyes.y = 0; eyes.vy = 0; eyes.grounded = true; eyes.squash = 1; } }
    eyes.squash = Math.max(0, eyes.squash - 0.08 * dt);
    if (dizzy > 0) dizzy -= dt * 16.67;
    // Hurdles
    if (!finished && t > nextHurdle) { spawn(); nextHurdle = t + 1100 + Math.random() * 1300; }
    const speed = 3.4 * dt, rx = runnerX();
    for (const o of hurdles) {
      o.x -= speed;
      // Demo mode: the eyes hop on their own until someone plays.
      if (!played && !o.hit && o.x - rx < 58 && o.x - rx > 26) jump();
      const overlapX = o.x < rx + 20 && o.x + o.w > rx - 20, top = ground() - o.h;
      if (!o.hit && overlapX && ground() - 2 + eyes.y > top) { o.hit = true; dizzy = 650; }
      if (!o.scored && !o.hit && o.x + o.w < rx - 20) { o.scored = true; if (played) { score++; if (score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch {} } paintHud(); } }
    }
    hurdles = hurdles.filter(o => o.x > -40);
    // Draw
    ctx.clearRect(0, 0, w, h);
    drawTrack(); hurdles.forEach(drawHurdle); drawEyes(); drawConfetti(dt);
    raf = requestAnimationFrame(frame);
  }

  function paintHud() {
    if (!hud) return;
    hud.textContent = played ? "Hurdles cleared " + score + (best ? " · Best " + best : "") : "";
    if (hint) hint.textContent = played ? "" : "Tap the track or press space to play while you wait";
  }

  function onKey(e) {
    if (!running || finished || !host || host.offsetParent === null) return;
    if (!(e.code === "Space" || e.code === "ArrowUp")) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag) || (e.target && e.target.isContentEditable)) return;
    const r = host.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    userJump(e);
  }

  const api = {
    supported: !reduce && !!document.createElement("canvas").getContext,
    mount(el) {
      if (!api.supported || !el) return;
      host = el; canvas = el.querySelector("canvas"); hud = el.querySelector(".lb-score"); hint = el.querySelector(".lb-play");
      ctx = canvas.getContext("2d");
      el.addEventListener("pointerdown", userJump);
      addEventListener("keydown", onKey);
      addEventListener("resize", () => { if (running) size(); });
      document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); } else if (running) { last = 0; raf = requestAnimationFrame(frame); } });
    },
    start() {
      if (!api.supported || !host) return;
      if (running) return;
      host.hidden = false; size();
      running = true; finished = false; last = 0; t = 0; nextHurdle = 600; hurdles = []; confetti = [];
      shown = target; score = 0; played = false; dizzy = 0; eyes.y = 0; eyes.vy = 0; eyes.grounded = true;
      paintHud(); raf = requestAnimationFrame(frame);
    },
    progress(p) { target = Math.max(0, Math.min(1, p)); },
    finish() {
      if (!running) return "";
      finished = true; target = 1; hurdles.forEach(o => (o.scored = true));
      for (let i = 0; i < 70; i++) confetti.push({ x: w - 30, y: ground() - 20, vx: -Math.random() * 6 - 1, vy: -Math.random() * 6 - 2, vr: (Math.random() - 0.5) * 0.4, r: 0, c: COLORS[i % COLORS.length] });
      return played ? "You cleared " + score + " hurdle" + (score === 1 ? "" : "s") + (score && score >= best ? " — a new best!" : "") : "";
    },
    stop() { running = false; cancelAnimationFrame(raf); if (host) host.hidden = true; },
    get running() { return running; }
  };
  window.AdSnoopDash = api;
})();
