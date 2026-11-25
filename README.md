# Shop the Look

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

The API key stays on the server. The browser only calls `/api/analyze`.

Each analysis runs several web searches and usually takes 30–90 seconds. Prices come from retailer listings and may change.
