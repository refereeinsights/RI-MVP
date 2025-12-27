const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/server": require("path").join(__dirname, "src/server"),
      "@server": require("path").join(__dirname, "src/server"),
    };
    return config;
  },
};

const sentryWebpackPluginOptions = {
  // Suppress verbose webpack output while building
  silent: true,
};

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
