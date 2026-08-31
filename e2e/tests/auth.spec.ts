import { expect, test } from '@playwright/test';

const PASSWORD = 'password123';

test.describe('login', () => {
  test('rejects an invalid password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@sunrise.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert').last()).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('admin logs in and sees admin-only navigation', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@sunrise.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    const nav = page.getByRole('navigation', { name: 'Dashboard sections' });
    await expect(nav.getByRole('button', { name: 'Manage Finance' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Other Charges' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('owner logs in and sees resident-only navigation, not admin pages', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('alice@sunrise.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    const nav = page.getByRole('navigation', { name: 'Dashboard sections' });
    await expect(nav.getByRole('link', { name: 'My Details' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Manage Finance' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
