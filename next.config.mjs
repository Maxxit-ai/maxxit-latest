/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEON_REST_URL: process.env.NEON_REST_URL,
  },
  // Transpile GSAP packages to fix ES module import issues during SSR
  transpilePackages: ["gsap"],

  // IMPORTANT: Prevent URL normalization redirects that break CORS preflight
  // These settings ensure middleware runs BEFORE any redirects happen
  skipMiddlewareUrlNormalize: true,
  skipTrailingSlashRedirect: true,

  // Explicit headers for all API routes (backup for CORS)
  async headers() {
    return [
      {
        // Match all API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, ngrok-skip-browser-warning",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
