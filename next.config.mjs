/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': false, // ← امنع تجميع pino-pretty في المتصفح
    };
    return config;
  },
};

export default nextConfig;
