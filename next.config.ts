import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep Sharp as a real Node external in the standalone server. Next's
  // bundled image optimizer copy can otherwise resolve a second Sharp
  // version and fail to load the platform-native Windows addon at runtime.
  serverExternalPackages: ["sharp"],
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Allow the preview panel's origin to load Next.js dev resources
  // (_next/static chunks, HMR). Without this, Next.js 16 blocks
  // cross-origin requests from the preview iframe, which can cause
  // the preview to hang on a blank screen. The pattern matches the
  // Space-Z preview hostnames (preview-<chat-id>.space-z.ai).
  allowedDevOrigins: [
    "*.space-z.ai",
    "preview-*.space-z.ai",
  ],
};

export default nextConfig;
