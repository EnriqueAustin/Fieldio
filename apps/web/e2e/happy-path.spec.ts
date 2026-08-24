import { test, expect } from '@playwright/test';

/**
 * Office/admin happy path against the standard demo seed
 * (packages/database/prisma/seed.ts): admin `admin@aquaflow.co.za` /
 * password123. Login redirects to the dashboard index (`/`).
 */
const ADMIN = { email: 'admin@aquaflow.co.za', password: 'password123' };

test.describe('Office happy path', () => {
    test('logs in and lands on the dashboard', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', ADMIN.email);
        await page.fill('input[type="password"]', ADMIN.password);
        await page.click('button[type="submit"]');

        await expect(page).toHaveURL('/');
        await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    });

    test('navigates to the jobs list', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', ADMIN.email);
        await page.fill('input[type="password"]', ADMIN.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/');

        await page.goto('/jobs');
        await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
    });
});
