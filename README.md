# accvendor-backend

API for [accvendor.com](https://accvendor.com) — a marketplace for digital accounts and
subscriptions. Node + Express + MongoDB, with Socket.io for live order/ticket notifications.

> **No credentials live in this repository.** `.env` is git-ignored; `.env.example` lists every
> variable with placeholder values only. Set the real ones in the Render dashboard.

## Deploying to Render

1. **New → Web Service** and connect this repository (or **New → Blueprint**, which reads
   `render.yaml` and pre-fills everything below).
2. Settings, if you are not using the blueprint:
   - Runtime: **Node**
   - Build command: `npm ci --omit=dev`
   - Start command: `npm start`
   - Health check path: `/api/health`
3. Add the environment variables listed below.
4. In **MongoDB Atlas → Network Access**, allow `0.0.0.0/0` (or add Render's outbound IPs),
   otherwise the service cannot reach the database.
5. Deploy. The service will be live at `https://<name>.onrender.com`; the API is under
   `/api` (e.g. `https://<name>.onrender.com/api/health`).
6. Create the first admin account by running `npm run seed` once from the Render shell.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `PORT` | no | Render sets this automatically |
| `CLIENT_URL` | yes | Storefront origin(s), comma-separated. This is the CORS whitelist. |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB_NAME` | no | Defaults to `accvendor` |
| `JWT_ACCESS_SECRET` | yes | Long random string |
| `JWT_REFRESH_SECRET` | yes | Long random string, different from the access secret |
| `CREDENTIAL_URL_SECRET` | yes | Signs the time-limited credential download links |
| `COOKIE_SAMESITE` | no | Defaults to `none` in production (API and site are on different domains). Set to `lax` only if you serve both from one domain. |
| `SMTP_*`, `EMAIL_FROM` | no | Without these, emails are logged to the console instead of sent |
| `CLOUDINARY_*` | no | Without these, file uploads are disabled (orders still work via transaction ID) |
| `RATE_LIMIT_*` | no | See `.env.example` for the defaults |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | Used by `npm run seed` |

`.env.example` is the full list.

### Cookies and cross-origin auth

Sessions are httpOnly cookies. When the API and the storefront are on different domains the
browser only sends them if they are `SameSite=None; Secure`, which is the production default —
so the storefront **must** be served over HTTPS and must send credentialed requests
(`fetch(..., { credentials: 'include' })`, which the client already does).

## Local development

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # nodemon on http://localhost:5000
npm run seed           # sample catalog + the first admin account
```

## Tests

```bash
npm test
```

Smoke tests boot the app against an in-memory MongoDB, so they need no running services.
`smoke-test-auth-scopes.js` covers the session isolation described below — keep it green.

## Security notes

- **Storefront and admin sessions are separate credentials.** Tokens carry a `scope` claim
  (`site` / `admin`) and live in different cookies. A storefront session — even one belonging
  to an admin account, from the same browser and IP — cannot reach `/api/admin/*`, and an
  admin session cannot act as a customer. Admin authenticates at `/api/admin/auth/*`; there is
  no admin signup.
- Refresh tokens rotate on every use; reusing a rotated token revokes every session for that
  user. `tokenVersion` makes blocks and password changes take effect immediately.
- helmet CSP, `express-mongo-sanitize`, `hpp`, XSS sanitisation, and per-route rate limiting
  are all enabled. Passwords and security answers are bcrypt-hashed.
- Credential files are delivered through signed, time-limited URLs, never public ones.
