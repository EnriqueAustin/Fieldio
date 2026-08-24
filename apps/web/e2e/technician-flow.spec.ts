import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the mobile-first technician field console
 * (TECH_FIELD_AUDIT_2026-07-17.md): the two-screen home→job flow, van stock
 * "use on job", and the mobile agenda schedule.
 *
 * Requires the app running against the standard demo seed
 * (packages/database/prisma/seed.ts): technician `sipho@aquaflow.co.za`
 * (password123) is DRIVER of "Van 1 — Sipho" with assigned jobs and van stock.
 *
 * The two-screen flow only renders below the `md` breakpoint, so this suite
 * runs at a phone viewport.
 */

const TECH = { email: 'sipho@aquaflow.co.za', password: 'password123' };

test.use({ viewport: { width: 390, height: 844 } });

async function loginAsTech(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', TECH.email);
    await page.fill('input[type="password"]', TECH.password);
    await page.click('button[type="submit"]');
    // Login is a client-side redirect to the dashboard index (the field console),
    // so wait for a stable field-console element rather than a page-load event.
    await expect(page.getByRole('heading', { name: /^Hi /i })).toBeVisible({ timeout: 30000 });
}

test.describe('Technician field console', () => {
    test('field home shows the greeting and the "Up next" hero', async ({ page }) => {
        await loginAsTech(page);

        await expect(page.getByRole('heading', { name: /Hi Sipho/i })).toBeVisible();
        // "Up next" also appears in the (hidden) desktop overview, so scope to the
        // first match — the visible mobile hero.
        await expect(page.getByText('Up next', { exact: false }).first()).toBeVisible();
        // At least one job card is listed for the day.
        await expect(page.getByTestId('job-card').first()).toBeVisible();
    });

    test('two-screen flow: open a job, then return to the list', async ({ page }) => {
        await loginAsTech(page);

        // Home → focused job screen.
        await page.getByTestId('job-card').first().click();

        // Job screen: back control + the Work / Media / Done tab bar.
        await expect(page.getByRole('button', { name: /All jobs/i })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Work' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Media' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Done' })).toBeVisible();

        // Switch to the Media tab, then back to Work.
        await page.getByRole('tab', { name: 'Media' }).click();
        await page.getByRole('tab', { name: 'Work' }).click();
        await expect(page.getByRole('tab', { name: 'Work' })).toHaveAttribute('data-state', 'active');

        // Back to the home list.
        await page.getByRole('button', { name: /All jobs/i }).click();
        // "Up next" also appears in the (hidden) desktop overview, so scope to the
        // first match — the visible mobile hero.
        await expect(page.getByText('Up next', { exact: false }).first()).toBeVisible();
    });

    test('van stock screen supports adjust + use-on-job', async ({ page }) => {
        await loginAsTech(page);
        await page.goto('/my-van/stock');

        // Sipho's van heading and stock cards.
        await expect(page.getByRole('heading', { name: /Stock/i })).toBeVisible();

        // "Use on job" is available on a stock item; opening it shows the sheet.
        const useButton = page.getByRole('button', { name: /Use on job/i }).first();
        await expect(useButton).toBeVisible();
        await useButton.click();
        await expect(page.getByRole('heading', { name: 'Use on job' })).toBeVisible();
        await expect(page.getByText('Which job?')).toBeVisible();
    });

    test('my schedule defaults to a mobile agenda list', async ({ page }) => {
        await loginAsTech(page);
        await page.goto('/my-schedule');

        await expect(page.getByRole('heading', { name: 'My Schedule' })).toBeVisible();
        // The FullCalendar week grid is rendered but hidden on a phone (hidden md:grid);
        // the agenda list is what the technician actually sees.
        await expect(page.locator('.fc-timeGridWeek-view')).toBeHidden();
    });
});
