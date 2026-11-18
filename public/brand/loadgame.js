/* Snoop Dash: a runner game inside the loading bar.
   The coloured track is the real loading progress; the AdSnoop eyes race to the
   finish flag. Jump (and double jump) over pop-ups, dodge flying banners, grab
   creatives for points, build combos and pick up power-ups. Space / up arrow or
   tap to jump; press again in the air to double jump. Loading never waits for
   the game and there is no game over. */
(function () {
  "use strict";
  const COLORS = ["#ff4f81", "#ff8a3d", "#ffc23d", "#3ccf91", "#3d9bff", "#8a5cff"];
  const NAVY = "#0b1734";
  const BEST_KEY = "adsnoop-dash-best-v2";
  const GRAVITY = 0.5, JUMP1 = -5.7, JUMP2 = -5.1;
  let host, canvas, ctx, hud, hint, raf = 0, last = 0, running = false, w = 0, h = 0, dpr = 1;
  let shown = 0, target = 0, played = false, finished = false;
  let points = 0, best = 0, combo = 0, level = 1, shield = false, doubleUntil = 0, shake = 0;
  let streak = 0, bubble = null, face = { k: "", until: 0 }, lastHit = -1e9, nextBlink = 1800, blinkUntil = 0, nextGlance = 5000, emoji = "🙂";
  let hurdles = [], coins = [], powerups = [], popups = [], confetti = [], sparks = [], floaters = [], lines = [];
  let nextHurdle = 0, nextCoins = 0, nextPower = 0, t = 0;
  const eyes = { y: 0, vy: 0, grounded: true, squash: 0, jumps: 0, spin: 0 };
  const EMOJI = { happy: "😄", wink: "😉", shock: "😮", star: "🤩", crash: "😒", dizzy: "😵", love: "😍", determined: "😤", glance: "🙂" };
  const QUIPS = ["ugh", "seriously?", "not another pop-up", "oh great", "really?", "rude", "spare me"];
  const CHEERS = ["on fire!", "unstoppable", "too easy", "snoop snoop!", "ad-proof!"];
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  try { best = Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch {}

  const ground = () => h - 18;
  const runnerX = () => 26 + shown * (w - 80);
  const mult = () => Math.min(5, 1 + Math.floor(combo / 5)) * (t < doubleUntil ? 2 : 1);
  const speed = () => (3.3 + (level - 1) * 0.42);

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = Math.max(200, r.width); h = Math.max(60, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- Input ----------
  function jump() {
    if (!running || finished) return;
    if (eyes.grounded) { eyes.vy = JUMP1; eyes.grounded = false; eyes.jumps = 1; }
    else if (eyes.jumps < 2) {
      eyes.vy = JUMP2; eyes.jumps = 2; eyes.spin = 1;
      const x = runnerX(), y = ground() - 16 + eyes.y;
      for (let i = 0; i < 14; i++) sparks.push({ x, y: y + 8, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 2.5, life: 1, c: COLORS[i % COLORS.length], r: 1.5 + Math.random() * 2 });
    }
  }
  function userJump(e) {
    if (!played) { played = true; points = 0; combo = 0; setFace("determined", 800); paintHud(); }
    jump();
    if (e) e.preventDefault();
  }

  // ---------- Spawning ----------
  const SIZES = { popup: [27, 24], cookie: [22, 22], shield: [24, 26], mail: [30, 20], lock: [22, 25], skip: [40, 17], captcha: [24, 24], bell: [24, 24], banner: [44, 16] };
  function spawnHurdle() {
    const roll = Math.random();
    // Flying banner at head height: do not jump into it.
    if (level >= 2 && roll < 0.14) { hurdles.push({ x: w + 30, w: 52, h: 14, fly: 30, kind: "plane", c: COLORS[(Math.random() * COLORS.length) | 0] }); return 1500; }
    // Tall stack: needs a double jump.
    if (roll < 0.14 + Math.min(0.3, 0.06 * level)) { hurdles.push({ x: w + 20, w: 28, h: 44, kind: "stack", c: COLORS[(Math.random() * COLORS.length) | 0] }); return 1300; }
    const kinds = Object.keys(SIZES), kind = kinds[(Math.random() * kinds.length) | 0], [ww, hh] = SIZES[kind];
    hurdles.push({ x: w + 20, w: ww, h: hh, kind, c: COLORS[(Math.random() * COLORS.length) | 0] });
    // Occasionally a quick double (two close hurdles).
    if (level >= 3 && Math.random() < 0.25) { const k2 = kinds[(Math.random() * kinds.length) | 0]; hurdles.push({ x: w + 20 + ww + 120, w: SIZES[k2][0], h: SIZES[k2][1], kind: k2, c: COLORS[(Math.random() * COLORS.length) | 0] }); }
    return 0;
  }
  function spawnCoins() {
    const n = 3 + ((Math.random() * 3) | 0), lift = [14, 36, 58][(Math.random() * (level >= 2 ? 3 : 2)) | 0];
    for (let i = 0; i < n; i++) coins.push({ x: w + 20 + i * 24, y: lift + Math.sin(i / (n - 1 || 1) * Math.PI) * 10, c: COLORS[(i * 2) % COLORS.length], got: false, bob: Math.random() * 6 });
  }
  function spawnPower() { powerups.push({ x: w + 20, y: 26 + Math.random() * 22, kind: Math.random() < 0.5 ? "guard" : "x2", got: false, bob: 0 }); }

  function pop(text, x, y, c) { popups.push({ text, x, y, c: c || NAVY, life: 1 }); }
  function setFace(k, ms) { face = { k, until: t + ms }; if (EMOJI[k]) emoji = EMOJI[k]; paintHud(); }
  function addPoints(n, x, y, label) { const v = n * mult(); if (played) { points += v; if (points > best) { best = points; try { localStorage.setItem(BEST_KEY, String(best)); } catch {} } } pop((label ? label + " " : "") + "+" + v, x, y, label ? "#8a5cff" : NAVY); paintHud(); }

  // ---------- Drawing helpers ----------
  function roundRect(x, y, ww, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); }

  function seedFloaters() {
    floaters = Array.from({ length: Math.round(w / 70) }, () => ({ x: Math.random() * w, y: 8 + Math.random() * (h - 44), s: 5 + Math.random() * 9, k: (Math.random() * 4) | 0, c: COLORS[(Math.random() * COLORS.length) | 0], v: 0.25 + Math.random() * 0.5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02 }));
  }
  function drawFloaters(dt) {
    for (const f of floaters) {
      f.x -= f.v * dt * (0.8 + level * 0.15); f.r += f.vr * dt; if (f.x < -20) { f.x = w + 20; f.y = 8 + Math.random() * (h - 44); }
      ctx.save(); ctx.globalAlpha = 0.2; ctx.translate(f.x, f.y); ctx.rotate(f.r); ctx.fillStyle = f.c; ctx.strokeStyle = f.c; ctx.lineWidth = 2.5;
      if (f.k === 0) { ctx.beginPath(); ctx.arc(0, 0, f.s / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 1) { ctx.beginPath(); ctx.moveTo(0, -f.s / 2); ctx.lineTo(f.s / 2, f.s / 2); ctx.lineTo(-f.s / 2, f.s / 2); ctx.closePath(); ctx.fill(); }
      else if (f.k === 2) { ctx.beginPath(); ctx.moveTo(-f.s / 2, 0); ctx.lineTo(f.s / 2, 0); ctx.moveTo(0, -f.s / 2); ctx.lineTo(0, f.s / 2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(0, 0, f.s / 2, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    // Speed lines from level 3.
    if (level >= 3 && Math.random() < 0.35) lines.push({ x: w + 10, y: 6 + Math.random() * (h - 30), l: 20 + Math.random() * 40, c: COLORS[(Math.random() * COLORS.length) | 0] });
    for (const s of lines) { s.x -= speed() * 2.4 * dt; ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = s.c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.l, s.y); ctx.stroke(); ctx.restore(); }
    lines = lines.filter(s => s.x + s.l > 0);
  }

  function drawTrack() {
    const g = ground();
    ctx.fillStyle = "#ececf3"; roundRect(10, g, w - 20, 14, 7); ctx.fill();
    const filled = Math.max(14, (w - 20) * shown);
    const grad = ctx.createLinearGradient(10 - (t * 0.06) % (w / 2), 0, 10 + w - (t * 0.06) % (w / 2), 0);
    COLORS.concat(COLORS[0]).forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = grad; roundRect(10, g, filled, 14, 7); ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = "#fff"; roundRect(14, g + 2, Math.max(0, filled - 8), 3.5, 2); ctx.fill(); ctx.restore();
    const fx = w - 24, fy = g - 32;
    ctx.fillStyle = NAVY; ctx.fillRect(fx, fy, 2.5, 32);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = (r + c) % 2 ? NAVY : "#fff"; ctx.fillRect(fx + 2 + c * 4, fy + r * 4, 4, 4); }
    ctx.strokeStyle = NAVY; ctx.lineWidth = 1; ctx.strokeRect(fx + 2, fy, 16, 12);
  }

  function drawPopup(x, y, ww, hh, c) {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = c; ctx.lineWidth = 2; roundRect(x, y, ww, hh, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; roundRect(x, y, ww, 6, 3); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + ww - 7, y + 1.5); ctx.lineTo(x + ww - 3, y + 4.5); ctx.moveTo(x + ww - 3, y + 1.5); ctx.lineTo(x + ww - 7, y + 4.5); ctx.stroke();
  }
  function hurdleTop(o) { return o.fly ? ground() - o.fly - o.h : ground() - o.h; }
  function drawHurdle(o) {
    const g = ground(), y = hurdleTop(o);
    ctx.save();
    if (o.hit) ctx.globalAlpha = 0.4;
    if (o.kind === "plane") {
      // A little plane towing a banner ad.
      ctx.fillStyle = "#fff"; ctx.strokeStyle = o.c; ctx.lineWidth = 1.6; roundRect(o.x + 14, y, o.w - 14, o.h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = o.c; ctx.font = "800 7.5px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText("BUY NOW", o.x + 14 + (o.w - 14) / 2, y + o.h / 2 + 2.8);
      ctx.strokeStyle = "#9aa0b4"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o.x + 14, y + o.h / 2); ctx.lineTo(o.x + 7, y + o.h / 2); ctx.stroke();
      ctx.fillStyle = NAVY; roundRect(o.x - 4, y + o.h / 2 - 3, 12, 6, 3); ctx.fill();
      ctx.fillRect(o.x + 1, y + o.h / 2 - 7, 2, 14);
      const prop = (t / 30) % 2 < 1; ctx.fillStyle = "#9aa0b4"; ctx.fillRect(o.x - 6, y + o.h / 2 - (prop ? 5 : 1), 1.5, prop ? 10 : 2);
    } else if (o.kind === "stack") {
      drawPopup(o.x + 2, g - 22, 24, 22, o.c);
      drawPopup(o.x - 1, g - 44, 26, 23, COLORS[(COLORS.indexOf(o.c) + 3) % COLORS.length]);
    } else if (o.kind === "cookie") {
      ctx.fillStyle = "#d9a066"; ctx.beginPath(); ctx.arc(o.x + o.w / 2, g - o.h / 2, o.h / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6b3e1e"; [[-3, -3], [3, 1], [-1, 4], [4, -4]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(o.x + o.w / 2 + dx, g - o.h / 2 + dy, 1.4, 0, Math.PI * 2); ctx.fill(); });
    } else if (o.kind === "popup") {
      drawPopup(o.x, y, o.w, o.h, o.c);
    } else if (o.kind === "mail") {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = o.c; ctx.lineWidth = 2; roundRect(o.x, y, o.w, o.h, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.x + 2, y + 2); ctx.lineTo(o.x + o.w / 2, y + o.h * 0.58); ctx.lineTo(o.x + o.w - 2, y + 2); ctx.stroke();
      ctx.fillStyle = "#ff4f81"; ctx.beginPath(); ctx.arc(o.x + o.w - 1, y + 1, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 6px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText("9", o.x + o.w - 1, y + 3);
    } else if (o.kind === "lock") {
      ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(o.x + o.w / 2, y + 9, 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = o.c; roundRect(o.x, y + 9, o.w, o.h - 9, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x + o.w / 2, y + 9 + (o.h - 9) / 2, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (o.kind === "skip") {
      ctx.fillStyle = "rgba(11,23,52,.88)"; roundRect(o.x, y, o.w, o.h, o.h / 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 8px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText("SKIP ▸", o.x + o.w / 2, y + o.h / 2 + 3);
    } else if (o.kind === "captcha") {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#c7c7d1"; ctx.lineWidth = 1.5; roundRect(o.x, y, o.w, o.h, 4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = o.c; ctx.lineWidth = 2; roundRect(o.x + 6, y + 6, o.w - 12, o.h - 12, 2); ctx.stroke();
      ctx.strokeStyle = "#3ccf91"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(o.x + 9, y + o.h / 2); ctx.lineTo(o.x + o.w / 2 - 1, y + o.h - 8); ctx.lineTo(o.x + o.w - 7, y + 7); ctx.stroke();
    } else if (o.kind === "bell") {
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.moveTo(o.x + 3, y + o.h - 6); ctx.quadraticCurveTo(o.x + 3, y + 3, o.x + o.w / 2, y + 3); ctx.quadraticCurveTo(o.x + o.w - 3, y + 3, o.x + o.w - 3, y + o.h - 6); ctx.lineTo(o.x + o.w, y + o.h - 3); ctx.lineTo(o.x, y + o.h - 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(o.x + o.w / 2, y + o.h - 1, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff4f81"; ctx.beginPath(); ctx.arc(o.x + o.w - 3, y + 3, 4, 0, Math.PI * 2); ctx.fill();
    } else if (o.kind === "banner") {
      const bg = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0); bg.addColorStop(0, o.c); bg.addColorStop(1, COLORS[(COLORS.indexOf(o.c) + 2) % COLORS.length]);
      ctx.fillStyle = bg; roundRect(o.x, y, o.w, o.h, 3); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 7.5px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText("50% OFF!", o.x + o.w / 2, y + o.h / 2 + 3);
    } else {
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, y); ctx.lineTo(o.x + o.w, y + 5); ctx.lineTo(o.x + o.w - 2, y + o.h - 6); ctx.lineTo(o.x + o.w / 2, y + o.h); ctx.lineTo(o.x + 2, y + o.h - 6); ctx.lineTo(o.x, y + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 7px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText("AD", o.x + o.w / 2, y + o.h / 2 + 3);
    }
    ctx.restore();
  }

  function drawCoin(c) {
    const g = ground(), cy = g - c.y + Math.sin((t / 260) + c.bob) * 2.5;
    ctx.save(); ctx.translate(c.x, cy);
    ctx.shadowColor = c.c; ctx.shadowBlur = 8;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = c.c; ctx.lineWidth = 1.8; roundRect(-6, -7, 12, 14, 3); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = c.c; ctx.globalAlpha = 0.85; ctx.fillRect(-4, -5, 8, 5);
    ctx.globalAlpha = 1; ctx.fillStyle = "#d4d7e3"; ctx.fillRect(-4, 2, 8, 1.5); ctx.fillRect(-4, 4.5, 5, 1.5);
    ctx.restore();
  }
  function drawPower(p) {
    const g = ground(), cy = g - p.y + Math.sin(t / 220) * 3;
    ctx.save(); ctx.translate(p.x, cy);
    const pulse = 1 + Math.sin(t / 150) * 0.08; ctx.scale(pulse, pulse);
    ctx.shadowColor = p.kind === "guard" ? "#3d9bff" : "#ffc23d"; ctx.shadowBlur = 12;
    ctx.fillStyle = p.kind === "guard" ? "#3d9bff" : "#ffc23d"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = "800 8px -apple-system,Inter,sans-serif"; ctx.textAlign = "center";
    if (p.kind === "guard") { ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4.5, -3); ctx.lineTo(4, 2); ctx.lineTo(0, 5.5); ctx.lineTo(-4, 2); ctx.lineTo(-4.5, -3); ctx.closePath(); ctx.fill(); }
    else ctx.fillText("×2", 0, 3);
    ctx.restore();
  }

  function currentFace() {
    if (finished) return "love";
    if (face.until > t) return face.k;
    if (!eyes.grounded) return "jump";
    if (t < blinkUntil) return "blink";
    const rx = runnerX();
    if (hurdles.some(o => !o.hit && o.x - rx > -10 && o.x - rx < 110)) return "focus";
    return "normal";
  }

  function drawEyes() {
    const g = ground(), x = runnerX(), y = g - 13 + eyes.y;
    if (running && !finished && Math.random() < 0.55) sparks.push({ x: x - 20, y: y + (Math.random() * 10 - 2), vx: -1.2 - Math.random() * 1.4, vy: (Math.random() - 0.5) * 0.8, life: 1, c: COLORS[(Math.random() * COLORS.length) | 0], r: 1.5 + Math.random() * 2.5 });
    for (const p of sparks) { p.x += p.vx; p.y += p.vy; p.life -= 0.035; if (p.life <= 0) continue; ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r * p.life), 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    sparks = sparks.filter(p => p.life > 0);
    const sq = eyes.squash, sx = 1 + sq * 0.18, sy = 1 - sq * 0.18;
    ctx.save(); ctx.globalAlpha = 0.18 * Math.max(0.2, 1 + eyes.y / 70); ctx.fillStyle = NAVY; ctx.beginPath(); ctx.ellipse(x, g - 1, Math.max(4, 18 * (1 + eyes.y / 120)), 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // Shield bubble
    if (shield) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(t / 120) * 0.08; ctx.fillStyle = "#3d9bff"; ctx.beginPath(); ctx.arc(x, y - 3, 25, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.7; ctx.strokeStyle = "#3d9bff"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
    const k = currentFace();
    ctx.save(); ctx.translate(x, y - 3);
    if (eyes.spin > 0) ctx.rotate((1 - eyes.spin) * Math.PI * 2);
    ctx.scale(sx * 1.1, sy * 1.1);
    const pupil = (px, py, r) => { ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px + r * 0.33, py - r * 0.33, Math.max(0.6, r * 0.28), 0, Math.PI * 2); ctx.fill(); };
    const lid = (dx, frac) => { ctx.save(); ctx.beginPath(); ctx.arc(dx, 0, 8.4, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = "#cfd3e6"; ctx.fillRect(dx - 10, -10, 20, 18 * frac); ctx.restore(); const ly = -9 + 18 * frac, half = Math.sqrt(Math.max(0, 81 - ly * ly)); ctx.strokeStyle = NAVY; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(dx - half, ly); ctx.lineTo(dx + half, ly); ctx.stroke(); };
    const brow = (dx, inner, lift) => { ctx.strokeStyle = NAVY; ctx.lineWidth = 2.3; ctx.lineCap = "round"; const left = dx < 0; ctx.beginPath(); ctx.moveTo(dx - 7, -13 - lift - (left ? 0 : inner)); ctx.lineTo(dx + 7, -13 - lift - (left ? inner : 0)); ctx.stroke(); };
    const arcEye = (dx) => { ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(dx, 4, 5.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); };
    const star = (cx, cy, r) => { ctx.fillStyle = "#ffc23d"; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); };
    const heart = (cx, cy, r) => { ctx.fillStyle = "#ff4f81"; ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.9); ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.2, cx, cy - r * 0.4); ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.2, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9); ctx.fill(); };
    const spiral = (cx, cy) => { ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5; ctx.beginPath(); for (let a = 0; a < Math.PI * 5; a += 0.3) { const r = 0.5 + a * 0.38, rot = a + t / 120; ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r); } ctx.stroke(); };
    for (const dx of [-10, 10]) {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(dx, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (k === "happy" || (k === "wink" && dx < 0)) arcEye(dx);
      else if (k === "blink") { ctx.save(); ctx.beginPath(); ctx.arc(dx, 0, 8.4, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = "#cfd3e6"; ctx.fillRect(dx - 10, -10, 20, 20); ctx.restore(); ctx.strokeStyle = NAVY; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(dx - 8, 1); ctx.quadraticCurveTo(dx, 4, dx + 8, 1); ctx.stroke(); }
      else if (k === "star") star(dx, 0, 6);
      else if (k === "love") heart(dx, 0.5, 5.5);
      else if (k === "dizzy") spiral(dx, 0);
      else if (k === "shock") { pupil(dx + 1, 0, 2.3); brow(dx, -1, 3.5); }
      else if (k === "crash") { pupil(dx + (dx < 0 ? 1.5 : -1.5), 2, 4); lid(dx, 0.52); brow(dx, 2.6, 0); }
      else if (k === "jump") { pupil(dx + 2, -3, 3.5); brow(dx, -0.5, 2.2); }
      else if (k === "focus") { pupil(dx + 3.5, 1, 3.9); lid(dx, 0.2); brow(dx, 1.8, 0); }
      else if (k === "determined") { pupil(dx + 3, 0.5, 4); lid(dx, 0.16); brow(dx, 3.2, 0); }
      else if (k === "glance") pupil(dx - 3.2, 0, 4.2);
      else pupil(dx + 3, 0, 4.2);
    }
    if (k === "happy" || k === "wink" || k === "love" || k === "star") { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = "#ff8fb0"; for (const dx of [-15, 15]) { ctx.beginPath(); ctx.ellipse(dx, 9, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    ctx.restore();
    if (bubble && bubble.life > 0) {
      bubble.life -= 0.02;
      ctx.save(); ctx.globalAlpha = Math.min(1, bubble.life * 2.5);
      ctx.font = "600 11px -apple-system,Inter,sans-serif"; const tw = ctx.measureText(bubble.text).width + 14, bx = Math.min(w - tw - 6, x + 16), by = Math.max(2, y - 40 - (1 - bubble.life) * 6);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(11,23,52,.15)"; ctx.lineWidth = 1; roundRect(bx, by, tw, 20, 10); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 8, by + 20); ctx.lineTo(bx + 4, by + 26); ctx.lineTo(bx + 14, by + 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = NAVY; ctx.textAlign = "left"; ctx.fillText(bubble.text, bx + 7, by + 14);
      ctx.restore();
    }
  }

  function drawPopups() {
    for (const p of popups) {
      p.life -= 0.022; p.y -= 0.6;
      if (p.life <= 0) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.c; ctx.font = "800 12px -apple-system,Inter,sans-serif"; ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y); ctx.restore();
    }
    popups = popups.filter(p => p.life > 0);
  }
  function drawConfetti(dt) {
    for (const p of confetti) {
      p.vy += 0.18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
    }
    confetti = confetti.filter(p => p.y < h + 10);
  }

  // ---------- Game loop ----------
  function crash(o) {
    o.hit = true;
    if (shield) { shield = false; pop("blocked!", runnerX(), ground() - 50, "#3d9bff"); setFace("wink", 500); for (let i = 0; i < 16; i++) sparks.push({ x: runnerX(), y: ground() - 20, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 1, c: "#3d9bff", r: 2 }); return; }
    combo = 0; streak = 0; shake = 260;
    if (navigator.vibrate && played) try { navigator.vibrate(30); } catch {}
    if (t - lastHit < 3000) { setFace("dizzy", 1000); bubble = { text: "whoa…", life: 1 }; }
    else { setFace("crash", 900); bubble = { text: QUIPS[(Math.random() * QUIPS.length) | 0], life: 1 }; }
    lastHit = t; paintHud();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(2.5, last ? (now - last) / 16.67 : 1); last = now; t += dt * 16.67;
    shown += (target - shown) * Math.min(1, 0.06 * dt);
    if (finished && shown > 0.995) shown = 1;
    // Level up every 9 seconds of play.
    const lv = Math.min(8, 1 + Math.floor(t / 9000));
    if (lv > level) { level = lv; pop("Level " + level + " · faster!", w / 2, 26, "#8a5cff"); paintHud(); }
    // Physics
    if (!eyes.grounded) { eyes.vy += GRAVITY * dt; eyes.y += eyes.vy * dt; if (eyes.y >= 0) { eyes.y = 0; eyes.vy = 0; eyes.grounded = true; eyes.squash = 1; eyes.jumps = 0; } }
    eyes.squash = Math.max(0, eyes.squash - 0.08 * dt);
    eyes.spin = Math.max(0, eyes.spin - 0.06 * dt);
    if (shake > 0) shake -= dt * 16.67;
    if (t > nextBlink) { blinkUntil = t + 130; nextBlink = t + 2200 + Math.random() * 2600; }
    if (t > nextGlance) { if (face.until < t && eyes.grounded) setFace("glance", 650); nextGlance = t + 5000 + Math.random() * 5000; }
    if (!finished) {
      if (t > nextHurdle) { const extra = spawnHurdle(); nextHurdle = t + extra + Math.max(650, 1300 - level * 80) + Math.random() * 1100; }
      if (t > nextCoins) { spawnCoins(); nextCoins = t + 2600 + Math.random() * 2600; }
      if (t > nextPower && t > 6000) { spawnPower(); nextPower = t + 11000 + Math.random() * 8000; }
    }
    const v = speed() * dt, rx = runnerX(), eyeTop = ground() - 25 + eyes.y, eyeBottom = ground() - 5 + eyes.y;
    for (const o of hurdles) {
      o.x -= v * (o.fly ? 1.25 : 1);
      // Demo mode: the eyes play themselves until someone joins in.
      if (!played && !o.hit && !o.fly) { const d = o.x - rx; if (d < 52 && d > 22) jump(); if (o.kind === "stack" && !eyes.grounded && eyes.jumps === 1 && eyes.vy > -1 && d < 30) jump(); }
      const overlapX = o.x < rx + 18 && o.x + o.w > rx - 18, top = hurdleTop(o), bottom = top + o.h;
      if (overlapX && !o.hit && !o.fly) o.clear = Math.min(o.clear ?? 99, top - eyeBottom);
      const hitY = o.fly ? (eyeTop < bottom && eyeBottom > top) : eyeBottom > top;
      if (!o.hit && overlapX && hitY) crash(o);
      if (!o.scored && !o.hit && o.x + o.w < rx - 18) {
        o.scored = true; combo++; streak++;
        const near = (o.clear ?? 99) < 6;
        addPoints(o.kind === "stack" ? 25 : o.fly ? 20 : 10, rx, ground() - 48, near ? "Close!" : "");
        if (near) setFace("shock", 550);
        else if (streak % 5 === 0) { setFace("star", 1100); bubble = { text: CHEERS[(Math.random() * CHEERS.length) | 0], life: 1 }; pop("×" + mult() + " combo", rx, ground() - 64, "#ff4f81"); }
        else setFace(Math.random() < 0.25 ? "wink" : "happy", 520);
      }
    }
    hurdles = hurdles.filter(o => o.x > -70);
    const ey = ground() - 16 + eyes.y;
    for (const c of coins) {
      c.x -= v;
      if (!c.got && Math.abs(c.x - rx) < 18 && Math.abs((ground() - c.y) - ey) < 18) { c.got = true; combo++; addPoints(5, c.x, ground() - c.y - 12); for (let i = 0; i < 6; i++) sparks.push({ x: c.x, y: ground() - c.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 1, c: c.c, r: 1.6 }); }
    }
    coins = coins.filter(c => c.x > -20 && !c.got);
    for (const p of powerups) {
      p.x -= v;
      if (!p.got && Math.abs(p.x - rx) < 20 && Math.abs((ground() - p.y) - ey) < 20) {
        p.got = true;
        if (p.kind === "guard") { shield = true; pop("Ad blocker!", rx, ground() - 56, "#3d9bff"); }
        else { doubleUntil = t + 7000; pop("×2 points!", rx, ground() - 56, "#ff8a3d"); }
        setFace("star", 700); paintHud();
      }
    }
    powerups = powerups.filter(p => p.x > -20 && !p.got);
    // Draw (a drawing error must never stop the loop or the loading bar)
    try {
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
      drawFloaters(dt); drawTrack(); coins.forEach(drawCoin); powerups.forEach(drawPower); hurdles.forEach(drawHurdle); drawEyes(); drawPopups(); drawConfetti(dt);
      ctx.restore();
    } catch (e) { try { ctx.restore(); ctx.restore(); } catch {} }
    raf = requestAnimationFrame(frame);
  }

  function paintHud() {
    if (!hud) return;
    const m = mult();
    hud.textContent = played ? emoji + " " + points + " pts" + (m > 1 ? " · ×" + m : "") + (shield ? " · 🛡" : "") + " · Lv " + level + (best ? " · Best " + best : "") : "";
    if (hint) hint.textContent = played ? "· Tap / space to jump · again to double jump" : "· Jump the pop-ups, grab the creatives";
    if (host) host.classList.toggle("playing", played);
  }

  function onKey(e) {
    if (!running || finished || !host || host.offsetParent === null) return;
    if (!(e.code === "Space" || e.code === "ArrowUp")) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag) || (e.target && e.target.isContentEditable)) return;
    const r = host.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (e.repeat) { e.preventDefault(); return; }
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
      if (!api.supported || !host || running) return;
      host.hidden = false; size(); seedFloaters();
      running = true; finished = false; last = 0; t = 0; level = 1;
      nextHurdle = 600; nextCoins = 1800; nextPower = 7000;
      hurdles = []; coins = []; powerups = []; popups = []; confetti = []; lines = [];
      shown = target; points = 0; combo = 0; played = false; shield = false; doubleUntil = 0; shake = 0;
      streak = 0; bubble = null; face = { k: "", until: 0 }; lastHit = -1e9; emoji = "🙂"; nextBlink = 1800; nextGlance = 5000;
      eyes.y = 0; eyes.vy = 0; eyes.grounded = true; eyes.jumps = 0; eyes.spin = 0;
      paintHud(); raf = requestAnimationFrame(frame);
    },
    progress(p) { target = Math.max(0, Math.min(1, p)); },
    finish() {
      if (!running) return "";
      finished = true; target = 1; hurdles.forEach(o => (o.scored = true));
      for (let i = 0; i < 80; i++) confetti.push({ x: w - 30, y: ground() - 20, vx: -Math.random() * 6 - 1, vy: -Math.random() * 6 - 2, vr: (Math.random() - 0.5) * 0.4, r: 0, c: COLORS[i % COLORS.length] });
      return played ? "You scored " + points + " points" + (points && points >= best ? " — a new best!" : "") : "";
    },
    stop() { running = false; cancelAnimationFrame(raf); if (host) host.hidden = true; },
    get running() { return running; }
  };
  window.AdSnoopDash = api;
})();
