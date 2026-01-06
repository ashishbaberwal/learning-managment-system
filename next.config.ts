import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        hostname: "lmspart2.t3.storage.dev",
        port: "",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
