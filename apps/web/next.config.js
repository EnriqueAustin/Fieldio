/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@fieldio/ui', '@fieldio/database'],
    experimental: {
        serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
    },
};

module.exports = nextConfig;
