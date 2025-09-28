'use client';

import { Auth, ThemeSupa } from '@supabase/auth-ui-react';
import { supabase } from '@/lib/supabaseClient';

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900/70 ring-1 ring-zinc-800 rounded-2xl p-6">
        <h1 className="text-lg font-semibold mb-4">Accedi</h1>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#42E2EA',
                  brandAccent: '#7AF0F5',
                  inputText: 'white',
                },
                radii: {
                  buttonBorderRadius: '12px',
                  inputBorderRadius: '12px',
                },
              },
            },
          }}
          // Nessun providers: resta solo email/password/magic link (in base a Supabase)
          localization={{ variables: { sign_in: { email_label: 'Email' } } }}
          redirectTo="/app"
        />
      </div>
    </main>
  );
}

