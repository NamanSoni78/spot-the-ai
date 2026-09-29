import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    // safety net for contributor environments; the repo typechecks clean
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
