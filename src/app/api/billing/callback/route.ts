import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shops } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { shopifyApi } from "@/lib/shopify";
import { PLANS, type PlanId } from "@/lib/plans";

const APP_URL = process.env.APP_URL!;

/**
 * GET /api/billing/callback?charge_id=xxx&shop=xxx&plan=starter
 * Shopify redirects here after merchant approves/declines the charge.
 */
export async function GET(request: NextRequest) {
  const chargeId = request.nextUrl.searchParams.get("charge_id");
  const shopDomain = request.nextUrl.searchParams.get("shop") || "";
  const plan = request.nextUrl.searchParams.get("plan") as PlanId || "starter";

  if (!chargeId || !shopDomain) {
    return NextResponse.redirect(new URL("/dashboard?billing=error", APP_URL));
  }

  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  if (!shop) {
    return NextResponse.redirect(new URL("/dashboard?billing=error", APP_URL));
  }

  try {
    // Check charge status
    const data = await shopifyApi<{
      recurring_application_charge: { id: number; status: string };
    }>(shopDomain, shop.accessToken, `recurring_application_charges/${chargeId}.json`);

    const charge = data.recurring_application_charge;

    if (charge.status === "accepted") {
      // Activate the charge
      await shopifyApi(shopDomain, shop.accessToken, `recurring_application_charges/${chargeId}/activate.json`, {
        method: "POST",
        body: { recurring_application_charge: { id: chargeId } },
      });

      // Update shop plan in DB
      const planDetails = PLANS[plan] || PLANS.starter;
      await db.update(shops).set({
        plan,
        productLimit: planDetails.productLimit,
        billingId: String(chargeId),
        updatedAt: new Date(),
      }).where(eq(shops.id, shop.id));

      return NextResponse.redirect(new URL(`/dashboard?billing=success&plan=${plan}`, APP_URL));
    }

    // Declined or other status
    return NextResponse.redirect(new URL("/dashboard?billing=declined", APP_URL));
  } catch (err) {
    console.error("[billing/callback] Error:", err);
    return NextResponse.redirect(new URL("/dashboard?billing=error", APP_URL));
  }
}
