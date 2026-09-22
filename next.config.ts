import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server (.next/standalone) so the Docker image needs no
  // node_modules. Vercel ignores this and builds its own way.
  output: "standalone",

  // Don't advertise the framework.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app is never meant to be framed (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Lead ids and names appear in URLs; don't leak them to other sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // A CRM has no use for the camera, microphone or location.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
