'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Helper: chiama la nostra API server-side (usa lo SK sul server)
async function geocodeAddress(address: string) {
  const res = await fetch(`/api/geocode-address?q=${encodeURIComponent(address)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Geocoding failed');
  return data as { lat: number; lon: number; place_name: string };
}

type Session = { user: { id: string; email?: string } } | null;

export default function BookingPage() {
  const [session, setSession] = useState<Session>(null);

  // campi form
  const [flightNumber, setFlightNumber] = useState('');
  const [flightDate, setFlightDate] = useState(''); // yyyy-mm-dd
  const [originIata, setOriginIata] = useState('');
  const [arrivalIata, setArrivalIata] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [pax, setPax] = useState(1);
  const [luggage, setLuggage] = useState<string>('');

  // risultato geocoding
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLon, setGeoLon] = useState<number | null>(null);
  const [geoLabel, setGeoLabel] = useState<string>('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // carica sessione utente
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session as any);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s as any)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Geocoding quando esci dal campo indirizzo (onBlur)
  const handleGeocode = async () => {
    if (!destAddress || destAddress.length < 5) {
      setGeoLat(null);
      setGeoLon(null);
      setGeoLabel('');
      return;
    }
    try {
      setGeoLoading(true);
      const g = await geocodeAddress(destAddress);
      setGeoLat(g.lat);
      setGeoLon(g.lon);
      setGeoLabel(g.place_name);
      setMsg(null);
    } catch (e: any) {
      setGeoLat(null);
      setGeoLon(null);
      setGeoLabel('');
      setMsg('Geocoding fallito: ' + e.message);
    } finally {
      setGeoLoading(false);
    }
  };

  // crea o recupera flight
  const createOrFetchFlight = async () => {
    const { data: existing, error: findErr } = await supabase
      .from('flights')
      .select('id')
      .eq('flight_number', flightNumber)
      .eq('flight_date', flightDate)
      .eq('airport_code', arrivalIata)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) return existing.id;

    const { data: ins, error: insErr } = await supabase
      .from('flights')
      .insert({
        flight_number: flightNumber,
        flight_date: flightDate,
        airport_code: arrivalIata,          // arrivo
        origin_airport_code: originIata || null, // opzionale
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return ins.id;
  };

  // submit
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!session?.user) {
      setMsg('Devi essere loggato.');
      return;
    }
    if (!flightNumber || !flightDate || !arrivalIata) {
      setMsg('Compila numero volo, data e arrivo (IATA).');
      return;
    }
    if (!geoLat || !geoLon) {
      setMsg('Inserisci una destinazione valida e attendi la geocodifica.');
      return;
    }

    try {
      setCreating(true);

      const flightId = await createOrFetchFlight();

      // assicura profilo utente
      await supabase
        .from('users')
        .upsert(
          { id: session.user.id, email: session.user.email ?? '' },
          { onConflict: 'id' }
        );

      // crea richiesta
      const { error: reqErr } = await supabase.from('requests').insert({
        user_id: session.user.id,
        flight_id: flightId,
        dest_lat: geoLat,
        dest_lon: geoLon,
        dest_address: geoLabel || destAddress,
        pax,
        luggage: luggage || null,
      });
      if (reqErr) throw reqErr;

      setMsg('✅ Richiesta creata! Vai a /app/matches per i suggerimenti.');
    } catch (e: any) {
      setMsg('Errore creazione: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <p>Non sei loggato.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">FLANVO — Prenotazione (MVP)</h1>
          <a href="/app/matches" className="rounded-xl px-3 py-2 bg-zinc-800 hover:bg-zinc-700">
            Vai ai match
          </a>
        </header>

        <form
          onSubmit={onSubmit}
          className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col">
              <span className="text-sm mb-1">Numero volo</span>
              <input
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
                placeholder="es. FR1501"
                required
              />
            </label>

            <label className="flex flex-col">
              <span className="text-sm mb-1">Data volo</span>
              <input
                type="date"
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
                required
              />
            </label>

            <label className="flex flex-col">
              <span className="text-sm mb-1">Passeggeri</span>
              <input
                type="number"
                min={1}
                value={pax}
                onChange={(e) => setPax(parseInt(e.target.value || '1', 10))}
                className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col">
              <span className="text-sm mb-1">Partenza (IATA)</span>
              <input
                value={originIata}
                onChange={(e) => setOriginIata(e.target.value.toUpperCase())}
                className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
                placeholder="es. CTA"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm mb-1">Arrivo (IATA)</span>
              <input
                value={arrivalIata}
                onChange={(e) => setArrivalIata(e.target.value.toUpperCase())}
                className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
                placeholder="es. FCO"
                required
              />
            </label>
          </div>

          <label className="flex flex-col">
            <span className="text-sm mb-1">Destinazione finale (indirizzo)</span>
            <input
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
              onBlur={handleGeocode}  // geocoding quando esci dal campo
              className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
              placeholder="Via Roma 1, Roma"
              required
            />
            <span className="text-xs text-zinc-400 mt-1">
              {geoLoading
                ? 'Geocoding…'
                : geoLabel
                ? `→ ${geoLabel} (${geoLat?.toFixed(5)}, ${geoLon?.toFixed(5)})`
                : 'Inserisci un indirizzo valido; le coordinate saranno generate automaticamente.'}
            </span>
          </label>

          <label className="flex flex-col">
            <span className="text-sm mb-1">Bagagli (opz.)</span>
            <input
              value={luggage}
              onChange={(e) => setLuggage(e.target.value)}
              className="bg-zinc-950 rounded-xl px-3 py-2 outline-none ring-1 ring-zinc-800"
              placeholder="es. 1 valigia grande, 1 trolley"
            />
          </label>

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-2xl bg-white text-black font-medium py-3 disabled:opacity-60"
          >
            {creating ? 'Creo richiesta…' : 'Crea richiesta'}
          </button>

          {msg && <p className="text-sm text-zinc-300 mt-2">{msg}</p>}
        </form>
      </div>
    </main>
  );
}
