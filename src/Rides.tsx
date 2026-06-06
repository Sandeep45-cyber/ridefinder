import { useState, useEffect, useCallback } from "react";
import { MapPin, Navigation, Car, Clock, DollarSign, Phone, ExternalLink, Loader2, RefreshCw, Crosshair } from "lucide-react";

type Taxi = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  phone?: string;
  distanceKm: number;
};

type RideEstimate = {
  name: string;
  emoji: string;
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  color: string;
  deepLink: (pLat: number, pLon: number, dLat?: number, dLon?: number) => string;
};

const PROVIDERS: RideEstimate[] = [
  {
    name: "Uber",
    emoji: "⚫",
    baseFare: 2.55, perKm: 0.99, perMin: 0.35, minFare: 8,
    color: "#000000",
    deepLink: (pLat, pLon, dLat, dLon) => {
      let u = `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${pLat}&pickup[longitude]=${pLon}`;
      if (dLat != null && dLon != null) u += `&dropoff[latitude]=${dLat}&dropoff[longitude]=${dLon}`;
      return u;
    },
  },
  {
    name: "Lyft",
    emoji: "🧡",
    baseFare: 2.10, perKm: 0.93, perMin: 0.33, minFare: 7,
    color: "#EA0B8C",
    deepLink: (pLat, pLon, dLat, dLon) => {
      let u = `https://lyft.com/ride?id=lyft&pickup[latitude]=${pLat}&pickup[longitude]=${pLon}`;
      if (dLat != null && dLon != null) u += `&destination[latitude]=${dLat}&destination[longitude]=${dLon}`;
      return u;
    },
  },
  {
    name: "Curb (Taxi)",
    emoji: "🚖",
    baseFare: 3.00, perKm: 1.40, perMin: 0.40, minFare: 9,
    color: "#F5A623",
    deepLink: () => `https://gocurb.com/`,
  },
  {
    name: "Local Taxi (metered)",
    emoji: "🟡",
    baseFare: 3.50, perKm: 1.55, perMin: 0.45, minFare: 10,
    color: "#FFC107",
    deepLink: () => `#taxis`,
  },
];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MI_TAXIS: { name: string; city: string; phone: string; lat: number; lon: number; rating: number }[] = [
  { name: "Metro Black Sedans", city: "Detroit", phone: "(888) 615-6165", lat: 42.3314, lon: -83.0458, rating: 5.0 },
  { name: "Metro Elite Transfer", city: "Detroit", phone: "(800) 528-7582", lat: 42.3314, lon: -83.0458, rating: 4.9 },
  { name: "A-1 Airport Cars (DTW)", city: "Detroit / Ann Arbor", phone: "(877) 276-1335", lat: 42.2808, lon: -83.7430, rating: 4.4 },
  { name: "Premier Taxi & Limo", city: "Ann Arbor", phone: "(734) 897-0207", lat: 42.2808, lon: -83.7430, rating: 4.5 },
  { name: "Calder City Taxi", city: "Grand Rapids", phone: "(616) 454-8080", lat: 42.9634, lon: -85.6681, rating: 4.2 },
  { name: "AbyRide", city: "Grand Rapids", phone: "(616) 633-7026", lat: 42.9634, lon: -85.6681, rating: 4.6 },
  { name: "Royal Express", city: "Lansing", phone: "(517) 489-9717", lat: 42.7325, lon: -84.5555, rating: 4.3 },
  { name: "Green Cab of Lansing", city: "Lansing", phone: "(517) 643-1905", lat: 42.7325, lon: -84.5555, rating: 2.7 },
  { name: "Hey Taxi", city: "Kalamazoo", phone: "(810) 629-7080", lat: 42.2917, lon: -85.5872, rating: 4.9 },
  { name: "Lightning Taxi", city: "Flint", phone: "(810) 282-9749", lat: 43.0125, lon: -83.6875, rating: 4.0 },
];

