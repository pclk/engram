import fs from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

const TMP_DIR = path.join(process.cwd(), 'tests/e2e/.tmp');
const DATA_FILE = path.join(TMP_DIR, 'seed.json');

async function globalSetup(_config: FullConfig) {
  await fs.mkdir(TMP_DIR, { recursive: true });

  const seed = {
    topicTitle: `E2E Topic ${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2));
  process.env.E2E_TOPIC_TITLE = seed.topicTitle;
  process.env.E2E_SEED_FILE = DATA_FILE;
}

export default globalSetup;
