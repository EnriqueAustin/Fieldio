import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { projectsService } from './projects.service';
import { z } from 'zod';

// Project.customerId and propertyId are NOT NULL in the database, so a project
// must name both. An empty string (the dialog's unset picker) gets a clear 400
// instead of reaching the insert and failing there.
const requiredId = (label: string) =>
    z.string({ required_error: `Choose a ${label} for the project` })
        .min(1, `Choose a ${label} for the project`)
        .uuid(`Invalid ${label}`);

// `companyId` is deliberately absent: it comes from the authenticated user, never
// the body, so a project can't be moved between tenants. Unknown keys are stripped
// by zod, so a stray `companyId` in the payload is ignored.
const baseProjectSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELED']).optional(),
    budget: z.number().nonnegative().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

const createProjectSchema = baseProjectSchema.extend({
    customerId: requiredId('customer'),
    propertyId: requiredId('site'),
});

const updateProjectSchema = baseProjectSchema.partial().extend({
    customerId: requiredId('customer').optional(),
    propertyId: requiredId('site').optional(),
});

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

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
