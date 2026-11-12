import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import type { CreateProjectInput, UpdateProjectInput } from './projects.controller';

/**
 * Confirm a customer / property id belongs to the caller's company before it is
 * written onto a project. Without this a project could be linked to another
 * tenant's customer. Absent ids (the dialog sends none yet) are left alone.
 */
async function assertCompanyFks(companyId: string, data: { customerId?: string; propertyId?: string }) {
    if (data.customerId) {
        const customer = await prisma.customer.findFirst({
            where: { id: data.customerId, companyId, deletedAt: null },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
    }
    if (data.propertyId) {
        const property = await prisma.property.findFirst({
            where: { id: data.propertyId, companyId },
        });
        if (!property) throw new AppError('Property not found', StatusCodes.NOT_FOUND);
    }
}

export const projectsService = {
    // `data` is the validated controller payload — never the raw request body, so
    // no unexpected column (status it shouldn't set, companyId, etc.) can slip in.
    create: async (companyId: string, data: CreateProjectInput) => {
        await assertCompanyFks(companyId, data);

        return await prisma.project.create({
            data: {
                companyId,
                name: data.name,
                description: data.description,
                status: data.status,
                budget: data.budget,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
                // The New Project dialog has no picker yet, so these arrive absent;
                // stored as null until a customer/property is linked.
                customerId: data.customerId ?? null,
                propertyId: data.propertyId ?? null,
            } as any,
        });
    },

    update: async (id: string, companyId: string, data: UpdateProjectInput) => {
        const project = await prisma.project.findFirst({ where: { id, companyId } });
        if (!project) throw new AppError('Project not found', StatusCodes.NOT_FOUND);

        await assertCompanyFks(companyId, data);

        // Explicit field map — the raw body is never spread, so companyId and any
        // other stray key cannot move the project between tenants.
        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.budget !== undefined) updateData.budget = data.budget;
        if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
        if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
        if (data.customerId !== undefined) updateData.customerId = data.customerId;
        if (data.propertyId !== undefined) updateData.propertyId = data.propertyId;

        return await prisma.project.update({
            where: { id },
            data: updateData,
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
