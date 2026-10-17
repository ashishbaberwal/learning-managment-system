import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  output: "standalone",
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
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()]
    }

    return config
  },
};

export default nextConfig;
