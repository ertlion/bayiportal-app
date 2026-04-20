import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shops } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 240;

/**
 * GET /api/cron/sync?secret=xxx
 * Periodic sync: pull stock from marketplaces, push to Shopify.
 * Called every 5 minutes by cron.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeShops = await db.query.shops.findMany({
    where: eq(shops.isActive, true),
  });

  const results: Record<number, unknown> = {};

  for (const shop of activeShops) {
    try {
      const { syncMarketplaceToShopify } = await import("@/lib/stock-sync");
      const result = await syncMarketplaceToShopify(shop.id);
      results[shop.id] = result;
    } catch (err) {
      results[shop.id] = { error: err instanceof Error ? err.message : "Unknown" };
    }
  }

  return NextResponse.json({ success: true, shopsProcessed: activeShops.length, results });
}
