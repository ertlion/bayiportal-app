import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { shops } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { shopifyApi } from "@/lib/shopify";
import { PLANS, type PlanId } from "@/lib/plans";

const APP_URL = process.env.APP_URL!;

/** GET /api/billing — Current plan info */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const plan = PLANS[shop.plan as PlanId] || PLANS.free;

    return NextResponse.json({
      currentPlan: shop.plan,
      planDetails: plan,
      productLimit: shop.productLimit,
      billingId: null, // Could check active charge
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** POST /api/billing — Create recurring charge for plan upgrade */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const { plan } = await request.json() as { plan: PlanId };

    if (!plan || !PLANS[plan] || plan === "free") {
      return NextResponse.json({ error: "Geçersiz plan" }, { status: 400 });
    }

    const planDetails = PLANS[plan];

    const data = await shopifyApi<{
      recurring_application_charge: { id: number; confirmation_url: string };
    }>(shop.shopDomain, shop.accessToken, "recurring_application_charges.json", {
      method: "POST",
      body: {
        recurring_application_charge: {
          name: `BayiPortal ${planDetails.name}`,
          price: planDetails.price,
          trial_days: planDetails.trialDays,
          return_url: `${APP_URL}/api/billing/callback?shop=${shop.shopDomain}&plan=${plan}`,
          test: true, // TODO: false for production
        },
      },
    });

    const charge = data.recurring_application_charge;

    return NextResponse.json({
      confirmationUrl: charge.confirmation_url,
      chargeId: charge.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Billing error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
