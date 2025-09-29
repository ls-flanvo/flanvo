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

export async function GET(req: Request) {
  try {
    if (!MAPBOX_TOKEN) {
      return NextResponse.json({ error: 'Mapbox token missing' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }

    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
    );
    url.searchParams.set('access_token', MAPBOX_TOKEN);
    url.searchParams.set('limit', '1');
    url.searchParams.set('language', 'it');

    const r = await fetch(url.toString(), { cache: 'no-store' });
    const data = await r.json();

    if (!r.ok) {
      return NextResponse.json(
        { error: `Mapbox error: ${JSON.stringify(data)}` },
        { status: 500 }
      );
    }

    const f = data?.features?.[0];
    if (!f?.center) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    const [lon, lat] = f.center;
    return NextResponse.json({ lat, lon, place_name: f.place_name as string });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
