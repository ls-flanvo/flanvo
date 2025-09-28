'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { loadStripe } from '@stripe/stripe-js';

// Stripe (publishable key lato client)
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Session = { user: { id: string } } | null;

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

type Airport = { lat: number; lon: number; name: string; place_name: string };

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
}

export default function MatchesPage() {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<RequestRow | null>(null);
  const [sameFlight, setSameFlight] = useState<RequestRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [forming, setForming] = useState(false);

  // stime costi/percorsi
  const [airport, setAirport] = useState<Airport | null>(null);
  const [tripKm, setTripKm] = useState<number | null>(null);
  const [tripMin, setTripMin] = useState<number | null>(null);

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
        .select(
          'id, user_id, flight_id, dest_lat, dest_lon, pax, dest_address, created_at'
        )
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        setMsg('Errore lettura richieste: ' + error.message);
        setLoading(false);
        return;
      }
      const myReq = (reqs && (reqs as any[])[0]) || null;
      setMine(myReq as any);

      // altri dello stesso volo
      if (myReq?.flight_id) {
        const { data: peers, error: e2 } = await supabase.rpc(
          'get_same_flight_requests',
          { my_user: s.user.id }
        );
        if (e2) setMsg('Errore lettura passeggeri: ' + e2.message);
        setSameFlight(
          ((peers || []) as any[]).filter((r) => r.user_id !== s.user.id) as any
        );
      }

      setLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s as any)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // top 3 più vicini alla mia destinazione
  const suggestions = useMemo(() => {
    if (!mine) return [];
    const origin = { lat: mine.dest_lat, lon: mine.dest_lon };
    return sameFlight
      .map((r) => ({
        r,
        d: haversineKm(origin, { lat: r.dest_lat, lon: r.dest_lon }),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.r);
  }, [mine, sameFlight]);

  // geocoda aeroporto di arrivo del volo e calcola distanza reale con Mapbox
  useEffect(() => {
    (async () => {
      try {
        if (!mine) return;

        // recupera codice IATA di arrivo dal volo
        const { data: flight } = await supabase
          .from('flights')
          .select('airport_code')
          .eq('id', mine.flight_id)
          .single();

        const code = flight?.airport_code as string | undefined;
        if (!code) return;

        // 1) geocode airport (server side, usa sk)
        const aRes = await fetch(`/api/geocode-airport?code=${encodeURIComponent(code)}`);
        const a = await aRes.json();
        if (!aRes.ok || a.error) {
          setMsg(`Geocoding aeroporto fallito (userò fallback).`);
        } else {
          setAirport(a as Airport);
        }

        // 2) distanza reale Aeroporto -> mia destinazione
        const from = { lat: (a.lat ?? 0), lon: (a.lon ?? 0) };
        const to = { lat: mine.dest_lat, lon: mine.dest_lon };

        const dRes = await fetch('/api/distance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        });
        const dData = await dRes.json();
        if (dRes.ok) {
          setTripKm(dData.km);
          setTripMin(dData.minutes);
        } else {
          setTripKm(null);
          setTripMin(null);
        }
      } catch {
        // ignora: mostriamo solo stima se disponibile
      }
    })();
  }, [mine]);

  // costo fittizio per demo
  const estimatedShare = useMemo(() => {
    const people = (suggestions.length + 1) || 1;
    const km = tripKm ?? 10;
    const total = Math.max(5, Math.round(km * 1.0)); // €1/km min €5
    return Math.round((total / people) * 100) / 100;
  }, [suggestions.length, tripKm]);

  // crea gruppo
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

      setMsg('✅ Gruppo creato! (controlla tabelle groups / group_members)');
    } catch (e: any) {
      setMsg('Errore creazione gruppo: ' + e.message);
    } finally {
      setForming(false);
    }
  };

  // pagamento demo: crea Checkout Session server-side e redirect
  const handlePayment = async () => {
    if (!mine) return;
    try {
      setMsg(null);
      const amountCents = Math.round(estimatedShare * 100);

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: mine.flight_id,
          amountCents,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Checkout error');

      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe non caricato');

      const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
      if (error) throw error;
    } catch (err: any) {
      setMsg('Errore pagamento: ' + err.message);
    }
  };

  // UI
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

        <section className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5">
          <h2 className="font-medium mb-3">La tua richiesta</h2>
          <div className="text-sm text-zinc-300">
            <div>ID: {mine.id}</div>
            <div>Dest: {mine.dest_address ?? `${mine.dest_lat}, ${mine.dest_lon}`}</div>
            <div>Creato: {new Date(mine.created_at).toLocaleString()}</div>
            {airport && (
              <div className="mt-2 text-zinc-400">
                Aeroporto: {airport.place_name}
              </div>
            )}
            {tripKm != null && (
              <div className="mt-1 text-zinc-400">
                Distanza stimata: ~{tripKm.toFixed(1)} km
                {tripMin != null ? ` · ${tripMin} min` : ''}
              </div>
            )}
          </div>
        </section>

        <section className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium">Suggerimenti di compagni (max 3)</h2>
          {suggestions.length === 0 ? (
            <p className="text-zinc-400 text-sm">
              Nessun altro passeggero trovato su questo volo (ancora).
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between bg-zinc-950 rounded-xl px-3 py-2"
                >
                  <span>
                    {s.dest_address ??
                      `${s.dest_lat.toFixed(4)}, ${s.dest_lon.toFixed(4)}`}
                  </span>
                  <span className="text-zinc-400">pax {s.pax}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="text-sm text-zinc-300 bg-zinc-950 rounded-xl px-3 py-2">
            Stima quota per passeggero: <strong>€{estimatedShare.toFixed(2)}</strong> (demo)
          </div>

          <button
            disabled={forming || !mine}
            onClick={formGroup}
            className="w-full rounded-2xl bg-yellow-300 text-black font-medium py-3 disabled:opacity-60"
          >
            {forming ? 'Creo gruppo…' : 'Forma gruppo'}
          </button>

          <button
            onClick={handlePayment}
            className="w-full rounded-2xl bg-fuchsia-600 text-white font-medium py-3"
          >
            Procedi al pagamento (demo)
          </button>

          {msg && <p className="text-sm text-zinc-300 mt-2">{msg}</p>}
        </section>
      </div>
    </main>
  );
}
