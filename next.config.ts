import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /* Email attachments travel through a server action. Vercel's own cap on
         a request body is 4.5 MB, and the composer allows 3 MB of files. */
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
