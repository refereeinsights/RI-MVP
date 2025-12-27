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
      "@ri-backend": require("path").join(__dirname, "../RI_Backend/src"),
    };
    return config;
  },
};

const sentryWebpackPluginOptions = {
  // Suppress verbose webpack output while building
  silent: true,
};

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
