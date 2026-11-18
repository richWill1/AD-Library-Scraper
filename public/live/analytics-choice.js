(() => {
  if (location.hostname !== "adsnoop.co.uk") return;
  const measurementId = "G-8BWL3SGLRE";
  const choiceKey = "adsnoop-analytics-choice";
  const panel = document.getElementById("analytics-choice");
  const settings = document.getElementById("analytics-settings");
  if (!panel || !settings) return;
  let started = false;
  let choice;
  try { choice = localStorage.getItem(choiceKey); } catch {}
  function startAnalytics() {
    if (started) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    gtag("js", new Date());
    gtag("config", measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(script);
  }
  function choose(value) {
    try { localStorage.setItem(choiceKey, value); } catch {}
    panel.hidden = true;
    if (value === "allow") {
      window["ga-disable-" + measurementId] = false;
      startAnalytics();
    } else {
      window["ga-disable-" + measurementId] = true;
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (name === "_ga" || name.startsWith("_ga_")) {
          document.cookie = name + "=; Max-Age=0; Path=/; Domain=adsnoop.co.uk";
          document.cookie = name + "=; Max-Age=0; Path=/";
        }
      }
      if (started) location.reload();
    }
  }
  settings.hidden = false;
  settings.onclick = () => { panel.hidden = false; document.getElementById("analytics-decline").focus(); };
  panel.hidden = choice === "allow" || choice === "decline";
  document.getElementById("analytics-decline").onclick = () => choose("decline");
  document.getElementById("analytics-allow").onclick = () => choose("allow");
  if (choice === "allow") startAnalytics();
})();
