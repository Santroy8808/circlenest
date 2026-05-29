/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/.git/**",
          "**/node_modules/**",
          "**/.next/**",
          "**/DumpStack.log.tmp",
          "**/hiberfil.sys",
          "**/pagefile.sys",
          "**/swapfile.sys",
        ],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
