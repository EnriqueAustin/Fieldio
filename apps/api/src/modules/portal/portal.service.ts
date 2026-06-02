import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { config } from '../../config/env';

export const portalService = {
    generatePortalLink: async (customerId: string, companyId: string) => {
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId, deletedAt: null },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await prisma.customerPortalToken.create({
            data: { companyId, customerId, token, expiresAt },
        });

        return { url: `${config.WEB_URL}/portal/${token}`, token, expiresAt };
    },

    validateToken: async (token: string) => {
        const record = await prisma.customerPortalToken.findUnique({
            where: { token },
            include: { customer: true },
        });

        if (!record) throw new AppError('Invalid portal link', StatusCodes.NOT_FOUND);
        if (record.expiresAt < new Date()) throw new AppError('Portal link expired', StatusCodes.GONE);

        return { customerId: record.customerId, companyId: record.companyId, customer: record.customer };
    },

    getPortalDashboard: async (token: string) => {
        const { customerId, companyId, customer } = await portalService.validateToken(token);

        const [jobs, estimates, invoices] = await Promise.all([
            prisma.job.findMany({
                where: { customerId, companyId, deletedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: 20,
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    scheduledStart: true,
                    actualStart: true,
                    actualEnd: true,
                    createdAt: true,
                    property: { select: { addressLine1: true, city: true } },
                    tech: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.estimate.findMany({
                where: { customerId, companyId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    status: true,
                    total: true,
                    validUntil: true,
                    createdAt: true,
                    items: true,
                },
            }),
            prisma.invoice.findMany({
                where: { job: { customerId, companyId }, deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    invoiceNumber: true,
                    status: true,
                    total: true,
                    balance: true,
                    dueDate: true,
                    paidAt: true,
                    publicToken: true,
                    createdAt: true,
                },
            }),
        ]);

        return {
            customer: {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
            },
            jobs,
            estimates,
            invoices,
        };
    },

    getPortalJobDetail: async (token: string, jobId: string) => {
        const { customerId, companyId } = await portalService.validateToken(token);

        const job = await prisma.job.findFirst({
            where: { id: jobId, customerId, companyId, deletedAt: null },
            include: {
                property: { select: { addressLine1: true, addressLine2: true, city: true, state: true, zip: true } },
                tech: { select: { firstName: true, lastName: true } },
                lineItems: true,
                photos: { select: { url: true, thumbnailUrl: true, caption: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
                invoice: { select: { id: true, invoiceNumber: true, status: true, total: true, balance: true, publicToken: true } },
            },
        });

        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        return job;
    },

    approveEstimateViaPortal: async (token: string, estimateId: string, signerName: string, signatureUrl: string) => {
        const { customerId, companyId } = await portalService.validateToken(token);

        const estimate = await prisma.estimate.findFirst({
            where: { id: estimateId, customerId, companyId },
        });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (estimate.status !== 'SENT') {
            throw new AppError('Estimate cannot be approved', StatusCodes.BAD_REQUEST);
        }

        return prisma.estimate.update({
            where: { id: estimateId },
            data: {
                status: 'APPROVED',
                signerName,
                signatureUrl,
                signedAt: new Date(),
                approvedAt: new Date(),
            },
        });
    },
};
