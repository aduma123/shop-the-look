# Shop the Look

**Live:** https://shop-the-look.onrender.com

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

## Limits

To protect your API bill, `/api/analyze` allows 10 analyses per visitor per hour and 200 in total per day. Change them with the `RATE_LIMIT_PER_HOUR` and `DAILY_LIMIT` environment variables. The counts reset when the server restarts, so also set a monthly spend limit in the Anthropic Console.

The API key stays on the server. The browser only calls `/api/analyze`.

Each analysis runs several web searches and usually takes 30–90 seconds. Prices come from retailer listings and may change.
