<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your app

Engram is a modal-based study editor and Anki flashcard factory.

## Run Locally

**Prerequisites:**  Node.js

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. (Optional) Configure app environment variables in `.env.local` (for example, `VITE_NEON_SCHEMA` and `VITE_NEON_DATA_API_URL`).
3. Run the app:
   `npm run dev`

## Codex container setup

When you start a fresh Codex container, run:

```bash
./setup.sh
```

This installs Linux Chromium runtime packages (when `apt-get` is available), runs `npm ci`, creates a `.env.local` template if needed, and verifies Puppeteer Chromium library links.

After running it, you can write code, run `npm run dev`, and run `npm run test:e2e`. The only manual step is setting `GEMINI_API_KEY` in `.env.local` when you want real Gemini API calls.

