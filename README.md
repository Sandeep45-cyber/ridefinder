# RideFinder

> Every ride around you, cheapest first.

RideFinder compares ride options near you in one place — estimated fares for ride apps (Uber, Lyft, Curb) alongside a distance-sorted directory of verified local taxi companies you can call with one tap — all based on your current location.

**Live app:** https://naga.zo.space/rides

---

## What problem it solves

People overpay and waste time because ride options are scattered across separate apps. RideFinder fixes three things:

1. **No more app-hopping to compare prices** — Uber, Lyft, and Curb fare estimates lined up side by side, cheapest first.
2. **Local taxis become visible** — small metered cab companies that the big apps ignore, with one-tap calling, sorted by who's closest.
3. **One informed choice** — distance + estimated fare together, so you stop guessing which option is actually nearest or cheapest.

## Features

- Location detection via browser geolocation (or type a pickup address)
- Ride-app fare estimates for Uber, Lyft, and Curb
- Deep links that open the chosen app with your trip pre-filled (so you see the real live price)
- Live nearby taxi stands pulled from OpenStreetMap, sorted by distance
- Curated, verified Michigan taxi directory with real phone numbers and one-tap calling
- Sort by Price or Distance

## Tech stack

| Layer | Tech |
|-------|------|
| Runtime / hosting | Zo Space (Bun + Hono) |
| Frontend | React + TypeScript |
| Styling | Tailwind CSS |
| Icons | Lucide |
| Location | Browser Geolocation API |
| Places / geocoding | OpenStreetMap (Overpass API) + Nominatim |
| Booking | Deep links into Uber / Lyft / Curb |

## A note on fares

There is no public, free feed for live availability and guaranteed prices across Uber, Lyft, and taxis — those public APIs were shut down years ago. So the in-app fares shown here are **estimates** calculated from trip distance. Tapping a provider opens its app with your pickup/destination pre-filled, where you'll see the real live quote before booking.

## Source

The app is a single React route. See `src/Rides.tsx`.

---

_Built on [Zo Computer](https://zo.computer)._
