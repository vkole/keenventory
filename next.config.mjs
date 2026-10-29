/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir:
    process.env.KEENVENTORY_UI_TEST === "true"
      ? ".next-invitation-test"
      : ".next",
  reactStrictMode: true,
  typedRoutes: false,
  serverExternalPackages: ["pdfkit", "pdfjs-dist", "exceljs"],
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
