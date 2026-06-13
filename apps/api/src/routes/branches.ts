import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@fieldio/database';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const branchesRouter = Router();
branchesRouter.use(requireUser);

branchesRouter.get('/', catchAsync(async (req: Request, res: Response) => {
    const branches = await prisma.branch.findMany({
        where: { companyId: req.user!.companyId, active: true },
        orderBy: { name: 'asc' },
    });
    res.status(StatusCodes.OK).json({ status: 'success', data: { branches } });
}));

branchesRouter.post('/', restrictTo('ADMIN'), catchAsync(async (req: Request, res: Response) => {
    const branch = await prisma.branch.create({
        data: { companyId: req.user!.companyId, ...req.body },
    });
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { branch } });
}));

branchesRouter.patch('/:id', restrictTo('ADMIN'), catchAsync(async (req: Request, res: Response) => {
    const branch = await prisma.branch.update({
        where: { id: req.params.id },
        data: req.body,
    });
    res.status(StatusCodes.OK).json({ status: 'success', data: { branch } });
}));

branchesRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(async (req: Request, res: Response) => {
    await prisma.branch.update({ where: { id: req.params.id }, data: { active: false } });
    res.status(StatusCodes.OK).json({ status: 'success' });
}));
