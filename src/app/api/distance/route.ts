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

export async function GET() {
  // ping di test per evitare 404 quando apri l’URL nel browser
  return NextResponse.json({ ok: true });
}

// body: { from: {lat:number, lon:number}, to: {lat:number, lon:number} }
export async function POST(req: Request) {
  try {
    if (!MAPBOX_TOKEN) {
      return NextResponse.json({ error: 'Mapbox token missing' }, { status: 500 });
    }

    const { from, to } = await req.json();
    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to' }, { status: 400 });
    }

    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lon},${from.lat};${to.lon},${to.lat}`
    );
    url.searchParams.set('access_token', MAPBOX_TOKEN);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'simplified');
    url.searchParams.set('alternatives', 'false');

    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json({ error: `Mapbox error: ${txt}` }, { status: 500 });
    }
    const data = await r.json();
    const route = data?.routes?.[0];
    if (!route) {
      return NextResponse.json({ error: 'No route found' }, { status: 404 });
    }

    const km = route.distance / 1000;
    const durationMin = Math.round(route.duration / 60);
    return NextResponse.json({ km, durationMin });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
