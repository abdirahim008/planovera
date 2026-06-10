/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js (used for PDF→SVG import in the drawing studio) has an optional
    // dependency on the Node `canvas` package that only applies server-side. It
    // isn't installed and isn't needed in the browser bundle, so stub it out.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
