# Shop the Look

**Live:** https://shopthelook-app.onrender.com

Upload an inspiration photo or a picture of someone wearing an outfit. The app lists every visible item with a price, the retailer and a link to buy it.

It sends the photo to Claude, which identifies each piece and searches the web for the exact product, or a close match when the brand can't be identified.

## Setup

```bash
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
```

## Run

```bash
npm run dev      # development, http://localhost:5173
npm run build    # type-check and build to dist/
npm start        # production server on PORT (default 3000)
```

## Deploy (Render, free)

The frontend and backend can run as two Render services. The frontend is a static site, so it loads instantly and never sleeps. When any page opens, it pings the backend's `/health` route so the backend is usually awake by the time someone uploads.

**Backend: Web Service**
- Build: `npm ci && npm run build` · Start: `npm start`
- Env: `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS=<frontend URL>`, `FRONTEND_URL=<frontend URL>` (redirects page visits to the static site)

**Frontend: Static Site**
- Build: `npm ci && npx vite build` · Publish directory: `dist`
- Env: `VITE_API_URL=<backend URL>`

Leave `VITE_API_URL` unset to serve the frontend from the backend on one service instead.

## Limits

To protect your API bill, `/api/analyze` allows 10 analyses per visitor per hour and 200 in total per day. Change them with the `RATE_LIMIT_PER_HOUR` and `DAILY_LIMIT` environment variables. The counts reset when the server restarts, so also set a monthly spend limit in the Anthropic Console.

The API key stays on the server. The browser only calls `/api/analyze`.

Each analysis runs several web searches and usually takes 30–90 seconds. Prices come from retailer listings and may change.
