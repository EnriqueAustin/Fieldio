import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { prisma } from '@fieldio/database';
import { requireUser, restrictTo } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { catchAsync } from '../utils/catchAsync';

export const branchesRouter = Router();
branchesRouter.use(requireUser);

// Whitelist the writable fields — never let companyId (or any other key) through
// from the body, which would move a branch between tenants.
const createBranchSchema = z.object({
    name: z.string().min(1),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    active: z.boolean().optional(),
});
const updateBranchSchema = createBranchSchema.partial();

branchesRouter.get('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(async (req: Request, res: Response) => {
    const branches = await prisma.branch.findMany({
        where: { companyId: req.user!.companyId, active: true },
        orderBy: { name: 'asc' },
    });
    res.status(StatusCodes.OK).json({ status: 'success', data: { branches } });
}));

branchesRouter.post('/', restrictTo('ADMIN'), catchAsync(async (req: Request, res: Response) => {
    const data = createBranchSchema.parse(req.body);
    const branch = await prisma.branch.create({
        data: { companyId: req.user!.companyId, ...data },
    });
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { branch } });
}));

branchesRouter.patch('/:id', restrictTo('ADMIN'), catchAsync(async (req: Request, res: Response) => {
    const data = updateBranchSchema.parse(req.body);
    // Scope by companyId so one tenant cannot edit another's branch.
    const existing = await prisma.branch.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) throw new AppError('Branch not found', StatusCodes.NOT_FOUND);
    const branch = await prisma.branch.update({
        where: { id: req.params.id },
        data,
    });
    res.status(StatusCodes.OK).json({ status: 'success', data: { branch } });
}));

branchesRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(async (req: Request, res: Response) => {
    const existing = await prisma.branch.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) throw new AppError('Branch not found', StatusCodes.NOT_FOUND);
    await prisma.branch.update({ where: { id: req.params.id }, data: { active: false } });
    res.status(StatusCodes.OK).json({ status: 'success' });
}));
