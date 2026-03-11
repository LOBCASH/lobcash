import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 仅用于 Docker 部署，Vercel 不需要
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
