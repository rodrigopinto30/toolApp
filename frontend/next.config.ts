import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  reactCompiler: true,
  compress: false,
  images: {
    loader: "custom",
    loaderFile: "./src/lib/media-loader.ts",
    deviceSizes: [320, 640, 960, 1280],
    imageSizes: [],
  },
};

export default withNextIntl(nextConfig);
