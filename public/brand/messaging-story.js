// Homepage "Messaging breakdown" panel: example ad copy is read, its key
// phrase lights up and flies into the matching theme bar. Without JS, or with
// reduced motion, the panel shows the finished breakdown as a still frame.
(() => {
  "use strict";
  const panel = document.querySelector("#feature .ms");
  if (!panel || !panel.animate) return;

  const ads = [...panel.querySelectorAll(".ms-ad")];
  const themes = [...panel.querySelectorAll(".ms-themes li")];
  const say = panel.querySelector(".ms-say");
  const sayStill = say?.textContent;
  const KINDS = ["a creative hook", "a benefit", "an offer", "a proof point"];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const STEP = 1700, HOLD = 2600, FADE = 650;
  let timers = [], running = false, visible = false;

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  // Stop-motion caption: words pop in a few frames at a time, then "boil".
  function caption(parts, colour) {
    if (!say) return;
    say.classList.remove("jitter");
    say.textContent = "";
    let n = 0;
    parts.forEach(([text, key]) => text.split(" ").forEach((word) => {
      const w = document.createElement("span");
      w.className = key ? "w k" : "w";
      w.textContent = word;
      w.style.animationDelay = n++ * 90 + "ms";
      say.appendChild(w);
    }));
    if (colour) say.style.setProperty("--c", colour);
    later(() => say.classList.add("jitter"), n * 90 + 450);
  }

  function countUp(el) {
    const target = +el.dataset.v, start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / 650, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + "%";
      if (p < 1 && running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function fly(ad, row) {
    const mark = ad.querySelector("mark");
    const base = panel.getBoundingClientRect();
    const from = mark.getBoundingClientRect();
    const to = row.querySelector(".ms-bar").getBoundingClientRect();
    const chip = document.createElement("span");
    chip.className = "ms-chip";
    chip.textContent = mark.textContent.replace(/[.,]$/, "");
    chip.style.setProperty("--c", getComputedStyle(row).getPropertyValue("--c"));
    panel.appendChild(chip);
    const x0 = from.left - base.left, y0 = from.top - base.top;
    const x1 = to.left - base.left, y1 = to.top - base.top - 10;
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 28;
    const anim = chip.animate([
      { transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 0 },
      { transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1, offset: .12 },
      { transform: `translate(${mx}px,${my}px) scale(.9)`, opacity: 1, offset: .55 },
      { transform: `translate(${x1}px,${y1}px) scale(.55)`, opacity: 0 }
    ], { duration: 800, easing: "cubic-bezier(.5,0,.3,1)" });
    anim.onfinish = anim.oncancel = () => chip.remove();
  }

  function reset() {
    ads.forEach((a) => a.classList.remove("in", "lit"));
    themes.forEach((t) => {
      t.classList.remove("on", "hit");
      const v = t.querySelector(".ms-val");
      v.textContent = "0%";
    });
  }

  function cycle() {
    if (!running) return;
    timers = [];
    panel.classList.remove("fade");
    reset();
    caption([["Reading", 0], ["every ad", 1], ["this advertiser is running…", 0]], "#b48cff");
    ads.forEach((ad, i) => {
      const row = themes[+ad.dataset.t];
      const t = 250 + i * STEP;
      later(() => ad.classList.add("in"), t);
      later(() => {
        ad.classList.add("lit");
        const phrase = ad.querySelector("mark").textContent.replace(/[.,]$/, "");
        caption([["“" + phrase + "”", 1], ["is " + KINDS[+ad.dataset.t], 0]],
          getComputedStyle(row).getPropertyValue("--c").trim());
      }, t + 450);
      later(() => fly(ad, row), t + 800);
      later(() => {
        row.classList.add("on", "hit");
        countUp(row.querySelector(".ms-val"));
      }, t + 1450);
    });
    const end = 250 + ads.length * STEP + HOLD;
    later(() => caption([["Result:", 0], ["hooks", 1], ["lead this advertiser’s messaging.", 0]], "#5fd4c4"), end - HOLD + 200);
    later(() => panel.classList.add("fade"), end);
    later(cycle, end + FADE);
  }

  function stop() {
    running = false;
    timers.forEach(clearTimeout);
    timers = [];
    panel.querySelectorAll(".ms-chip").forEach((c) => c.remove());
    panel.classList.remove("ms-live", "fade");
    if (say) { say.classList.remove("jitter"); say.textContent = sayStill; }
    themes.forEach((t) => {
      t.classList.remove("hit");
      const v = t.querySelector(".ms-val");
      v.textContent = v.dataset.v + "%";
    });
  }

  function update() {
    const want = visible && !document.hidden && !reduced.matches;
    if (want && !running) {
      running = true;
      panel.classList.add("ms-live");
      cycle();
    } else if (!want && running) {
      stop();
    }
  }

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    update();
  }, { threshold: 0.35 }).observe(panel);
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener?.("change", update);
})();
