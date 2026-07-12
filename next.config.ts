import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs"],
  allowedDevOrigins: [
    "http://192.168.1.68:4000",
    "http://localhost:4000",
    "192.168.1.68",
    "localhost",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
