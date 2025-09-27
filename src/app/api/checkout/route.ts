import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

export async function POST(req: Request) {
  try {
    const { groupId, amountCents } = await req.json();

    if (!groupId || !amountCents) {
      return NextResponse.json(
        { error: 'Missing groupId or amount' },
        { status: 400 }
      );
    }

    // ✅ Creiamo una Checkout Session
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

    // ✅ Risposta col sessionId
    return NextResponse.json({ sessionId: session.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
