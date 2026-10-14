import type { NextConfig } from "next";

const supabaseLogoUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingIncludes: {
    "/q/*/pdf": ["./src/server/assets/fonts/*.ttf"],
    "/quotations/*/pdf": ["./src/server/assets/fonts/*.ttf"],
  },
  images: {
    remotePatterns: supabaseLogoUrl
      ? [
          {
            protocol: supabaseLogoUrl.protocol.slice(0, -1) as "http" | "https",
            hostname: supabaseLogoUrl.hostname,
            port: supabaseLogoUrl.port,
            pathname: "/storage/v1/object/public/webameen-quotation-logos/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/q/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/i/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
