'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';

export default function AuthPage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="text-2xl font-semibold">FLANVO</div>
            <p className="text-zinc-400">Accedi o registrati per iniziare</p>
          </div>
          <div className="rounded-2xl bg-zinc-900/80 p-6 ring-1 ring-zinc-800">
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#42E2EA',      // ciano FLANVO (provvisorio)
                      brandAccent: '#7AF0F5',
                      inputText: 'white',
                    },
                    radii: { borderRadius: '12px' },
                  },
                },
                className: {
                  container: 'space-y-4',
                  label: 'text-zinc-300',
                  button: 'bg-white text-black font-medium rounded-xl',
                  input:
                    'bg-zinc-950 border-zinc-800 text-white rounded-xl focus:border-zinc-600',
                },
              }}
              providers={['google', 'apple']}
              localization={{ variables: { sign_in: { email_label: 'Email' } } }}
              redirectTo="/app"
              onlyThirdPartyProviders={false}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Sei dentro ✨</h1>
        <p className="text-zinc-400">Vai alla tua area: <a className="underline" href="/app">/app</a></p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-4 rounded-xl px-4 py-2 bg-zinc-800 hover:bg-zinc-700"
        >
          Logout
        </button>
      </div>
    </main>
  );
}
