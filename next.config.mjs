/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
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
  transpilePackages: ['gsap'],
};

export default nextConfig;
