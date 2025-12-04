import type { NextConfig } from "next";

// Allow overriding basePath via env so local dev works on "/" while production can be mounted under e.g. "/app".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

const nextConfig: NextConfig = {
  /**
   * Static export so we can serve the built site from FastAPI (no Next server needed).
   */
  output: "export",
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
