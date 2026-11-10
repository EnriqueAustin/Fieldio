import { beforeEach, describe, expect, it, vi } from 'vitest';

// The service reads/writes the company through Prisma. We don't need the full
// fake DB here — a tiny in-memory company store is enough to prove that a
// settings PATCH round-trips the modules map and the invoice prefix.
const store = vi.hoisted(() => ({ company: null as any }));

vi.mock('@fieldio/database', () => ({
    prisma: {
        company: {
            findUnique: vi.fn(async ({ select }: any) => {
                if (!store.company) return null;
                if (select?.settings) return { settings: store.company.settings };
                return store.company;
            }),
            update: vi.fn(async ({ data }: any) => {
                store.company = { ...store.company, ...data };
                return store.company;
            }),
        },
    },
}));

import { companyService } from '../src/modules/company/company.service';
import { defaultCompanySettings, normalizeCompanySettings } from '../src/modules/company/company-settings';

describe('normalizeCompanySettings — modules', () => {
    it('fills every module default when none are provided', () => {
        const settings = normalizeCompanySettings({});
        expect(settings.modules).toEqual(defaultCompanySettings.modules);
        // Spot-check the intended ON-by-default set.
        expect(settings.modules.inbox).toBe(true);
        expect(settings.modules.bookings).toBe(true);
        expect(settings.modules.inventory).toBe(true);
        expect(settings.modules.suppliers).toBe(true);
        expect(settings.modules.statements).toBe(true);
        expect(settings.modules.creditNotes).toBe(true);
        expect(settings.modules.kpi).toBe(true);
        // ...and a few of the OFF-by-default set.
        expect(settings.modules.leads).toBe(false);
        expect(settings.modules.projects).toBe(false);
        expect(settings.modules.financing).toBe(false);
    });

    it('merges a partial modules map onto the defaults', () => {
        const settings = normalizeCompanySettings({ modules: { leads: true, inbox: false } });
        expect(settings.modules.leads).toBe(true);
        expect(settings.modules.inbox).toBe(false);
        // Keys that were not provided keep their defaults.
        expect(settings.modules.suppliers).toBe(true);
        expect(settings.modules.projects).toBe(false);
    });
});

describe('normalizeCompanySettings — invoicePrefix', () => {
    it('defaults to INV when missing', () => {
        expect(normalizeCompanySettings({}).billing.invoicePrefix).toBe('INV');
    });

    it('keeps a valid prefix', () => {
        expect(normalizeCompanySettings({ billing: { invoicePrefix: 'MTH' } }).billing.invoicePrefix).toBe('MTH');
    });

    it('falls back to the default when the prefix is invalid', () => {
        expect(normalizeCompanySettings({ billing: { invoicePrefix: 'bad prefix!' } }).billing.invoicePrefix).toBe('INV');
        expect(normalizeCompanySettings({ billing: { invoicePrefix: '' } }).billing.invoicePrefix).toBe('INV');
        expect(normalizeCompanySettings({ billing: { invoicePrefix: 'TOOLONGPREFIX' } }).billing.invoicePrefix).toBe('INV');
    });
});

describe('companyService.update — settings PATCH round-trip', () => {
    beforeEach(() => {
        store.company = { id: 'company_1', name: 'Mthembu Plumbing', settings: {} };
    });

    it('persists a modules change and leaves untouched modules at their defaults', async () => {
        const updated = await companyService.update('company_1', {
            settings: { modules: { projects: true, inbox: false } },
        } as any);

        const settings = normalizeCompanySettings(updated.settings);
        expect(settings.modules.projects).toBe(true);
        expect(settings.modules.inbox).toBe(false);
        // Defaults for everything else survive the merge.
        expect(settings.modules.suppliers).toBe(true);
        expect(settings.modules.kpi).toBe(true);
        expect(settings.modules.leads).toBe(false);
    });

    it('round-trips the full modules map a PATCH sends', async () => {
        // The company form submits every toggle's current state, so a PATCH
        // carries the whole map rather than a single changed key.
        const base = normalizeCompanySettings({}).modules;
        await companyService.update('company_1', { settings: { modules: { ...base, projects: true } } } as any);
        const updated = await companyService.update('company_1', {
            settings: { modules: { ...base, projects: true, leads: true } },
        } as any);

        const settings = normalizeCompanySettings(updated.settings);
        expect(settings.modules.projects).toBe(true);
        expect(settings.modules.leads).toBe(true);
    });

    it('persists a valid invoice prefix', async () => {
        const updated = await companyService.update('company_1', {
            settings: { billing: { invoicePrefix: 'MTH' } },
        } as any);
        expect(normalizeCompanySettings(updated.settings).billing.invoicePrefix).toBe('MTH');
    });

    it('rejects an invalid invoice prefix', async () => {
        await expect(
            companyService.update('company_1', { settings: { billing: { invoicePrefix: 'bad prefix!' } } } as any)
        ).rejects.toThrow();
    });
});
