import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone output (a minimal server plus
  // only the node_modules it actually needs), used by the production
  // Dockerfile to keep the runtime image small.
  output: "standalone",
};

export default nextConfig;
