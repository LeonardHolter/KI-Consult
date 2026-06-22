import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next doesn't pick up a parent
  // directory's lockfile / postcss config.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
