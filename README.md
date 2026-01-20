<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1YBfgJPdzJ5U0VfmQPjv4CbvPmpjX_9aR

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your Gemini API key:
   - The repository includes a `.env.local` template file
   - Open `.env.local` and replace `your-api-key-here` with your actual Gemini API key
   - Get your API key from: https://ai.google.dev/

3. Run the app:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`
