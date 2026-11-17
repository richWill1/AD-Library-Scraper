import type { NextConfig } from "next";

// Preview-only: forward public research requests to the existing AdSnoop API.
// The production service keeps Meta tokens and collector credentials private.
// This branch is deployed separately; the main branch is unchanged.
const backend = "https://ad-library-scraper-94t0.onrender.com";
const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/health", destination: `${backend}/api/health` },
        { source: "/api/ads", destination: `${backend}/api/ads` },
        { source: "/api/media", destination: `${backend}/api/media` },
        { source: "/api/formats", destination: `${backend}/api/formats` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
