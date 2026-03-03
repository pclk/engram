import { test } from './fixtures/test';

test('auth sign-in page renders', async ({ authPage }) => {
  await authPage.gotoSignIn();
  await authPage.expectLoaded();
});
