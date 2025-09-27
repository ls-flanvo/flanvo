'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { loadStripe } from '@stripe/stripe-js';
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

type WithDistance = RequestRow & { kmFromAirport?: number; etaMin?: number; euroShare?: number };

// Tariffa demo (come in tabella ncc_partners): base 10€, 1.20€/km
const BASE_FEE_CENTS = 1000;
const PER_KM_CENTS = 120;

// Haversine per ordinare “prossimità tra passeggeri” (fallback)
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
  const [mine, setMine] = useState<WithDistance | null>(null);
  const [sameFlight, setSameFlight] = useState<WithDistance[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [forming, setForming] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session as any;
      setSession(s);
      if (!s?.user) {
        setLoading(false);
        return;
      }

      // 1) Mia ultima richiesta
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
      const myReq = (reqs && (reqs as any[])[0]) || null;

      // 2) Prendi il volo per l’IATA di arrivo (airport_code)
      let arrivalIata: string | null = null;
      if (myReq?.flight_id) {
        const { data: flight } = await supabase
          .from('flights')
          .select('airport_code')
          .eq('id', myReq.flight_id)
          .single();
        arrivalIata = flight?.airport_code ?? null;
      }

      // 3) Geocoding dell’aeroporto di arrivo → coord
      let airportLatLon: { lat: number; lon: number } | null = null;
      if (arrivalIata) {
        const geores = await fetch(`/api/geocode-airport?code=${encodeURIComponent(arrivalIata)}`);
        if (geores.ok) {
          const g = await geores.json();
          airportLatLon = { lat: g.lat, lon: g.lon };
        } else {
          setMsg('Geocoding aeroporto fallito (userò fallback).');
        }
      }

      // 4) Peers dello stesso volo (RPC sicuro)
      let peers: WithDistance[] = [];
      if (myReq?.flight_id) {
        const { data: p, error: e2 } = await supabase.rpc('get_same_flight_requests', {
          my_user: s.user.id,
        });
        if (e2) setMsg('Errore lettura passeggeri: ' + e2.message);
        peers = ((p || []) as any[]).filter(r => r.user_id !== s.user.id) as WithDistance[];
      }

      // 5) Calcola distanza reale su strada aeroporto→dest (per me e per i peers)
      const addRoadDistance = async (r: RequestRow): Promise<WithDistance> => {
        if (!airportLatLon) return r as WithDistance;
        try {
          const res = await fetch('/api/distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: airportLatLon,
              to: { lat: r.dest_lat, lon: r.dest_lon },
            }),
          });
          if (!res.ok) return r as WithDistance;
          const d = await res.json();
          const km = d.km as number;
          const etaMin = d.durationMin as number;
          return { ...(r as any), kmFromAirport: km, etaMin };
        } catch {
          return r as WithDistance;
        }
      };

      const mineWithD = myReq ? await addRoadDistance(myReq) : null;
      const peersWithD = await Promise.all(peers.map(addRoadDistance));

      setMine(mineWithD);
      setSameFlight(peersWithD);
      setLoading(false);

      // banner successo pagamento
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        setPaymentSuccess(params.get('success') === '1');
      }
    };

    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s as any));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Ordina suggerimenti per vicinanza (Haversine tra destinazioni)
  const suggestions = useMemo(() => {
    if (!mine) return [];
    const origin = { lat: mine.dest_lat, lon: mine.dest_lon };
    return sameFlight
      .map(r => ({ r, d: haversineKm(origin, { lat: r.dest_lat, lon: r.dest_lon }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(x => x.r);
  }, [mine, sameFlight]);

  // Stima costo per passeggero usando distanza su strada (approssimazione: usa la max distanza dall’aeroporto tra i membri del gruppo)
  const euroPerPassenger = useMemo(() => {
    if (!mine) return null;
    const members = [mine, ...suggestions];
    const maxKm = Math.max(...members.map(m => m.kmFromAirport ?? 0));
    const totalCents = BASE_FEE_CENTS + Math.round(PER_KM_CENTS * maxKm);
    const share = Math.ceil(totalCents / members.length);
    return (share / 100).toFixed(2);
  }, [mine, suggestions]);

  // Forma gruppo
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

      const members = [mine, ...suggestions].map(r => ({
        group_id: (g as any).id,
        request_id: r.id,
        distance_km: r.kmFromAirport ?? null,       // salvo distanza calcolata (per ora singola)
        price_share_cents: euroPerPassenger ? Math.round(parseFloat(euroPerPassenger) * 100) : null,
      }));
      const { error: mErr } = await supabase.from('group_members').insert(members);
      if (mErr) throw mErr;

      setMsg('✅ Gruppo creato! (vedi tabella groups / group_members)');
    } catch (e: any) {
      setMsg('Errore creazione gruppo: ' + e.message);
    } finally {
      setForming(false);
    }
  };

  // Pagamento (Stripe Checkout già impostato in test mode)
  const handlePayment = async () => {
    if (!mine) return;
    try {
      setMsg(null);
      const members = [mine, ...suggestions];
      const maxKm = Math.max(...members.map(m => m.kmFromAirport ?? 0));
      const totalCents = BASE_FEE_CENTS + Math.round(PER_KM_CENTS * maxKm);
      const shareCents = Math.ceil(totalCents / members.length);

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: mine.flight_id, amountCents: shareCents }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

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
            Non hai ancora creato una richiesta. Vai su <a className="underline" href="/app">/app</a>.
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
          <a href="/app" className="rounded-xl px-3 py-2 bg-zinc-800 hover:bg-zinc-700">Nuova richiesta</a>
        </header>

        {paymentSuccess && (
          <div className="bg-green-600 text-white rounded-xl p-4">
            ✅ Pagamento completato! Grazie per aver confermato la corsa.
          </div>
        )}

        {/* La tua richiesta */}
        <section className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5">
          <h2 className="font-medium mb-3">La tua richiesta</h2>
          <div className="text-sm text-zinc-300">
            <div>ID: {mine.id}</div>
            <div>Dest: {mine.dest_address ?? `${mine.dest_lat}, ${mine.dest_lon}`}</div>
            {mine.kmFromAirport != null && (
              <div>Distanza su strada dall'aeroporto: {mine.kmFromAirport.toFixed(1)} km</div>
            )}
            <div>Creato: {new Date(mine.created_at).toLocaleString()}</div>
          </div>
        </section>

        {/* Suggerimenti compagni */}
        <section className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium">Suggerimenti di compagni (max 3)</h2>
          {suggestions.length === 0 ? (
            <p className="text-zinc-400 text-sm">Nessun altro passeggero trovato su questo volo (ancora).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {suggestions.map(s => (
                <li key={s.id} className="flex items-center justify-between bg-zinc-950 rounded-xl px-3 py-2">
                  <div className="flex flex-col">
                    <span>{s.dest_address ?? `${s.dest_lat.toFixed(4)}, ${s.dest_lon.toFixed(4)}`}</span>
                    {s.kmFromAirport != null && (
                      <span className="text-xs text-zinc-400">
                        ~{s.kmFromAirport.toFixed(1)} km dall'aeroporto (strada)
                      </span>
                    )}
                  </div>
                  <span className="text-zinc-400">pax {s.pax}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Stima quota per passeggero */}
          {euroPerPassenger && (
            <div className="text-sm text-zinc-300 bg-zinc-950 rounded-xl px-3 py-2">
              Stima quota per passeggero: <b>€{euroPerPassenger}</b> (demo)
            </div>
          )}

          <button
            disabled={forming || !mine}
            onClick={formGroup}
            className="w-full rounded-2xl bg-white text-black font-medium py-3 disabled:opacity-60"
          >
            {forming ? 'Creo gruppo…' : 'Forma gruppo'}
          </button>

          <button
            onClick={handlePayment}
            className="w-full rounded-2xl bg-purple-500 text-white font-medium py-3 mt-2"
          >
            Procedi al pagamento (demo)
          </button>

          {msg && <p className="text-sm text-zinc-300 mt-2">{msg}</p>}
        </section>
      </div>
    </main>
  );
}
