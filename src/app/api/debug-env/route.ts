// src/app/api/debug-env/route.ts
export const runtime = 'nodejs';

export async function GET() {
  const t = process.env.MAPBOX_SECRET_TOKEN || '';
  return Response.json({
    hasMapboxSecret: Boolean(t),
    tokenPrefix: t.slice(0, 3),   // "pk." o "sk."
    tokenLen: t.length,
    nodeEnv: process.env.NODE_ENV,
  });
}
