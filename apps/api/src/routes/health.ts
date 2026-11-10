import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@fieldio/database';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
    res.status(StatusCodes.OK).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'api'
    });
});

healthRouter.get('/db', async (req, res, next) => {
    try {
        // Public endpoint: prove the DB answers without leaking any (cross-tenant) data.
        await prisma.$queryRaw`SELECT 1`;
        res.status(StatusCodes.OK).json({ status: 'ok', db: 'ok' });
    } catch (err) {
        next(err);
    }
});
