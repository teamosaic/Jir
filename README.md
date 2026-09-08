# Contentstack Custom App: Event Card Auto-Unpublish

This project provides a private Stack App starter for Contentstack with:
- Environment selection
- Dry Run
- Real Run (unpublish)
- CSV download of results

## Project Structure

- `server/index.js`: Backend APIs that call Contentstack CMA
- `web/index.html`: Embedded UI for Contentstack portal (Full Page location)
- `web/app.js`: UI logic
- `web/styles.css`: UI styles

## 1) Local Setup

1. Copy `.env.example` to `.env`
2. Set these values in `.env`:
   - `API_KEY`
   - `MANAGEMENT_TOKEN`
   - `BASE_URL` (for your region)
   - `BRANCH=main`
   - `LOCALE=en-us`
3. Install and run:

```bash
npm install
npm start
```

Server starts at `http://localhost:7071`.

## 2) APIs Used by UI

- `GET /api/environments?branch=main`
- `POST /api/dry-run`
- `POST /api/execute`

## 3) Configure in Contentstack Developer Hub

1. Go to Developer Hub and create a **Stack App**.
2. In **UI Locations**, add **Full Page Location**.
3. Set the URL to your hosted app URL (for example `https://your-domain.com/`).
4. Save and install app to your stack.

## 4) Required App Permissions / Scopes

At minimum, configure scopes needed to:
- Read environments
- Read entries
- Unpublish entries

If you switch to OAuth tokens later, use least-privilege scopes only.

## 5) Production Notes

- Do not expose Management Token in frontend code.
- Keep token in backend environment variables only.
- Put auth in front of backend endpoints if hosted publicly.
- Optionally set `ALLOWED_ENVIRONMENTS` in `.env` to limit where unpublish can run.

## 6) Scheduler

Automatic daily run should be done by backend scheduler (cron/Cloud Scheduler/Task Scheduler), not by browser UI.

You already have `auto_unpublish_old_event_cards.py` for scheduler-driven automation.

## 7) Ready for GitHub

This folder is ready to upload to a GitHub repository.

Pre-push checklist:
- Keep secrets only in `.env` (already ignored by `.gitignore`)
- Commit `.env.example` (safe template)
- Do not commit `node_modules`

Suggested commands:

```bash
cd contentstack-custom-app
git init
git add .
git commit -m "Initial Contentstack custom app for event auto-unpublish"
git branch -M main
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

If your repo already exists, skip `git init` and only run `git add`, `git commit`, and `git push`.
# Jir
