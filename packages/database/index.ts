import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Query logging is very noisy and slows dev down; opt in with PRISMA_LOG_QUERIES=1.
const logQueries = process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true';

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: logQueries ? ['query', 'error', 'warn'] : ['error', 'warn'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
