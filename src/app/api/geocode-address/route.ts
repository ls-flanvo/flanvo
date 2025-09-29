// src/app/api/geocode-address/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN;
  if (!MAPBOX_TOKEN) {
    return Response.json({ error: 'Missing MAPBOX_SECRET_TOKEN' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q) {
    return Response.json(
      { error: 'Missing q', hint: 'Usa ?q=Roma, IT' },
      { status: 400 }
    );
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('language', 'it');
  // url.searchParams.set('limit', '5'); // opzionale
  // url.searchParams.set('types', 'address,place,poi'); // opzionale

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return Response.json(
      { error: `Mapbox ${res.status}`, details: text || res.statusText },
      { status: res.status }
    );
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    return Response.json({ error: 'Invalid Mapbox response' }, { status: 502 });
  }

  return Response.json(data);
}
