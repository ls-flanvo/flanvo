export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Num = number | string | null;
const toNum = (n: Num) => {
  if (n === null || n === undefined) return null;
  const v = typeof n === 'string' ? n.trim() : n;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const fromLat = toNum(searchParams.get('fromLat'));
  const fromLng = toNum(searchParams.get('fromLng'));
  const toLat   = toNum(searchParams.get('toLat'));
  const toLng   = toNum(searchParams.get('toLng'));
  if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
    return Response.json(
      { error: 'Missing or invalid coordinates',
        hint: 'Usa ?fromLat=41.9028&fromLng=12.4964&toLat=45.4642&toLng=9.1900' },
      { status: 400 }
    );
  }

  // Tariffa opzionale
  const baseFare  = toNum(searchParams.get('base_fare')) ?? 5;
  const ratePerKm = toNum(searchParams.get('rate_per_km')) ?? 1.2;
  const minFare   = toNum(searchParams.get('min_fare')) ?? 10;
  const currency  = (searchParams.get('currency') || 'EUR').toUpperCase();

  // OSRM: ordine LON,LAT
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('steps', 'false');

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    return Response.json({ error: `OSRM ${res.status}`, details: text || res.statusText }, { status: res.status });
  }

  const data = await res.json().catch(()=>null);
  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    return Response.json({ error: 'No route found', details: data }, { status: 502 });
  }

  const r = data.routes[0];
  const distance_m = Number(r.distance) || 0;
  const duration_s = Number(r.duration) || 0;

  const distance_km_raw = distance_m / 1000;
  const distance_km = Math.round(distance_km_raw * 100) / 100;
  const duration_min = Math.round((duration_s / 60) * 10) / 10;

  const cost_raw = Number(baseFare) + Number(ratePerKm) * distance_km_raw;
  const estimated_total = Math.max(Number(minFare), Math.round(cost_raw * 100) / 100);

  return Response.json({
    ok: true,
    route: {
      distance_meters: distance_m,
      distance_km,
      duration_seconds: duration_s,
      duration_minutes: duration_min,
    },
    pricing: {
      base_fare: Number(baseFare),
      rate_per_km: Number(ratePerKm),
      min_fare: Number(minFare),
      currency,
      estimated_total,
    },
    source: 'osrm',
  });
}
