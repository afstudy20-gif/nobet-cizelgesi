import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nobet/shared"],
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
