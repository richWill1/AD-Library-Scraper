import { spawn } from "node:child_process";
const port = process.env.PORT || "3000";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", port], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));

if (process.env.RENDER_SERVICE_NAME === "adsnoop-live-design-test") {
  // One-off safe connectivity diagnostic: never log credentials or raw API payloads.
  void (async () => {
    const began = Date.now();
    try {
      const response = await fetch("https://ad-library-owned-collector.onrender.com/health", {
        signal: AbortSignal.timeout(80000),
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      console.info("[AdSnoop collector reachability]", JSON.stringify({
        http: response.status,
        status: body.status || "unknown",
        collector: body.collector || "unknown",
        elapsedMs: Date.now()-began,
      }));
    } catch (e) {
      console.info("[AdSnoop collector reachability]", JSON.stringify({
        code: e?.name || "network-error",
        elapsedMs: Date.now()-began,
      }));
    }
  })();
  void (async () => {
    try {
      const response = await fetch("https://ad-library-scraper-94t0.onrender.com/api/health", {
        signal: AbortSignal.timeout(70000),
        cache: "no-store",
      });
      const data = await response.json();
      console.info("[AdSnoop preview diagnostics]", JSON.stringify({
        upstreamHttp: response.status,
        metaState: data?.connection?.state ?? "unknown",
        mediaMode: data?.mediaMode ?? "unknown",
        mediaCollectorConfigured: data?.mediaCollector?.configured === true,
        ownerReconnectReady: data?.recovery?.ready === true,
      }));

      if (response.ok && ["connected", "renew-soon"].includes(data?.connection?.state)) {
        try {
          const origin = "https://ad-library-scraper-94t0.onrender.com";
          const query = new URL(origin + "/api/ads");
          query.search = new URLSearchParams({ q: "Sharps", page: "280531915302272", coverage: "GB" }).toString();
          const searchResponse = await fetch(query, { signal: AbortSignal.timeout(45000), cache: "no-store" });
          const search = await searchResponse.json();
          const id = Array.isArray(search.ads) && search.ads.find(a => /^\d{1,30}$/.test(a.id))?.id;
          console.info("[AdSnoop data probe]", JSON.stringify({
            http: searchResponse.status,
            code: search.code || "OK",
            adCount: Array.isArray(search.ads) ? search.ads.length : null,
            hasValidAd: !!id,
          }));
          if (id && data?.mediaCollector?.configured === true) {
            const mediaResponse = await fetch(origin + "/api/media?id=" + encodeURIComponent(id), {
              signal: AbortSignal.timeout(125000), cache: "no-store",
            });
            const media = await mediaResponse.json();
            console.info("[AdSnoop creative probe]", JSON.stringify({
              http: mediaResponse.status,
              code: media.code || "UNKNOWN",
              itemCount: Array.isArray(media.items) ? media.items.length : 0,
              kinds: Array.isArray(media.items) ? [...new Set(media.items.map(i => i.kind))] : [],
            }));
          }
        } catch (e) {
          console.info("[AdSnoop data or creative probe]", e?.name || "failed");
        }
      }
    } catch (error) {
      console.info("[AdSnoop preview diagnostics] upstream unavailable:", error?.name || "network-error");
    }
  })();
}