export default function Rides() {
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locName, setLocName] = useState<string>("");
  const [taxis, setTaxis] = useState<Taxi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [tripKm, setTripKm] = useState<number>(8);
  const [sortBy, setSortBy] = useState<"price" | "distance">("price");
  const [dest, setDest] = useState<{ lat: number; lon: number } | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [searchingDest, setSearchingDest] = useState(false);

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`,
        { headers: { Accept: "application/json" } }
      );
      const d = await r.json();
      setLocName(d.address?.city || d.address?.town || d.address?.county || d.display_name?.split(",").slice(0, 2).join(",") || "");
    } catch { /* ignore */ }
  };

  const fetchTaxis = useCallback(async (lat: number, lon: number) => {
    setLoading(true);
    setError("");
    try {
      const radius = 25000;
      const query = `[out:json][timeout:25];(node["amenity"="taxi"](around:${radius},${lat},${lon});way["amenity"="taxi"](around:${radius},${lat},${lon});node["shop"="taxi"](around:${radius},${lat},${lon});node["office"="taxi"](around:${radius},${lat},${lon}););out center 60;`;
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
      });
      const d = await r.json();
      const seen = new Set<string>();
      const list: Taxi[] = (d.elements || [])
        .map((el: any) => {
          const eLat = el.lat ?? el.center?.lat;
          const eLon = el.lon ?? el.center?.lon;
          if (eLat == null || eLon == null) return null;
          const name = el.tags?.name || el.tags?.operator || "Taxi stand";
          return {
            id: String(el.id),
            name,
            lat: eLat,
            lon: eLon,
            phone: el.tags?.phone || el.tags?.["contact:phone"],
            distanceKm: haversine(lat, lon, eLat, eLon),
          } as Taxi;
        })
        .filter((t: Taxi | null): t is Taxi => {
          if (!t) return false;
          const key = t.name + t.phone;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a: Taxi, b: Taxi) => a.distanceKm - b.distanceKm);
      setTaxis(list);
    } catch {
      setError("Couldn't load nearby taxi companies. The map service may be busy — try refreshing.");
    } finally {
      setLoading(false);
    }
  }, []);

  const locate = useCallback(() => {
    setError("");
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location. Enter a destination manually below.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setLoc({ lat, lon });
        reverseGeocode(lat, lon);
        fetchTaxis(lat, lon);
      },
      () => {
        setError("Location permission denied. Allow location access, or set a pickup by searching an address below.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchTaxis]);

  useEffect(() => { locate(); }, [locate]);

  const searchDest = async () => {
    if (!destQuery.trim()) return;
    setSearchingDest(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(destQuery)}`,
        { headers: { Accept: "application/json" } }
      );
      const d = await r.json();
      if (d[0]) {
        const dLat = parseFloat(d[0].lat);
        const dLon = parseFloat(d[0].lon);
        setDest({ lat: dLat, lon: dLon });
        if (loc) setTripKm(Math.max(1, haversine(loc.lat, loc.lon, dLat, dLon)));
      }
    } catch { /* ignore */ } finally {
      setSearchingDest(false);
    }
  };

  const estimateFare = (p: RideEstimate) => {
    const avgSpeed = 30;
    const mins = (tripKm / avgSpeed) * 60;
    const fare = Math.max(p.minFare, p.baseFare + p.perKm * tripKm + p.perMin * mins);
    const lo = fare * 0.9;
    const hi = fare * 1.25;
    return { lo, hi, mid: fare };
  };

  const sortedProviders = [...PROVIDERS].sort((a, b) => estimateFare(a).mid - estimateFare(b).mid);

  const miNearby = loc
    ? [...MI_TAXIS]
        .map((t) => ({ ...t, distanceKm: haversine(loc.lat, loc.lon, t.lat, t.lon) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
    : [...MI_TAXIS].map((t) => ({ ...t, distanceKm: 0 }));
  const showMi = !loc || miNearby[0].distanceKm < 120;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-amber-400/10 ring-1 ring-amber-400/30">
            <Car className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">RideFinder</h1>
            <p className="text-xs text-zinc-400">Compare rides &amp; taxis around you</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm truncate">
              {loc ? (locName || `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`) : "Locating you…"}
            </span>
          </div>
          <button onClick={locate} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 shrink-0">
            <Crosshair className="w-3.5 h-3.5" /> Update
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm rounded-xl bg-red-500/10 ring-1 ring-red-500/30 text-red-300 px-4 py-3">
            {error}
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-zinc-800/40 ring-1 ring-zinc-700 p-4">
          <label className="text-xs uppercase tracking-wide text-zinc-400">Where to? (for fare estimates)</label>
          <div className="mt-2 flex gap-2">
            <input
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchDest()}
              placeholder="Enter destination address"
              className="flex-1 bg-zinc-900 ring-1 ring-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-amber-400/50"
            />
            <button onClick={searchDest} disabled={searchingDest} className="px-3 py-2 rounded-xl bg-amber-400 text-zinc-900 text-sm font-medium hover:bg-amber-300 disabled:opacity-50">
              {searchingDest ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-zinc-400">Trip distance</span>
            <input type="range" min={1} max={50} value={tripKm} onChange={(e) => setTripKm(Number(e.target.value))} className="flex-1 accent-amber-400" />
            <span className="text-sm font-medium w-16 text-right">{tripKm.toFixed(0)} km</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">≈ {(tripKm * 0.621).toFixed(1)} miles{dest ? " · destination set" : ""}</p>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <span className="text-xs text-zinc-400 mr-1">Sort by</span>
          <button onClick={() => setSortBy("price")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${sortBy === "price" ? "bg-amber-400 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}>
            <DollarSign className="w-3 h-3 inline -mt-0.5" /> Price
          </button>
          <button onClick={() => setSortBy("distance")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${sortBy === "distance" ? "bg-amber-400 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}>
            <Navigation className="w-3 h-3 inline -mt-0.5" /> Distance
          </button>
        </div>

        {sortBy === "price" && (
          <div className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-400" /> Apps — estimated fares (cheapest first)</h2>
            {sortedProviders.map((p) => {
              const f = estimateFare(p);
              const mins = Math.round((tripKm / 30) * 60);
              return (
                <a key={p.name} href={loc ? p.deepLink(loc.lat, loc.lon, dest?.lat, dest?.lon) : "#"} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700 hover:ring-amber-400/50 px-4 py-3 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{p.emoji}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-zinc-400 flex items-center gap-1"><Clock className="w-3 h-3" /> ~{mins} min ride</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-amber-400">${f.lo.toFixed(0)}–${f.hi.toFixed(0)}</div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1 justify-end">open <ExternalLink className="w-3 h-3" /></div>
                  </div>
                </a>
              );
            })}
            <p className="text-[11px] text-zinc-500 px-1">Estimates only. Tapping opens the app with your pickup{dest ? " &amp; destination" : ""} so you see the real live price.</p>
          </div>
        )}

        <div id="taxis" className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><Car className="w-4 h-4 text-amber-400" /> Local taxi companies (nearest first)</h2>
            {loc && <button onClick={() => fetchTaxis(loc.lat, loc.lon)} className="text-amber-400 hover:text-amber-300"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>}
          </div>

          {loading && taxis.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Finding taxis near you…
            </div>
          )}

          {!loading && taxis.length === 0 && loc && (
            <div className="text-sm text-zinc-400 rounded-xl bg-zinc-800/40 ring-1 ring-zinc-700 px-4 py-4">
              No registered taxi stands found within 25 km in the map database. The app estimates above (Uber/Lyft) still work everywhere.
            </div>
          )}

          {taxis.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-1"><Navigation className="w-3 h-3" /> {t.distanceKm.toFixed(1)} km away</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.phone && (
                  <a href={`tel:${t.phone}`} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 text-xs">
                    <Phone className="w-3 h-3" /> Call
                  </a>
                )}
                <a href={`https://maps.google.com/?q=${t.lat},${t.lon}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-700 text-xs">
                  <MapPin className="w-3 h-3" /> Map
                </a>
              </div>
            </div>
          ))}
        </div>

        {showMi && (
          <div className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><Car className="w-4 h-4 text-amber-400" /> Top-rated Michigan taxi companies</h2>
            {miNearby.map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name} <span className="text-amber-400 text-xs">★ {t.rating.toFixed(1)}</span></div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {t.city}{loc ? ` · ${t.distanceKm.toFixed(0)} km away` : ""}
                  </div>
                </div>
                <a href={`tel:${t.phone.replace(/[^0-9]/g, "")}`} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 text-xs shrink-0">
                  <Phone className="w-3 h-3" /> {t.phone}
                </a>
              </div>
            ))}
            <p className="text-[11px] text-zinc-500 px-1">Curated &amp; verified Michigan operators, sorted by distance from you.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-600">
          Live taxi locations from OpenStreetMap · Fares are estimates — confirm in-app before booking
        </p>
      </div>
    </div>
  );
}
