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

test.describe('Technician app shell on a phone', () => {
    test('the account sheet is the way out: identity, settings, and sign out', async ({ page }) => {
        await loginAsTech(page);

        // The sidebar that carries "Log out" is hidden below md — before the
        // account sheet existed there was no way to sign out on a phone at all.
        await expect(page.locator('aside')).toBeHidden();

        await page.getByRole('button', { name: 'Account menu' }).click();

        const sheet = page.getByRole('dialog', { name: 'Account' });
        await expect(sheet).toBeVisible();
        // Named, not an email prefix.
        await expect(sheet.getByText('Sipho Ndaba')).toBeVisible();
        // Nav items that don't fit the bottom bar are reachable here.
        await expect(sheet.getByRole('link', { name: 'My Account' })).toBeVisible();

        await sheet.getByRole('button', { name: 'Log out' }).click();
        await expect(page).toHaveURL(/\/login/);
    });

    test('bottom bar exposes the clock and reserves exactly its own height', async ({ page }) => {
        await loginAsTech(page);

        const bar = page.locator('.mobile-nav-bar');
        await expect(bar).toBeVisible();
        await expect(bar.getByRole('link', { name: 'Hours' })).toBeVisible();

        // Content must reserve the bar's height, or the last row of every page
        // sits underneath it.
        const barHeight = await bar.evaluate((el) => el.getBoundingClientRect().height);
        const reserved = await page.evaluate(() =>
            parseFloat(
                getComputedStyle(document.querySelector('main')!.parentElement!).paddingBottom
            )
        );
        expect(reserved).toBeCloseTo(barHeight, 0);
    });
});

test.describe('Technician hours are derived, not entered', () => {
    test('the hours screen reports; it does not ask the technician to log', async ({ page }) => {
        await loginAsTech(page);
        await page.goto('/time-tracking');

        await expect(page.getByRole('heading', { name: 'My hours' })).toBeVisible();
        await expect(page.getByText(/Counted automatically from your jobs/i)).toBeVisible();

        // The whole point of the change: nothing here to fill in or press.
        await expect(page.locator('#start-wrench-btn')).toHaveCount(0);
        await expect(page.locator('#start-travel-btn')).toHaveCount(0);
        await expect(page.locator('#stop-timer-btn')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Start$/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Delete entry/i })).toHaveCount(0);

        // Totals the system worked out are shown instead.
        await expect(page.getByText('Today', { exact: true })).toBeVisible();
        await expect(page.getByText('This week', { exact: true })).toBeVisible();
        await expect(page.getByText('Today by job')).toBeVisible();
    });

    test('starting a route puts the technician on the clock without them logging it', async ({ page }) => {
        await loginAsTech(page);

        // Pick a job that hasn't been started. An already-on-site job's only
        // remaining action is "Complete job", which is gated on the checklist.
        await page.getByTestId('job-card').filter({ hasText: 'Assigned' }).first().click();
        await expect(page.getByRole('button', { name: /All jobs/i })).toBeVisible();

        const action = page.getByRole('button', { name: /Start route|Arrive on site/ }).first();
        const label = await action.textContent();
        await action.click();

        // The clock is now running, driven purely by that status change.
        await page.goto('/time-tracking');
        const expected = /Start route/i.test(label ?? '') ? /Driving to/i : /Working at/i;
        await expect(page.getByText(expected)).toBeVisible({ timeout: 15000 });
    });
});
