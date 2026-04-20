import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, verifyHmac, registerWebhooks, shopifyApi } from "@/lib/shopify";
import { db } from "@/lib/db";
import { shops } from "@/lib/schema";
import { eq } from "drizzle-orm";

const APP_URL = process.env.APP_URL!;

/**
 * GET /api/auth/callback?code=xxx&hmac=xxx&shop=xxx&state=xxx&host=xxx
 * Shopify OAuth callback — exchange code for token, create/update shop.
 * Redirects to /dashboard with shop and host params (no cookie — frontend uses session tokens).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const shop = searchParams.get("shop") || "";
  const code = searchParams.get("code") || "";
  const hmac = searchParams.get("hmac") || "";
  const host = searchParams.get("host") || "";

  if (!shop || !code) {
    return NextResponse.json({ error: "Missing shop or code" }, { status: 400 });
  }

  // Verify HMAC
  const queryParams: Record<string, string> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  if (!verifyHmac(queryParams)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 403 });
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(shop, code);
  } catch (err) {
    console.error("Token exchange failed:", err);
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  // Get shop info from Shopify
  let shopInfo: { name: string; email: string } = { name: shop, email: "" };
  try {
    const data = await shopifyApi<{ shop: { name: string; email: string } }>(shop, accessToken, "shop.json");
    shopInfo = { name: data.shop.name, email: data.shop.email };
  } catch {
    // Not critical
  }

  // Create or update shop in DB
  let existingShop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shop),
  });

  if (existingShop) {
    // Re-install — update token
    await db.update(shops).set({
      accessToken,
      shopName: shopInfo.name,
      email: shopInfo.email,
      isActive: true,
      uninstalledAt: null,
      updatedAt: new Date(),
    }).where(eq(shops.id, existingShop.id));
  } else {
    // New install
    const [inserted] = await db.insert(shops).values({
      shopDomain: shop,
      accessToken,
      shopName: shopInfo.name,
      email: shopInfo.email,
      plan: "free",
      productLimit: 10,
    }).returning();
    existingShop = inserted;
  }

  // Register webhooks
  try {
    await registerWebhooks(shop, accessToken);
  } catch (err) {
    console.error("Webhook registration failed:", err);
  }

  // Redirect to dashboard with shop and host params
  // Frontend will use App Bridge to get session tokens — no cookie needed
  const redirectUrl = new URL("/dashboard", APP_URL);
  redirectUrl.searchParams.set("shop", shop);
  if (host) {
    redirectUrl.searchParams.set("host", host);
  }

  return NextResponse.redirect(redirectUrl);
}
