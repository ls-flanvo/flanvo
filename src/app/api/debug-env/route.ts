// src/app/api/debug-env/route.ts
export const runtime = 'nodejs';

export async function GET() {
  const t = process.env.MAPBOX_SECRET_TOKEN || '';

  return Response.json({
    hasMapboxSecret: Boolean(t),      // true se la variabile è presente
    tokenPrefix: t.slice(0, 3),       // mostra solo i primi caratteri (pk. o sk.)
    tokenLen: t.length,               // lunghezza del token
    nodeEnv: process.env.NODE_ENV,    // "production" o "development"
  });
}
