import { spawn } from "node:child_process";
const port = process.env.PORT || "3000";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", port], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));

if (process.env.RENDER_SERVICE_NAME === "adsnoop-live-design-test") {
  // One-off safe connectivity diagnostic: never log credentials or raw API payloads.
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
    } catch (error) {
      console.info("[AdSnoop preview diagnostics] upstream unavailable:", error?.name || "network-error");
    }
  })();
}
