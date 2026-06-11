import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained build at .next/standalone (server.js + a minimal
  // node_modules that includes sqlite3's native .node). Lets the webui ship as
  // one copyable folder started with `node server.js` — no `next start`, no
  // full node_modules install on the OBS host. See README "Deploying".
  output: "standalone",
};

export default nextConfig;
