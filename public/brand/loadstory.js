/* Snoop's story: a short animated tale inside the loading bar.
   The coloured track is the real loading progress. The AdSnoop eyes walk along
   it, spot little ads, scoop them up and react, and celebrate at the finish
   flag. Nothing to press: it simply tells people their creatives are coming.
   Same interface as the earlier mini-game (mount, start, progress, finish,
   stop), so the loading bar code doesn't change. */
(function () {
  "use strict";
  const COLORS = ["#ff4f81", "#ff8a3d", "#ffc23d", "#3ccf91", "#3d9bff", "#8a5cff"];
  const NAVY = "#0b1734";
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let host, canvas, ctx, story, raf = 0, last = 0, running = false, finished = false;
  let w = 0, h = 0, dpr = 1, t = 0, shown = 0, target = 0, lastMove = 0;
  let items = [], pops = [], confetti = [], trail = [], blinkUntil = 0, nextBlink = 1600, happyUntil = 0, flash = { text: "", until: 0 };
  // The little ads Snoop finds on the way, and what Snoop says about each.
  const KINDS = [
    { k: "image", c: "#3d9bff", say: "Found an image ad" },
    { k: "video", c: "#8a5cff", say: "Ooh, a video" },
    { k: "offer", c: "#ff4f81", say: "Spotted an offer" },
    { k: "carousel", c: "#ff8a3d", say: "A whole carousel!" },
    { k: "image", c: "#3ccf91", say: "Another one for the pile" },
    { k: "video", c: "#ffc23d", say: "Grabbing that video" },
    { k: "offer", c: "#3d9bff", say: "Noting the price" }
  ];

  const ground = () => h - 22;
  const startX = () => 30, endX = () => w - 46;
  const walkerX = () => Math.max(startX(), Math.min(endX(), 10 + (w - 20) * shown - 8));
  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = Math.max(200, r.width); h = Math.max(60, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    items.forEach(it => (it.x = Math.max(startX(), Math.min(endX(), 10 + (w - 20) * it.at - 8))));
  }
  function roundRect(x, y, ww, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); }
  function brand() {
    const m = (document.getElementById("loadbarText")?.textContent || "").match(/Loading (.+?)’s ads/);
    return m ? m[1] : "";
  }
  function caption() {
    if (finished) return "Got them all ✨ Here they come";
    if (flash.until > t) return flash.text;
    const who = brand();
    if (t - lastMove > 7000 && shown < 0.97) return "Meta’s taking its time… Snoop is still looking";
    if (shown < 0.08) return "Tiptoeing into Meta’s Ad Library…";
    if (shown < 0.3) return who ? "Ooh, there’s " + who + "’s stuff" : "Ooh, there are their ads";
    if (shown < 0.55) return "Scooping up the creatives…";
    if (shown < 0.8) return "Peeking at the videos and offers…";
    return "Nearly there… one last look";
  }
  function setStory() { if (story) { const c = caption(); if (story.textContent !== c) story.textContent = c; } }

  function drawTrack() {
    const g = ground();
    ctx.fillStyle = "#ececf3"; roundRect(10, g, w - 20, 12, 6); ctx.fill();
    const filled = Math.max(12, (w - 20) * shown);
    const grad = ctx.createLinearGradient(10 - (t * 0.05) % (w / 2), 0, 10 + w - (t * 0.05) % (w / 2), 0);
    COLORS.concat(COLORS[0]).forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = grad; roundRect(10, g, filled, 12, 6); ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = "#fff"; roundRect(14, g + 2, Math.max(0, filled - 8), 3, 2); ctx.fill(); ctx.restore();
    // Finish flag, waving at the end.
    const fx = w - 28, fy = g - 34, wave = finished ? Math.sin(t / 90) * 2 : Math.sin(t / 400);
    ctx.fillStyle = NAVY; ctx.fillRect(fx, fy, 2.5, 34);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = (r + c) % 2 ? NAVY : "#fff"; ctx.fillRect(fx + 2 + c * 4, fy + r * 4 + (c * wave) / 3, 4, 4); }
  }
  function drawItem(it) {
    if (it.got && it.fly >= 1) return;
    const bob = reduce ? 0 : Math.sin(t / 380 + it.at * 20) * 3;
    let x = it.x, y = ground() - 34 + bob, s = 1, a = 1;
    if (it.got) { // fly into the pile behind Snoop
      const p = it.fly, tx = walkerX() - 30, ty = ground() - 16;
      x = it.x + (tx - it.x) * p; y = y + (ty - y) * p - Math.sin(p * Math.PI) * 22; s = 1 - p * 0.55; a = 1 - p * 0.3;
    }
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s);
    ctx.shadowColor = it.c; ctx.shadowBlur = it.got ? 0 : 10;
    if (it.k === "offer") {
      ctx.fillStyle = it.c; roundRect(-19, -8, 38, 16, 4); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.font = "700 8px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("50% OFF", 0, 0.5);
    } else {
      if (it.k === "carousel") { ctx.fillStyle = "#fff"; ctx.strokeStyle = it.c; ctx.lineWidth = 1.5; roundRect(-7, -15, 22, 26, 4); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = "#fff"; ctx.strokeStyle = it.c; ctx.lineWidth = 2; roundRect(-11, -13, 22, 26, 4); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = it.c; ctx.globalAlpha = a * 0.25; roundRect(-8, -10, 16, 11, 2); ctx.fill(); ctx.globalAlpha = a;
      if (it.k === "video") { ctx.fillStyle = it.c; ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(4, -4.5); ctx.lineTo(-3, -1); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = it.c; ctx.beginPath(); ctx.arc(-3, -6, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(-2, -4); ctx.lineTo(2, -1); ctx.lineTo(8, -6); ctx.lineTo(8, 1); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = "#d9dbe6"; roundRect(-8, 4, 16, 2.5, 1); ctx.fill(); roundRect(-8, 8, 10, 2.5, 1); ctx.fill();
    }
    ctx.restore();
  }
  function drawPile() {
    // Collected ads stacked in a little pile Snoop pushes along.
    const got = items.filter(i => i.got && i.fly >= 1);
    const x = walkerX() - 30, g = ground();
    got.forEach((it, i) => {
      ctx.save(); ctx.translate(x - (i % 2) * 4, g - 6 - i * 4); ctx.rotate(((i % 3) - 1) * 0.12);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = it.c; ctx.lineWidth = 1.5; roundRect(-9, -4, 18, 8, 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }
  function face() {
    if (finished) return "joy";
    if (t < blinkUntil) return "blink";
    if (t < happyUntil) return "happy";
    const ahead = items.find(i => !i.got && i.x > walkerX() && i.x - walkerX() < 70);
    if (ahead) return "spot";
    if (t - lastMove > 7000) return "look";
    return "walk";
  }
  function drawEyes() {
    const g = ground(), x = walkerX(), k = face();
    const step = reduce || finished ? 0 : Math.abs(Math.sin(t / 160)) * (Date.now() - lastMoveWall < 900 ? 3 : 0.8);
    const jumpJoy = k === "joy" && !reduce ? Math.abs(Math.sin(t / 150)) * 8 : 0;
    const y = g - 14 - step - jumpJoy;
    ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = NAVY; ctx.beginPath(); ctx.ellipse(x, g - 1, 17, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.scale(1.1, 1.1);
    const look = k === "look" ? Math.sin(t / 700) * 3.5 : k === "spot" ? 3.5 : 3;
    const lookY = k === "spot" ? -3 : 0;
    for (const dx of [-10, 10]) {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6;
      const r = k === "spot" ? 10 : 9;
      ctx.beginPath(); ctx.arc(dx, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (k === "blink") { ctx.strokeStyle = NAVY; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(dx - 7, 1); ctx.quadraticCurveTo(dx, 4, dx + 7, 1); ctx.stroke(); }
      else if (k === "happy" || k === "joy") { ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(dx, 4, 5.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      else {
        const pr = k === "spot" ? 3 : 4.2;
        ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(dx + look, lookY, pr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(dx + look + pr * 0.33, lookY - pr * 0.33, Math.max(0.6, pr * 0.28), 0, Math.PI * 2); ctx.fill();
      }
      if (k === "spot") { ctx.strokeStyle = NAVY; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(dx - 6, -15); ctx.lineTo(dx + 6, -16); ctx.stroke(); }
    }
    if (k === "happy" || k === "joy") { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = "#ff8fb0"; for (const dx of [-15, 15]) { ctx.beginPath(); ctx.ellipse(dx, 9, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    ctx.restore();
    // A thought bubble when Snoop spots something.
    if (k === "spot") { ctx.save(); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#d6d9e6"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 20, y - 24, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = NAVY; ctx.font = "700 11px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", x + 20, y - 24); ctx.restore(); }
  }
  function drawPops(dt) {
    for (const p of pops) { p.life -= dt / 900; p.y -= dt * 0.025; if (p.life <= 0) continue; ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.c; ctx.font = "700 11px -apple-system,Inter,sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.text, p.x, p.y); ctx.restore(); }
    pops = pops.filter(p => p.life > 0);
    for (const c of confetti) { c.x += c.vx; c.y += c.vy; c.vy += 0.15; c.r += c.vr; if (c.y > h + 10) continue; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-2.5, -1.5, 5, 3); ctx.restore(); }
    confetti = confetti.filter(c => c.y <= h + 10);
  }
  let lastMoveWall = 0;
  function update(dt) {
    t += dt;
    const before = shown;
    shown += (target - shown) * Math.min(1, dt / (reduce ? 1 : 420));
    if (Math.abs(shown - before) > 0.0004) lastMoveWall = Date.now();
    if (t > nextBlink) { blinkUntil = t + 140; nextBlink = t + 2400 + Math.random() * 2600; }
    for (const it of items) {
      if (!it.got && walkerX() >= it.x - 6) {
        it.got = true; it.fly = 0; happyUntil = t + 700;
        flash = { text: it.say + "…", until: t + 1500 };
        pops.push({ x: it.x, y: ground() - 50, text: "+1", c: it.c, life: 1 });
      }
      if (it.got && it.fly < 1) it.fly = Math.min(1, it.fly + dt / 450);
    }
    setStory();
  }
  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(60, now - last) : 16; last = now;
    try {
      update(dt);
      ctx.clearRect(0, 0, w, h);
      drawTrack(); items.forEach(drawItem); drawPile(); drawEyes(); drawPops(dt);
    } catch (e) {}
    raf = requestAnimationFrame(frame);
  }

  const api = {
    supported: !!document.createElement("canvas").getContext,
    mount(el) {
      if (!api.supported || !el) return;
      host = el; canvas = el.querySelector("canvas"); ctx = canvas.getContext("2d");
      host.classList.add("story");
      el.querySelector(".lb-start")?.remove();
      const score = el.querySelector(".lb-score"); if (score) score.textContent = "";
      const title = el.querySelector(".lb-title");
      if (title) { title.innerHTML = '<span aria-hidden="true">👀</span> <span class="lb-story"></span>'; story = title.querySelector(".lb-story"); }
      addEventListener("resize", () => { if (running) size(); });
      document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else if (running) { last = 0; raf = requestAnimationFrame(frame); } });
    },
    start() {
      if (!api.supported || !host || running) return;
      host.hidden = false; size();
      running = true; finished = false; last = 0; t = 0; shown = target; lastMove = 0; lastMoveWall = Date.now();
      pops = []; confetti = []; happyUntil = 0; flash = { text: "", until: 0 };
      // Spread the ads Snoop will find along the rest of the track.
      const ahead = Math.min(0.9, shown + 0.08), slots = KINDS.length;
      items = KINDS.map((k, i) => ({ ...k, at: ahead + ((0.94 - ahead) * i) / Math.max(1, slots - 1), got: false, fly: 0 }));
      items.forEach(it => (it.x = Math.max(startX(), Math.min(endX(), 10 + (w - 20) * it.at - 8))));
      setStory(); raf = requestAnimationFrame(frame);
    },
    progress(p) {
      const next = Math.max(0, Math.min(1, p));
      if (next > target + 0.001) lastMove = t;
      target = next;
    },
    finish() {
      if (!running) return "";
      finished = true; target = 1;
      for (let i = 0; i < 70; i++) confetti.push({ x: w - 30, y: ground() - 24, vx: -Math.random() * 5 - 1, vy: -Math.random() * 5 - 2, vr: (Math.random() - 0.5) * 0.4, r: 0, c: COLORS[i % COLORS.length] });
      setStory();
      return "";
    },
    stop() { running = false; cancelAnimationFrame(raf); if (host) host.hidden = true; },
    get running() { return running; }
  };
  window.AdSnoopDash = api;
})();
