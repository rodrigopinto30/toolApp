import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  reactCompiler: true,
  compress: false,
  images: { unoptimized: true },
};

export default nextConfig;
