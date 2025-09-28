import Stripe from 'stripe';
import { NextResponse } from 'next/server';

// ✅ Usa la versione di default di Stripe per evitare l'errore TS
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: Request) {
  try {
    const { groupId, amountCents } = await req.json();

    if (!groupId || !amountCents) {
      return NextResponse.json(
        { error: 'Missing groupId or amount' },
        { status: 400 }
      );
    }

    // ✅ Creiamo la Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Condivisione corsa — gruppo ${groupId}`,
            },
            unit_amount: amountCents, // importo in centesimi
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/app/matches?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/app/matches?canceled=1`,
      metadata: { groupId },
    });

    // ✅ Risposta con l’ID della sessione
    return NextResponse.json({ sessionId: session.id });
  } catch (err: unknown) {
    // Cast sicuro per l'errore
    const error = err as { message?: string };
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
