import { prisma } from '@fieldio/database';
import { z } from 'zod';
import { mergeCompanySettings, normalizeCompanySettings } from '../company/company-settings';
import {
    NOTIFICATION_CHANNELS,
    NOTIFICATION_EVENTS,
    type NotificationSettings,
} from './notification-templates';

const updateTemplateSchema = z.object({
    enabled: z.boolean(),
    channel: z.enum(NOTIFICATION_CHANNELS),
    subject: z.string().max(200).optional().default(''),
    body: z.string().max(2000),
});

export const updateNotificationSettingsSchema = z.object({
    enabled: z.boolean(),
    templates: z.object(
        NOTIFICATION_EVENTS.reduce(
            (acc, event) => {
                acc[event] = updateTemplateSchema;
                return acc;
            },
            {} as Record<(typeof NOTIFICATION_EVENTS)[number], typeof updateTemplateSchema>
        )
    ),
});

export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;

export const notificationTemplatesService = {
    /** Current notification settings for a company, defaults filled in. */
    get: async (companyId: string): Promise<NotificationSettings> => {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { settings: true },
        });
        return normalizeCompanySettings(company?.settings).notifications;
    },

    /** Validate and persist the templates onto company settings, returning the normalized result. */
    update: async (
        companyId: string,
        input: UpdateNotificationSettingsInput
    ): Promise<NotificationSettings> => {
        const parsed = updateNotificationSettingsSchema.parse(input);
        const current = await prisma.company.findUnique({
            where: { id: companyId },
            select: { settings: true },
        });

        const merged = mergeCompanySettings(current?.settings, { notifications: parsed } as any);

        await prisma.company.update({
            where: { id: companyId },
            data: { settings: merged as any },
        });

        return merged.notifications;
    },
};
