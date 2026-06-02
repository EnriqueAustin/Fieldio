import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { projectsService } from './projects.service';
import { z } from 'zod';

const createProjectSchema = z.object({
    customerId: z.string().uuid(),
    propertyId: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELED']).optional(),
    budget: z.number().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

export const projectsController = {
    create: async (req: Request, res: Response) => {
        const data = createProjectSchema.parse(req.body);
        const project = await projectsService.create(req.user!.companyId, data);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { project } });
    },

    update: async (req: Request, res: Response) => {
        const data = updateProjectSchema.parse(req.body);
        const project = await projectsService.update(req.params.id, req.user!.companyId, data);
        res.status(StatusCodes.OK).json({ status: 'success', data: { project } });
    },

    getOne: async (req: Request, res: Response) => {
        const project = await projectsService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { project } });
    },

    getAll: async (req: Request, res: Response) => {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const status = req.query.status as string;
        
        const result = await projectsService.getAll(req.user!.companyId, page, limit, status);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    delete: async (req: Request, res: Response) => {
        await projectsService.delete(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    }
};
