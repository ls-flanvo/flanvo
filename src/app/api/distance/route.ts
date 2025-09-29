// src/app/api/distance/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Num = number | string | null;

function toNum(n: Num): number | null {
  if (n === null || n === undefined) return null;
  const v = typeof n === 'string' ? n.trim() : n;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

export async function GET(req: Request) {
  const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN;
  if (!MAPBOX_TOKEN) {
    return Response.json({ error: 'Missing MAPBOX_SECRET_TOKEN' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);

  // Parametri obbligatori
  const fromLat = toNum(searchParams.get('fromLat'));
  const fromLng = toNum(searchParams.get('fromLng'));
  const toLat   = toNum(searchParams.get('toLat'));
  const toLng   = toNum(searchParams.get('toLng'));

  if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
    return Response.json(
      {
        error: 'Missing or invalid coordinates',
        hint: 'Usa ?fromLat=41.9028&fromLng=12.4964&toLat=45.4642&toLng=9.1900',
      },
      { status: 400 }
    );
  }

  // Parametri opzionali tariffa
  const baseFare  = toNum(searchParams.get('base_fare')) ?? 5;
  const ratePerKm = toNum(searchParams.get('rate_per_km')) ?? 1.2;
  const minFare   = toNum(searchParams.get('min_fare')) ?? 10;
  const currency  = (searchParams.get('currency') || 'EUR').toUpperCase();

  // Directions (ordine LON,LAT)
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'false');
  url.searchParams.set('steps', 'false');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    return Response.json(
      { error: `Mapbox ${res.status}`, details: text || res.statusText },
      { status: res.status }
    );
  }

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    return Response.json({ error: 'No route found', details: data }, { status: 502 });
  }

  const route = data.routes[0];
  const distance_m = Number(route.distance) || 0;
  const duration_s = Number(route.duration) || 0;

  const distance_km_raw = distance_m / 1000;
  const distance_km = Math.round(distance_km_raw * 100) / 100;
  const duration_min = Math.round((duration_s / 60) * 10) / 10;

  const cost_raw = Number(baseFare) + Number(ratePerKm) * distance_km_raw;
  const estimated_total = Math.max(Number(minFare), Math.round(cost_raw * 100) / 100);

  return Response.json({
    ok: true,
    inputs: {
      from: { lat: fromLat, lng: fromLng },
      to:   { lat: toLat,   lng: toLng },
    },
    route: {
      distance_meters:  distance_m,
      distance_km:      distance_km,
      duration_seconds: duration_s,
      duration_minutes: duration_min,
    },
    pricing: {
      base_fare:    Number(baseFare),
      rate_per_km:  Number(ratePerKm),
      min_fare:     Number(minFare),
      currency,
      estimated_total,
    },
  });
}
