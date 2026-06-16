/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tree-shake barrel-style packages so only the icons actually used are
  // bundled, trimming per-import overhead across the app.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    // Friendly short link to the drawing-library warehouse. Kept same-origin so
    // the cross-tab import bridge (localStorage) still reaches the studio tab.
    return [{ source: "/warehouse", destination: "/drawings/library" }];
  },
  webpack: (config) => {
    // pdf.js (used for PDF→SVG import in the drawing studio) has an optional
    // dependency on the Node `canvas` package that only applies server-side. It
    // isn't installed and isn't needed in the browser bundle, so stub it out.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
