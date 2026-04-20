import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { marketplaceCredentials, shops } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/marketplace/registry";
import type { MarketplaceName } from "@/lib/marketplace/types";

/**
 * GET /api/settings
 * Get shop settings and configured marketplaces.
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);

    const creds = await db.query.marketplaceCredentials.findMany({
      where: eq(marketplaceCredentials.shopId, shop.id),
    });

    const configured = creds.map((c) => ({
      marketplace: c.marketplace,
      isActive: c.isActive,
      lastTestedAt: c.lastTestedAt,
      testResult: c.testResult,
    }));

    return NextResponse.json({
      shop: {
        domain: shop.shopDomain,
        plan: shop.plan,
        productLimit: shop.productLimit,
        marketplace: shop.marketplace,
      },
      marketplaces: configured,
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/settings
 * Save marketplace credentials.
 * Body: { marketplace: "trendyol", credentials: { trendyol_api_key: "...", ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const { marketplace, credentials } = await request.json() as {
      marketplace: MarketplaceName;
      credentials: Record<string, string>;
    };

    if (!marketplace || !credentials) {
      return NextResponse.json({ error: "marketplace and credentials required" }, { status: 400 });
    }

    // Test connection first
    const adapter = getAdapter(marketplace);
    const testResult = await adapter.testConnection(credentials);

    // Encrypt and save
    const encrypted = encrypt(JSON.stringify(credentials));

    await db.insert(marketplaceCredentials).values({
      shopId: shop.id,
      marketplace,
      credentials: encrypted,
      isActive: testResult.success,
      lastTestedAt: new Date(),
      testResult: testResult.success ? "success" : testResult.error || "Connection failed",
    }).onConflictDoUpdate({
      target: [marketplaceCredentials.shopId, marketplaceCredentials.marketplace],
      set: {
        credentials: encrypted,
        isActive: testResult.success,
        lastTestedAt: new Date(),
        testResult: testResult.success ? "success" : testResult.error || "Connection failed",
      },
    });

    // If free plan, set this as the active marketplace
    if (shop.plan === "free") {
      await db.update(shops).set({ marketplace, updatedAt: new Date() }).where(eq(shops.id, shop.id));
    }

    return NextResponse.json({
      success: testResult.success,
      error: testResult.error,
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
