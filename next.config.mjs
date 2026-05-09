/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Fabric.js tries to resolve the server-side `canvas` package.
    // Stubbing it out keeps the browser bundle clean.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
