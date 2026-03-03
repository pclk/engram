import { test as base } from '@playwright/test';
import { AuthPage, GuestPage } from './pages';

type Fixtures = {
  authPage: AuthPage;
  guestPage: GuestPage;
};

export const test = base.extend<Fixtures>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  guestPage: async ({ page }, use) => {
    await use(new GuestPage(page));
  },
});

export { expect } from '@playwright/test';
