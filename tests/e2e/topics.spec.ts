import { test, expect } from './fixtures/test';

test('can create a guest topic via keyboard controls', async ({ guestPage }) => {
  const topicTitle = process.env.E2E_TOPIC_TITLE ?? 'E2E Topic';

  await guestPage.goto();
  await guestPage.createTopicWithKeyboard(topicTitle);

  await expect(guestPage.currentTopicTitle()).toHaveText(topicTitle);
});
