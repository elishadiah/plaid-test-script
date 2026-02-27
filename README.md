# Plaid Link callback simulator

Minimal Node.js script that simulates handling a Plaid Link redirect callback from Chase (OAuth). No frameworks; uses built-in `http` locally and serverless on Vercel.

## Local run

```bash
node plaid-test.js
```

Server listens on http://localhost:4000 (or `PORT` env). See comments at the top of `plaid-test.js` for example query strings.

## Deploy to Vercel

1. Install the Vercel CLI (once):  
   `npm i -g vercel`

2. From the project root:
   ```bash
   vercel
   ```
   Follow the prompts (link to an existing project or create a new one).

3. Deploy to production:
   ```bash
   vercel --prod
   ```

### Vercel endpoints

After deployment you get:

- **Callback:** `GET https://<your-app>.vercel.app/api/plaid/callback?oauth_state_id=...&redirect_uri=...&status=...&nonce=...`
- **Logs:** `GET https://<your-app>.vercel.app/api/logs`

Same query params and behavior as local (success, `INCORRECT_OAUTH_NONCE`, `CHASE_DELAYED_APPROVAL`, invalid state, etc.). The in-memory log is per serverless instance and may reset between cold starts.

### Project layout for Vercel

- `api/index.js` – serverless handler for both `/api/plaid/callback` and `/api/logs`
- `vercel.json` – rewrites so those paths are handled by the same function (shared log)
