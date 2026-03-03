import fs from 'node:fs/promises';
import path from 'node:path';

const TMP_DIR = path.join(process.cwd(), 'tests/e2e/.tmp');

async function globalTeardown() {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
}

export default globalTeardown;
