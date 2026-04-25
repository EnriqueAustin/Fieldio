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
        const userCount = await prisma.user.count();
        res.status(StatusCodes.OK).json({
            status: 'ok',
            db: 'connected',
            userCount
        });
    } catch (err) {
        next(err);
    }
});
