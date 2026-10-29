/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  logging: {
    incomingRequests: {
      ignore: [
        /^\/accept-invitation(?:\?|$)/,
        /^\/reset-password(?:\?|$)/,
        /^\/api\/auth\/(?:verify-email|reset-password)(?:\/|\?|$)/,
      ],
    },
  },
};

export default nextConfig;
