/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma needs to be treated as external on the server bundle
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
    // New Visit photos/voice notes are sent to the submit server action as
    // (compressed) data URLs, so allow a larger action body than the 1MB default.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
