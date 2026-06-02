import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';

export const projectsService = {
    create: async (companyId: string, data: any) => {
        return await prisma.project.create({
            data: {
                ...data,
                companyId,
            },
        });
    },

    update: async (id: string, companyId: string, data: any) => {
        const project = await prisma.project.findFirst({ where: { id, companyId } });
        if (!project) throw new AppError('Project not found', StatusCodes.NOT_FOUND);

        return await prisma.project.update({
            where: { id },
            data,
        });
    },

    getOne: async (id: string, companyId: string) => {
        const project = await prisma.project.findFirst({
            where: { id, companyId },
            include: {
                customer: true,
                property: true,
                jobs: true,
                estimates: true,
                invoices: true,
            },
        });
        if (!project) throw new AppError('Project not found', StatusCodes.NOT_FOUND);
        return project;
    },

    getAll: async (companyId: string, page: number = 1, limit: number = 20, status?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId };
        if (status) where.status = status;

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { customer: true, property: true }
            }),
            prisma.project.count({ where })
        ]);

        return {
            projects,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    delete: async (id: string, companyId: string) => {
        const project = await prisma.project.findFirst({ where: { id, companyId } });
        if (!project) throw new AppError('Project not found', StatusCodes.NOT_FOUND);
        
        return await prisma.project.update({
            where: { id },
            data: { status: 'CANCELED' }
        });
    }
};
