/* AdSnoop hero: drifting starfield with depth, cursor scanner, ad "signal" pulses,
   and a rotating, letter-by-letter headline. Visual only; nothing is sent or stored. */
(function () {
  "use strict";

  const PHRASES = [
    "are putting out there.",
    "are testing this week.",
    "are saying to your customers.",
    "are running on Instagram.",
    "keep running for months."
  ];

  function init() {
    const hero = document.querySelector(".hero.space");
    if (!hero) return;
    const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    const fine = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)").matches : false;
    stars(hero, reduce, fine);
    headline(hero, reduce, fine);
  }

  // ---------- Starfield ----------
  function stars(hero, reduce, fine) {
    const canvas = hero.querySelector(".space-canvas");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, dots = [], pulses = [], running = false, visible = true, raf = 0, last = 0, nextPulse = 0;
    const mouse = { x: -1e4, y: -1e4, tx: 0, ty: 0, px: 0, py: 0, on: false };
    // Brand accents used for scanner links and ad pulses.
    const ACCENTS = ["255,111,145", "255,149,72", "102,153,255"];

    function size() {
      const r = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(260, Math.round((w * h) / 5200));
      dots = Array.from({ length: count }, () => {
        const z = Math.random(); // 0 far .. 1 near
        return {
          x: Math.random() * w, y: Math.random() * h, z,
          r: 0.35 + z * 1.15,
          vx: (Math.random() - 0.5) * (0.02 + z * 0.06),
          vy: -(0.01 + z * 0.05),
          tw: Math.random() * Math.PI * 2, ts: 0.6 + Math.random() * 1.6,
          ox: 0, oy: 0
        };
      });
      if (reduce.matches) draw(0, true);
    }

    function draw(dt, still) {
      ctx.clearRect(0, 0, w, h);
      // Ease the parallax offset toward the cursor.
      mouse.px += (mouse.tx - mouse.px) * 0.05;
      mouse.py += (mouse.ty - mouse.py) * 0.05;
      const near = [];
      for (const d of dots) {
        if (!still) {
          d.x += d.vx * dt; d.y += d.vy * dt; d.tw += d.ts * dt * 0.001;
          if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
          if (d.x < -4) d.x = w + 4; else if (d.x > w + 4) d.x = -4;
        }
        // Parallax: nearer dots move further with the cursor.
        let x = d.x + mouse.px * (6 + d.z * 22), y = d.y + mouse.py * (4 + d.z * 14);
        let a = 0.25 + d.z * 0.55 + Math.sin(d.tw) * 0.18;
        if (mouse.on) {
          const dx = x - mouse.x, dy = y - mouse.y, dist = Math.hypot(dx, dy);
          if (dist < 150) {
            const f = 1 - dist / 150;
            // Gentle push away from the cursor, eased so dots don't jump.
            d.ox += ((dx / (dist || 1)) * f * 18 - d.ox) * 0.12;
            d.oy += ((dy / (dist || 1)) * f * 18 - d.oy) * 0.12;
            a = Math.min(1, a + f * 0.8);
            near.push({ x: x + d.ox, y: y + d.oy, f });
          } else { d.ox *= 0.92; d.oy *= 0.92; }
        } else { d.ox *= 0.92; d.oy *= 0.92; }
        x += d.ox; y += d.oy;
        ctx.globalAlpha = Math.max(0.05, a);
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(x, y, d.r, 0, Math.PI * 2); ctx.fill();
      }
      // Scanner: link nearby dots around the cursor like a constellation.
      if (near.length > 1) {
        ctx.lineWidth = 0.6;
        for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
          const p = near[i], q = near[j], dd = Math.hypot(p.x - q.x, p.y - q.y);
          if (dd > 90) continue;
          ctx.globalAlpha = (1 - dd / 90) * Math.min(p.f, q.f) * 0.9;
          ctx.strokeStyle = "rgba(" + ACCENTS[(i + j) % 3] + ",1)";
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      // Ad "signals": a dot lights up with an expanding ring now and then.
      if (!still) {
        for (const p of pulses) {
          p.t += dt;
          const k = p.t / 1800;
          ctx.globalAlpha = Math.max(0, 1 - k) * 0.85;
          ctx.strokeStyle = "rgba(" + p.c + ",1)"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2 + k * 26, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = Math.max(0, 1 - k);
          ctx.fillStyle = "rgba(" + p.c + ",1)";
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        pulses = pulses.filter(p => p.t < 1800);
      }
      ctx.globalAlpha = 1;
    }

    function frame(t) {
      if (!running) return;
      const dt = Math.min(48, last ? t - last : 16); last = t;
      if (t > nextPulse) {
        const d = dots[(Math.random() * dots.length) | 0];
        if (d && d.y < h * 0.8) pulses.push({ x: d.x + mouse.px * (6 + d.z * 22), y: d.y + mouse.py * (4 + d.z * 14), t: 0, c: ACCENTS[(Math.random() * 3) | 0] });
        nextPulse = t + 1400 + Math.random() * 2200;
      }
      draw(dt, false);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || reduce.matches || !visible || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    hero.addEventListener("pointermove", e => {
      if (!fine || e.pointerType !== "mouse") return;
      const r = hero.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true;
      mouse.tx = (mouse.x / w - 0.5) * -1; mouse.ty = (mouse.y / h - 0.5) * -1;
    }, { passive: true });
    hero.addEventListener("pointerleave", () => { mouse.on = false; mouse.tx = 0; mouse.ty = 0; });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(hero);
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    if (reduce.addEventListener) reduce.addEventListener("change", () => { if (reduce.matches) { stop(); draw(0, true); } else start(); });
    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(size, 150); });
    size(); start();
  }

  const STOPS = [[255, 111, 145], [255, 149, 72], [110, 156, 255]];
  function gradient(t) {
    const seg = t < 0.5 ? 0 : 1, k = seg ? (t - 0.5) * 2 : t * 2, a = STOPS[seg], b = STOPS[seg + 1];
    return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",") + ")";
  }

  // ---------- Rotating headline ----------
  function headline(hero, reduce, fine) {
    const el = hero.querySelector(".rotator");
    if (!el) return;
    const sr = hero.querySelector(".rotator-sr");
    let i = 0, timer = 0;
    const paint = text => {
      el.innerHTML = "";
      const frag = document.createDocumentFragment();
      text.split(" ").forEach((word, wi, arr) => {
        const w = document.createElement("span"); w.className = "rw";
        [...word].forEach(ch => { const s = document.createElement("span"); s.className = "rl"; s.textContent = ch; w.appendChild(s); });
        frag.appendChild(w);
        if (wi < arr.length - 1) frag.appendChild(document.createTextNode(" "));
      });
      el.appendChild(frag);
      const letters = [...el.querySelectorAll(".rl")];
      // Brand gradient (pink, orange, blue) spread across the letters.
      letters.forEach((l, n) => { l.style.color = gradient(letters.length > 1 ? n / (letters.length - 1) : 0); });
      return letters;
    };
    if (reduce.matches) { paint(PHRASES[0]).forEach(l => l.classList.add("in")); return; }

    function show(text) {
      const letters = paint(text);
      // Letters arrive one by one with a soft blur-in.
      letters.forEach((l, n) => setTimeout(() => l.classList.add("in"), 140 + n * 34));
      if (sr) sr.textContent = "See what your competitors " + text;
      timer = setTimeout(() => hide(letters), 140 + letters.length * 34 + 2600);
    }
    function hide(letters) {
      letters.slice().reverse().forEach((l, n) => setTimeout(() => { l.classList.remove("in"); l.classList.add("out"); }, n * 16));
      timer = setTimeout(() => { i = (i + 1) % PHRASES.length; show(PHRASES[i]); }, letters.length * 16 + 320);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearTimeout(timer);
      else { clearTimeout(timer); show(PHRASES[i]); }
    });
    show(PHRASES[0]);

    // Letters near the cursor lift and brighten.
    if (!fine) return;
    const h1 = hero.querySelector("h1");
    let raf = 0, mx = 0, my = 0;
    const apply = () => {
      raf = 0;
      hero.querySelectorAll("h1 .rl, h1 .sl").forEach(l => {
        const r = l.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(cx - mx, cy - my), f = Math.max(0, 1 - d / 110);
        l.style.setProperty("--lift", f.toFixed(3));
      });
    };
    h1.addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(apply); }, { passive: true });
    h1.addEventListener("pointerleave", () => hero.querySelectorAll("h1 .rl, h1 .sl").forEach(l => l.style.setProperty("--lift", "0")));
    // Split the static first line into letters too, so the whole headline reacts.
    const first = h1.querySelector(".static-line");
    if (first && !first.dataset.split) {
      first.dataset.split = "1";
      const words = first.textContent.split(" ");
      first.textContent = "";
      words.forEach((word, wi) => {
        const w = document.createElement("span"); w.className = "rw";
        [...word].forEach(ch => { const s = document.createElement("span"); s.className = "sl"; s.textContent = ch; w.appendChild(s); });
        first.appendChild(w);
        if (wi < words.length - 1) first.appendChild(document.createTextNode(" "));
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
