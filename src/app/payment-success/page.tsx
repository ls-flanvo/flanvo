'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type GroupMember = {
  request_id: string;
  distance_km: number | null;
  price_share_cents: number | null;
  users?: { email: string | null };
};

export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const session_id = params.get('session_id');
      if (!session_id) {
        setMsg('Sessione di pagamento mancante.');
        setLoading(false);
        return;
      }

      try {
        // 1) Verifica la sessione Stripe
        const r = await fetch(`/api/checkout/session?session_id=${encodeURIComponent(session_id)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Errore verifica pagamento');

        setSessionData(data);
        const gId = data.metadata?.groupId || data.groupId;
        setGroupId(gId || null);

        // 2) Recupera membri gruppo da Supabase
        if (gId) {
          const { data: mem, error } = await supabase
            .from('group_members')
            .select('request_id, distance_km, price_share_cents, users(email)')
            .eq('group_id', gId);

          if (error) throw new Error(error.message);
          setMembers(mem || []);
        }
      } catch (e: any) {
        setMsg(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params]);

  if (loading) return <main className="p-6 text-zinc-300">Caricamento…</main>;

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-green-400">Pagamento riuscito ✅</h1>

        {msg && <div className="bg-red-900/50 rounded-lg p-3">{msg}</div>}

        {sessionData && (
          <div className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-xl p-4 space-y-2">
            <p>
              Hai pagato <b>€{(sessionData.amount_total / 100).toFixed(2)}</b> {sessionData.currency}.
            </p>
            <p>Stato sessione: {sessionData.payment_status}</p>
            {groupId && <p>ID Gruppo: {groupId}</p>}
          </div>
        )}

        {members.length > 0 && (
          <div className="bg-zinc-900/70 ring-1 ring-zinc-800 rounded-xl p-4 space-y-2">
            <h2 className="font-medium">Membri del gruppo</h2>
            <ul className="space-y-1 text-sm">
              {members.map((m, idx) => (
                <li key={idx} className="flex justify-between bg-zinc-950 rounded px-3 py-1">
                  <span>{m.users?.email || m.request_id}</span>
                  <span>
                    {m.price_share_cents ? `€${(m.price_share_cents / 100).toFixed(2)}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href="/matches"
          className="inline-block rounded-xl bg-white text-black px-4 py-2 font-medium"
        >
          Torna ai Matches
        </a>
      </div>
    </main>
  );
}
