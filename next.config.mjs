/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Enabled for VPS (Static)
  images: { unoptimized: true },
};

export default nextConfig;
