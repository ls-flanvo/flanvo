'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ----- Tipi -----
type Session = { user: { id: string; email?: string } } | null;

type RequestRow = {
  id: string;
  user_id: string;
  flight_id: string;
  dest_lat: number;
  dest_lon: number;
  pax: number;
  dest_address: string | null;
  created_at: string;
};

type AirportPoint = { lat: number; lon: number; name?: string; place_name?: string };

type FlightRow = { id: string; airport_code: string | null };

// ----- Utils -----
const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
};

// Chiama la nostra API che geocodifica l’aeroporto lato server e normalizza i dati
async function geocodeAirport(iata: string): Promise<AirportPoint | null> {
  const r = await fetch(`/api/geocode-airport?q=${encodeURIComponent(iata)}`, { cache: 'no-store' });
  if (!r.ok) return null;

  const data = await r.json();
  const f = Array.isArray(data?.features) ? data.features[0] : null;
  if (!f) return null;

  const [lon, lat] = f.center || [];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  return { lat, lon, name: f.place_name };
}


// Chiama la nostra API che usa OSRM lato server
async function drivingDistanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const r = await fetch('/api/distance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Distance API error');
  return data.km as number;
}

export default function MatchesPage() {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<RequestRow | null>(null);
  const [sameFlight, setSameFlight] = useState<RequestRow[]>([]);
  const [airportCode, setAirportCode] = useState<string | null>(null);
  const [airportPoint, setAirportPoint] = useState<AirportPoint | null>(null);

  const [estPerPax, setEstPerPax] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [forming, setForming] = useState(false);

  // ---- carico session + dati base
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session as any;
      setSession(s);

      if (!s?.user) {
        setLoading(false);
        return;
      }

      // mia ultima richiesta
      const { data: reqs, error } = await supabase
        .from('requests')
        .select('id, user_id, flight_id, dest_lat, dest_lon, pax, dest_address, created_at')
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        setMsg('Errore lettura richieste: ' + error.message);
        setLoading(false);
        return;
      }

      const myReq = (reqs && (reqs as any[])[0]) as RequestRow | null;
      setMine(myReq);

      // altri passeggeri stesso volo
      if (myReq?.flight_id) {
        const { data: peers, error: e2 } = await supabase.rpc('get_same_flight_requests', {
          my_user: s.user.id,
        });
        if (e2) setMsg('Errore lettura passeggeri: ' + e2.message);
        setSameFlight(((peers || []) as any[]).filter((r) => r.user_id !== s.user.id) as any);
      }

      // leggo codice IATA di arrivo
      if (myReq?.flight_id) {
        const { data: fl, error: fe } = await supabase
          .from('flights')
          .select('id, airport_code')
          .eq('id', myReq.flight_id)
          .maybeSingle();
        if (fe) setMsg('Errore lettura volo: ' + fe.message);
        setAirportCode((fl as FlightRow | null)?.airport_code ?? null);
      }

      setLoading(false);
    };

    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s as any));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- recupero coordinate aeroporto (server)
  useEffect(() => {
    if (!airportCode) return;
    (async () => {
      const ap = await geocodeAirport(airportCode);
      if (!ap) {
        setMsg('Geocoding aeroporto fallito.');
      }
      setAirportPoint(ap);
    })();
  }, [airportCode]);

  // ---- suggerimenti: ordino per distanza
  const suggestions = useMemo(() => {
    if (!mine) return [];
    const origin = { lat: mine.dest_lat, lon: mine.dest_lon };
    return sameFlight
      .map((r) => ({ r, d: haversineKm(origin, { lat: r.dest_lat, lon: r.dest_lon }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.r);
  }, [mine, sameFlight]);

  // ---- stima costi
  useEffect(() => {
    const run = async () => {
      try {
        setEstPerPax(null);
        if (!mine || !airportPoint) return;

        const everyone = [mine, ...suggestions];
        let totalKm = 0;
        for (const r of everyone) {
          const km = await drivingDistanceKm({ lat: airportPoint.lat, lon: airportPoint.lon }, { lat: r.dest_lat, lon: r.dest_lon });
          totalKm += km;
        }

        const totalEuro = Math.max(10, totalKm * 1.2);
        const totalPax = everyone.reduce((s, r) => s + (r.pax || 1), 0);
        setEstPerPax(Math.round((totalEuro / Math.max(1, totalPax)) * 100) / 100);
      } catch (e: any) {
        setMsg('Stima costi fallita: ' + e.message);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airportPoint, mine, suggestions.length]);

  // ---- crea gruppo
  const formGroup = async () => {
    if (!mine) return;
    try {
      setForming(true);
      setMsg(null);
      const { data: g, error: gErr } = await supabase
        .from('groups')
        .insert({ flight_id: mine.flight_id, status: 'forming' })
        .select('id')
        .single();
      if (gErr) throw gErr;

      const members = [mine, ...suggestions].map((r) => ({
        group_id: (g as any).id,
        request_id: r.id,
        distance_km: null,
        price_share_cents: null,
      }));

      const { error: mErr } = await supabase.from('group_members').insert(members);
      if (mErr) throw mErr;

      setMsg('✅ Gruppo creato! (vedi tabelle groups / group_members)');
    } catch (e: any) {
      setMsg('Errore creazione gruppo: ' + e.message);
    } finally {
      setForming(false);
    }
  };

  // ---- UI
  if (loading) return <main className="p-6 text-zinc-400">Carico…</main>;

  if (!session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <p>Non sei loggato.</p>
          <a className="underline" href="/auth">Vai al login</a>
        </div>
      </main>
    );
  }

  if (!mine) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-xl mx-auto">
          <p className="text-zinc-300">
            Non hai ancora creato una richiesta. Vai su{' '}
            <a className="underline" href="/app">/app</a>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Matches — stesso volo</h1>
          <a href="/app" className="rounded-xl px-3 py-2 bg-zinc-800 hover:bg-zinc-700">
            Nuova richiesta
          </a>
        </header>

        {/* La tua richiesta */}
        <section className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5">
          <h2 className="font-medium mb-3">La tua richiesta</h2>
          <div className="text-sm text-zinc-300">
            <div>ID: {mine.id}</div>
            <div>
              Dest: {mine.dest_address ?? `${mine.dest_lat.toFixed(5)}, ${mine.dest_lon.toFixed(5)}`}
            </div>
            <div>Creato: {new Date(mine.created_at).toLocaleString()}</div>
            <div className="mt-1 text-zinc-400">
              Aeroporto arrivo: {airportCode ?? '—'} {airportPoint?.place_name ? `→ ${airportPoint.place_name}` : ''}
            </div>
          </div>
        </section>

        {/* Suggerimenti compagni */}
        <section className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium">Suggerimenti di compagni (max 3)</h2>
          {suggestions.length === 0 ? (
            <p className="text-zinc-400 text-sm">Nessun altro passeggero trovato su questo volo (ancora).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {suggestions.map((s) => (
                <li key={s.id} className="flex items-center justify-between bg-zinc-950 rounded-xl px-3 py-2">
                  <span>{s.dest_address ?? `${s.dest_lat.toFixed(4)}, ${s.dest_lon.toFixed(4)}`}</span>
                  <span className="text-zinc-400">pax {s.pax}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="text-sm text-zinc-300 bg-zinc-950 rounded-xl px-3 py-2">
            {estPerPax != null ? <>Stima quota per passeggero: <b>€{estPerPax.toFixed(2)}</b> (demo)</> : 'Calcolo stima in corso…'}
          </div>

          <button
            disabled={forming || !mine}
            onClick={formGroup}
            className="w-full rounded-2xl bg-white text-black font-medium py-3 disabled:opacity-60"
          >
            {forming ? 'Creo gruppo…' : 'Forma gruppo'}
          </button>

          {msg && <p className="text-sm text-zinc-300 mt-2">{msg}</p>}
        </section>
      </div>
    </main>
  );
}
