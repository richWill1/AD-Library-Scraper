import type { NextConfig } from "next";

// Main AdSnoop service config. Previews without Meta credentials forward
// research requests to the main service, which keeps credentials private.
const backend = "https://ad-library-scraper-94t0.onrender.com";
const nextConfig: NextConfig = {
  async rewrites() {
    // The AdSnoop research app is the homepage.
    const home = [
      { source: "/", destination: "/live/index.html" },
      { source: "/christmas-ads", destination: "/live/christmas.html" },
      { source: "/black-friday-ads", destination: "/live/black-friday.html" },
      { source: "/meta-updates", destination: "/live/meta-updates.html" },
    ];
    // A service with its own Meta token uses its own API routes; a preview
    // without one forwards public research requests to the main service.
    if (process.env.META_ACCESS_TOKEN?.trim() || process.env.RENDER_SERVICE_ID === "srv-db3ufoad0e5s73f5dudg") return { beforeFiles: home, afterFiles: [], fallback: [] };

    return {
      beforeFiles: [
        ...home,
        { source: "/api/ads", destination: "/api/preview-ads" },
        { source: "/api/health", destination: `${backend}/api/health` },
        { source: "/api/media", destination: `${backend}/api/media` },
        { source: "/api/formats", destination: `${backend}/api/formats` },
        { source: "/api/popular", destination: `${backend}/api/popular` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
