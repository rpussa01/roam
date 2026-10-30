import express from "express";
import "dotenv/config";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load local environment variables.
// On Vercel, use environment variables configured in the dashboard.
if (!process.env.VERCEL) {
  config({ path: ".env.local" });
}

const app = express();
const PORT = Number(process.env.PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const cities = {
  Bangkok: { lat: 13.7563, lng: 100.5018 },
  Bali: { lat: -8.65, lng: 115.2167 },
  Tokyo: { lat: 35.6762, lng: 139.6503 },
  Melbourne: { lat: -37.8136, lng: 144.9631 },
  Perth: { lat: -31.9523, lng: 115.8613 },
  Singapore: { lat: 1.3521, lng: 103.8198 },
  London: { lat: 51.5074, lng: -0.1278 },
  "New York": { lat: 40.7128, lng: -74.006 },
};

const types = {
  All: [
    "tourist_attraction",
    "restaurant",
    "cafe",
    "night_club",
    "bar",
    "museum",
    "park",
  ],
  Nightlife: ["night_club", "bar"],
  Cafés: ["cafe"],
  Food: ["restaurant"],
  Attractions: ["tourist_attraction", "museum", "park"],
  Experiences: ["tourist_attraction", "amusement_park"],
  Stays: ["lodging"],
};

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function sendError(res, status, message) {
  return res.status(status).json({
    error: message,
  });
}

function getApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim();
}

function isConfigured() {
  const key = getApiKey();

  return Boolean(
    key &&
    key !== "PASTE_YOUR_KEY_HERE" &&
    key !== "YOUR_API_KEY"
  );
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  return res.json({
    status: "ok",
    configured: isConfigured(),
    environment: process.env.VERCEL ? "production" : "local",
    cities: Object.keys(cities),
    categories: Object.keys(types),
  });
});

// --------------------------------------------------
// GOOGLE PLACES SEARCH
// --------------------------------------------------

app.get("/api/places", async (req, res) => {
  const city = String(req.query.city || "Bangkok");
  const category = String(req.query.category || "All");

  if (!cities[city]) {
    return sendError(res, 400, "Invalid city");
  }

  if (!types[category]) {
    return sendError(res, 400, "Invalid category");
  }

  if (!isConfigured()) {
    return sendError(
      res,
      503,
      "Google Places API key is missing. Configure GOOGLE_PLACES_API_KEY."
    );
  }

  try {
    const location = cities[city];

    const requestBody = {
      includedTypes: types[category],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: {
          center: {
            latitude: location.lat,
            longitude: location.lng,
          },
          radius: city === "Bali" ? 18000 : 12000,
        },
      },
    };

    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": getApiKey(),
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.photos",
            "places.primaryType",
            "places.googleMapsUri",
            "places.websiteUri",
            "places.currentOpeningHours.openNow",
          ].join(","),
        },
        body: JSON.stringify(requestBody),
      }
    );

    const rawResponse = await response.text();

    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      console.error(
        "Google Places returned invalid JSON:",
        rawResponse.slice(0, 500)
      );

      return sendError(
        res,
        502,
        "Google Places returned an invalid response."
      );
    }

    if (!response.ok) {
      console.error("Google Places API error:", data);

      return sendError(
        res,
        response.status,
        data.error?.message || "Google Places request failed."
      );
    }

    const places = (data.places || []).map((place) => ({
      id: place.id,
      city,
      name: place.displayName?.text || "Unnamed place",
      category,
      description: place.formattedAddress || "",
      rating: place.rating ?? null,
      reviews: place.userRatingCount ?? null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      photo: place.photos?.[0]?.name || null,
      googleMapsUri: place.googleMapsUri || null,
      websiteUri: place.websiteUri || null,
      openNow: place.currentOpeningHours?.openNow ?? null,
      primaryType: place.primaryType || null,
    }));

    res.setHeader("Cache-Control", "private, max-age=120");

    return res.json({
      places,
      city,
      category,
      attribution: "Place information provided by Google Maps",
    });
  } catch (error) {
    console.error("Google Places connection error:", error);

    return sendError(
      res,
      502,
      "Unable to connect to Google Places API."
    );
  }
});

// --------------------------------------------------
// GOOGLE PLACES PHOTOS
// --------------------------------------------------

app.get("/api/photo", async (req, res) => {
  const name = String(req.query.name || "");

  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    return sendError(res, 400, "Invalid photo reference");
  }

  if (!isConfigured()) {
    return sendError(res, 503, "Google Places API key missing");
  }

  try {
    const url = new URL(
      `https://places.googleapis.com/v1/${name}/media`
    );

    url.searchParams.set("maxWidthPx", "900");
    url.searchParams.set("skipHttpRedirect", "true");

    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": getApiKey(),
      },
    });

    if (!response.ok) {
      console.error(
        "Google photo error:",
        response.status,
        await response.text()
      );

      return sendError(
        res,
        response.status,
        "Google Places photo unavailable"
      );
    }

    const data = await response.json();

    if (!data.photoUri) {
      return sendError(res, 502, "Photo URL unavailable");
    }

    const imageResponse = await fetch(data.photoUri);

    if (!imageResponse.ok) {
      return sendError(res, 502, "Unable to retrieve photo");
    }

    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=300");

    return res.send(imageBuffer);
  } catch (error) {
    console.error("Photo error:", error);

    return sendError(res, 502, "Photo unavailable");
  }
});

// --------------------------------------------------
// API 404 HANDLER
// --------------------------------------------------

// Always return JSON for unknown API routes.
app.use("/api", (req, res) => {
  return sendError(res, 404, "API endpoint not found");
});

// --------------------------------------------------
// FRONTEND
// --------------------------------------------------

// Vercel serves the Vite frontend separately.
// Only serve the frontend through Express locally.

if (!process.env.VERCEL) {
  app.use(express.static(distPath));

  // Express 5 compatible frontend fallback
  app.get("/{*splat}", (req, res) => {
    res.sendFile(
      path.join(distPath, "index.html"),
      (error) => {
        if (error && !res.headersSent) {
          sendError(
            res,
            404,
            "Frontend build not found. Run npm run build."
          );
        }
      }
    );
  });
}

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

// Only start a listening server locally.
// Vercel invokes the exported Express app directly.

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log("-----------------------------------");
    console.log("ROAM Travel API running");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Google Places configured: ${isConfigured()}`);
    console.log("-----------------------------------");
  });
}

export default app;