import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN;

if (!MAPBOX_TOKEN) {
  throw new Error('Missing MAPBOX token');
}

  console.log(
  '[MAPBOX] token in uso:',
  MAPBOX_TOKEN?.slice(0, 3),   // pk. o sk.
  '…',
  MAPBOX_TOKEN?.slice(-6),     // ultime 6 cifre
  'len=', MAPBOX_TOKEN?.length
);


if (!MAPBOX_TOKEN) {
  return NextResponse.json({ error: 'Missing MAPBOX token' }, { status: 500 });
}

// Fallback statico per alcuni aeroporti IT più comuni (IATA → [lat, lon])
const IATA_STATIC: Record<string, [number, number]> = {
  FCO: [41.8003, 12.2389], // Roma Fiumicino
  CIA: [41.7994, 12.5949], // Roma Ciampino
  MXP: [45.6301, 8.7231],  // Milano Malpensa
  LIN: [45.4451, 9.2767],  // Milano Linate
  BGY: [45.6739, 9.7042],  // Bergamo Orio
  TRN: [45.2008, 7.6496],  // Torino
  VCE: [45.5053, 12.3519], // Venezia
  VRN: [45.3957, 10.8885], // Verona
  BLQ: [44.5300, 11.2967], // Bologna
  FLR: [43.8091, 11.2051], // Firenze
  PSA: [43.6839, 10.3927], // Pisa
  NAP: [40.8860, 14.2908], // Napoli
  CTA: [37.4668, 15.0664], // Catania
  PMO: [38.1811, 13.0908], // Palermo
  BRI: [41.1389, 16.7606], // Bari
  BDS: [40.6576, 17.9470], // Brindisi
  OLB: [40.8986, 9.5176],  // Olbia
  AHO: [40.6321, 8.2908],  // Alghero
  CAG: [39.2514, 9.0543],  // Cagliari
};

async function mapboxPlaces(query: string) {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('types', 'poi,airport,place');
  url.searchParams.set('limit', '5');
  // opzionale: restringi ai paesi
  // url.searchParams.set('country', 'it,fr,de,es');

  const r = await fetch(url.toString(), { cache: 'no-store' });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Mapbox error: ${txt}`);
  }
  return r.json();
}

// GET /api/geocode-airport?code=FCO
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('code')?.trim().toUpperCase();
    if (!raw) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    // 1) fallback statico immediato
    if (IATA_STATIC[raw]) {
      const [lat, lon] = IATA_STATIC[raw];
      return NextResponse.json({ lat, lon, name: raw, place_name: `${raw} (static)` });
    }

    // 2) tentativo 1: "FCO airport"
    let data = await mapboxPlaces(`${raw} airport`);
    let feature =
      data?.features?.find((f: any) =>
        /airport/i.test(f.text || f.place_name || '')
      ) || data?.features?.[0];

    // 3) tentativo 2: solo "FCO"
    if (!feature) {
      data = await mapboxPlaces(raw);
      feature =
        data?.features?.find((f: any) =>
          /airport/i.test(f.text || f.place_name || '')
        ) || data?.features?.[0];
    }

    if (!feature) {
      return NextResponse.json({ error: 'Airport not found' }, { status: 404 });
    }

    const [lon, lat] = feature.center;
    return NextResponse.json({ lat, lon, name: feature.text, place_name: feature.place_name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
