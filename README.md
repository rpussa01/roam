# ROAM — Live Google Places Edition

Swipe through **real Google Places results**, save places to a wishlist, and build a simple itinerary. This replaces the fictional demo dataset.

## Run on your Mac

1. Install Node.js 20+.
2. Extract the ZIP and open Terminal in the `ROAM-Places` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local` (`cp .env.example .env.local`).
5. Open `.env.local` and replace `PASTE_YOUR_KEY_HERE` with your own **Google Places API (New)** key. **Never share your key or commit this file.**
6. Run `npm run dev`.
7. Open **http://localhost:5173** (the Vite URL printed in Terminal).

The backend runs on port 3001 and securely calls Places API (New); Vite proxies `/api` to it. Your API key is never intentionally included in browser JavaScript. If you edit `.env.local`, restart `npm run dev`.

## Supported cities
Bangkok, Bali, Tokyo, Melbourne, Perth, Singapore, London and New York.

## API endpoints
- `GET /api/health` checks key configuration (never exposes the key).
- `GET /api/places?city=Bangkok&category=Nightlife` uses Google Places Nearby Search (New).
- `GET /api/photo?name=places%2F...%2Fphotos%2F...` proxies Place Photos (New).

## Google Cloud setup
Enable **Places API (New)** and link billing. Restrict your API key to Places API (New). For local development, keep the key server-side and configure appropriate application restrictions before production. Set Google Cloud quotas and billing alerts. API requests and photos may incur charges. The requested field mask includes ratings, hours and photos, which may increase billing tier.

## Important notes
- Google Places may return fewer than 20 venues for a city/category. No fictional fallbacks are displayed.
- The saved list is stored in browser localStorage, not synced across devices.
- Google Maps Platform terms limit caching/storage of Places content, images and attribution. This prototype stores venue details locally; **review and adjust persistence, attribution and photo attribution before production**. Google Place IDs can generally be stored longer-term subject to Google's terms.
- The itinerary is a simple sequential list, not AI routing or verified opening-hour scheduling.
- `npm run build` creates `dist`; `npm start` serves it through Express on port 3001. Set `GOOGLE_PLACES_API_KEY` in the production environment.
- No user login, booking, payment or event feeds yet.
