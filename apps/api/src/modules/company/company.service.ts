import { prisma } from '@fieldio/database';
import { z } from 'zod';
import { companySettingsSchema, mergeCompanySettings, normalizeCompanySettings } from './company-settings';

const updateCompanySchema = z.object({
    name: z.string().min(2).optional(),
    settings: companySettingsSchema.partial().optional(),
});

export const companyService = {
    getOne: async (companyId: string) => {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company) return null;

        return {
            ...company,
            settings: normalizeCompanySettings(company.settings),
        };
    },

    update: async (companyId: string, input: z.infer<typeof updateCompanySchema>) => {
        const parsed = updateCompanySchema.parse(input);
        const current = await prisma.company.findUnique({
            where: { id: companyId },
            select: { settings: true },
        });

        return prisma.company.update({
            where: { id: companyId },
            data: {
                ...(parsed.name ? { name: parsed.name } : {}),
                ...(parsed.settings
                    ? { settings: mergeCompanySettings(current?.settings, parsed.settings) as any }
                    : {}),
            },
        });
    },

    upsertXeroConnection: async (
        companyId: string,
        input: { tenantId: string; tenantName?: string; enabled?: boolean }
    ) => {
        const tenantId = z.string().min(1).parse(input.tenantId);
        const connection = await prisma.xeroConnection.upsert({
            where: {
                companyId_tenantId: {
                    companyId,
                    tenantId,
                },
            },
            create: {
                companyId,
                tenantId,
                tenantName: input.tenantName,
                status: input.enabled === false ? 'DISCONNECTED' : 'CONNECTED',
            },
            update: {
                tenantName: input.tenantName,
                status: input.enabled === false ? 'DISCONNECTED' : 'CONNECTED',
            },
        });

        const current = await prisma.company.findUnique({
            where: { id: companyId },
            select: { settings: true },
        });
        await prisma.company.update({
            where: { id: companyId },
            data: {
                settings: mergeCompanySettings(current?.settings, {
                    integrations: {
                        xero: {
                            enabled: input.enabled !== false,
                            tenantId,
                            tenantName: input.tenantName,
                            syncContacts: true,
                            syncInvoices: true,
                        },
                    },
                } as any) as any,
            },
        });

        return connection;
    },

    getXeroConnections: async (companyId: string) => {
        return prisma.xeroConnection.findMany({
            where: { companyId },
            orderBy: { updatedAt: 'desc' },
        });
    },
};
