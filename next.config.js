/** @type {import("next").NextConfig} */
function buildRemotePatterns() {
  const patterns = [];
  const r2Endpoint = process.env.R2_ENDPOINT;

  if (r2Endpoint) {
    try {
      const url = new URL(r2Endpoint);
      patterns.push({
        protocol: url.protocol.replace(":", ""),
        hostname: url.hostname,
        port: url.port,
        pathname: "/**",
      });
    } catch {
      // Ignore malformed endpoints and keep the app booting.
    }
  }

  return patterns;
}

const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
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
