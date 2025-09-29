export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'Flanvo/1.0 (contact: support@flanvo.app)';

async function searchNominatim(q: string) {
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
  if (!res.ok) throw new Error(`Nominatim ${res.status} ${await res.text().catch(()=>res.statusText)}`);
  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q) {
    return Response.json({ error: 'Missing q', hint: 'Usa ?q=FCO o ?q=Fiumicino' }, { status: 400 });
  }

  // 1° tentativo: query originale
  let list: any[] = [];
  try { list = await searchNominatim(q); } catch (_) {}

  // Fallback mirato: aggiungi "airport"
  if (!Array.isArray(list) || list.length === 0) {
    try { list = await searchNominatim(`${q} airport`); } catch (_) {}
  }

  if (!Array.isArray(list)) return Response.json({ error: 'Invalid Nominatim response' }, { status: 502 });

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
