const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
};

const sentryWebpackPluginOptions = {
  // Suppress verbose webpack output while building
  silent: true,
};

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
