import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nobet/shared"],
  output: "standalone",
};

export default nextConfig;
