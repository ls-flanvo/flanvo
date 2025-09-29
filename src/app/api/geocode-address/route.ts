export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'Flanvo/1.0 (contact: support@flanvo.app)'; // metti un tuo contatto reale

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q) {
    return Response.json({ error: 'Missing q', hint: 'Usa ?q=Roma, IT' }, { status: 400 });
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', q);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('dedupe', '1');

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'User-Agent': UA },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return Response.json({ error: `Nominatim ${res.status}`, details: text || res.statusText }, { status: res.status });
  }

  const list = await res.json().catch(() => null);
  if (!Array.isArray(list)) return Response.json({ error: 'Invalid Nominatim response' }, { status: 502 });

  // Normalizzazione semplice in stile Mapbox-like
  const features = list.map((it: any) => ({
    type: 'Feature',
    id: it.place_id?.toString(),
    place_name: it.display_name,
    center: [Number(it.lon), Number(it.lat)],
    geometry: { type: 'Point', coordinates: [Number(it.lon), Number(it.lat)] },
    address: it.address || null,
    source: 'nominatim',
  }));

  return Response.json({ type: 'FeatureCollection', features });
}
