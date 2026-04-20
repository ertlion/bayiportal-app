import { NextRequest, NextResponse } from "next/server";
import { getInstallUrl } from "@/lib/shopify";

/**
 * GET /api/auth/install?shop=xxx.myshopify.com
 * Redirects to Shopify OAuth consent screen.
 */
export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "Valid shop parameter required (xxx.myshopify.com)" }, { status: 400 });
  }

  const installUrl = getInstallUrl(shop);
  return NextResponse.redirect(installUrl);
}
