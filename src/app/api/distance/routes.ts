import { NextResponse } from 'next/server';

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN!;

// POST /api/distance
// body: { from: {lat:number, lon:number}, to: {lat:number, lon:number} }
export async function POST(req: Request) {
  try {
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

    // Mapbox dà "distance" in metri.
    const km = route.distance / 1000;
    const durationMin = Math.round((route.duration || 0) / 60);

    return NextResponse.json({ km, durationMin });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
