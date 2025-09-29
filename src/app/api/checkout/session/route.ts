// src/app/api/checkout/session/route.ts
export const runtime = 'nodejs';

import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(STRIPE_KEY as string, { apiVersion: '2024-06-20' });

export async function GET(req: Request) {
  try {
    if (!STRIPE_KEY) {
      return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('session_id');
    if (!id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(id);

    return NextResponse.json({
      id: session.id,
      amount_total: session.amount_total,
      currency: (session.currency || 'eur').toUpperCase(),
      payment_status: session.payment_status,
      metadata: session.metadata,
      customer_email: session.customer_details?.email || null,
    });
  } catch (err: any) {
    console.error('Session verify error:', err);
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
