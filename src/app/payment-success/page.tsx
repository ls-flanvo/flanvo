'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

type GroupMember = {
  request_id: string;
  distance_km: number | null;
  price_share_cents: number | null;
  user_email: string | null;
};

function shortGroupCode(id: string | null) {
  if (!id) return null;
  const raw = id.replace(/-/g, '');
  return raw.slice(0, 8).toUpperCase();
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<main className="p-6 text-zinc-300">Caricamento…</main>}>
      <PaymentSuccessInner />
    </Suspense>
  );
}

function PaymentSuccessInner() {
  const params = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('EUR');
  const [groupId, setGroupId] = useState<string | null>(null);

  const [members, setMembers] = useState<GroupMember[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const sessionId = params.get('session_id');
        if (!sessionId) {
          setMsg('Manca session_id nella URL.');
          setLoading(false);
          return;
        }

        const r = await fetch(`/api/checkout/session?session_id=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const ct = r.headers.get('content-type') || '';
        const payload = ct.includes('application/json') ? await r.json() : { error: await r.text() };
        if (!r.ok) throw new Error((payload as any).error || 'Errore verifica pagamento');

        const data = payload as any;
        if (data.payment_status !== 'paid') {
          setMsg('Pagamento non confermato.');
          setLoading(false);
          return;
        }

        setAmount((data.amount_total ?? 0) / 100);
        setCurrency((data.currency || 'EUR').toUpperCase());
        const gId = data.metadata?.groupId || null;
        setGroupId(gId);

        const { data: auth } = await supabase.auth.getSession();
        const userId = auth.session?.user?.id;
        if (!userId) throw new Error('Non sei loggato.');

        const { data: reqs, error: reqErr } = await supabase
          .from('requests')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (reqErr) throw reqErr;
        const myRequestId = reqs?.[0]?.id as string | undefined;
        if (!myRequestId) throw new Error('Nessuna richiesta trovata per questo utente.');

        if (gId && myRequestId) {
          const { error: updErr } = await supabase
            .from('group_members')
            .update({
              price_share_cents: Math.round(data.amount_total ?? 0),
              status: 'paid', // commenta se non hai la colonna
            })
            .eq('group_id', gId)
            .eq('request_id', myRequestId);
          if (updErr) throw updErr;
        }

        if (gId) {
          const { data: mem, error } = await supabase
            .from('group_members')
            .select(`
              request_id,
              distance_km,
              price_share_cents,
              requests (
                id,
                user_id,
                users (
                  email
                )
              )
            `)
            .eq('group_id', gId);

          if (error) throw new Error(error.message);

          const mapped: GroupMember[] = (mem || []).map((m: any) => ({
            request_id: m.request_id,
            distance_km: m.distance_km,
            price_share_cents: m.price_share_cents,
            user_email:
              m.requests?.users?.email ??
              (Array.isArray(m.requests?.users) ? m.requests.users[0]?.email : null) ??
              null,
          }));

          setMembers(mapped);
        }

        setMsg('Pagamento registrato con successo ✅');
      } catch (e: any) {
        setMsg(e.message || 'Errore sconosciuto');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (loading) return <main className="p-6 text-zinc-300">Caricamento…</main>;

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-green-400">Pagamento riuscito</h1>

        {msg && (
          <div className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-xl p-4">
            {msg}
          </div>
        )}

        <div className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-xl p-4 space-y-1">
          <p>Importo pagato: <b>{amount?.toFixed(2)} {currency}</b></p>
          {groupId && <p>Codice gruppo: <b>{shortGroupCode(groupId)}</b></p>}
        </div>

        {members.length > 0 && (
          <div className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-xl p-4 space-y-2">
            <h2 className="font-medium">Membri del gruppo</h2>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.request_id} className="flex justify-between bg-zinc-950 rounded px-3 py-1">
                  <span>{m.user_email ?? '—'}</span>
                  <span>{m.price_share_cents != null ? `€${(m.price_share_cents / 100).toFixed(2)}` : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href="/"
          className="inline-block rounded-xl bg-white text-black px-4 py-2 font-medium"
        >
          Torna alla Home
        </a>
      </div>
    </main>
  );
}
