import { expect, type Locator, type Page } from '@playwright/test';

export class AuthPage {
  constructor(private readonly page: Page) {}

  async gotoSignIn() {
    await this.page.goto('/auth/sign-in');
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Engram' });
  }

  get signInLink() {
    return this.page.locator('a[href="/auth/sign-in"]');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.signInLink).toBeVisible();
  }
}

export class GuestPage {
  constructor(private readonly page: Page) {}

  get firstConceptText(): Locator {
    return this.page.locator('[data-testid="concept-text-0"]');
  }

  get topicSwitcher(): Locator {
    return this.page.locator('[data-testid="topic-switcher"]');
  }

  async goto() {
    await this.page.goto('/guest');
    await expect(this.firstConceptText).toBeVisible();
  }

  async openTopicSwitcher() {
    await this.page.keyboard.press(' ');
    await this.page.keyboard.press('a');
    await expect(this.topicSwitcher).toBeVisible();
  }

  async createTopicWithKeyboard(title: string) {
    await this.openTopicSwitcher();
    await this.page.keyboard.press('o');
    await this.page.keyboard.type(title);
    await this.page.keyboard.press('Escape');
    await this.page.keyboard.press('Enter');
    await expect(this.topicSwitcher).toBeHidden();
  }

  currentTopicTitle() {
    return this.page.locator('[data-testid="topic-title"]');
  }
}
