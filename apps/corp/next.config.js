/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/tournaments",
        destination: "https://www.tournamentinsights.com/tournaments",
        permanent: true,
      },
      {
        source: "/tournament/:path*",
        destination: "https://www.tournamentinsights.com/tournaments",
        permanent: true,
      },
      {
        source: "/referees",
        destination: "https://www.refereeinsights.com",
        permanent: true,
      },
      {
        source: "/about",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
