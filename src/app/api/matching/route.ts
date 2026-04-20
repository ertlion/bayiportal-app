import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { productMatchings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/matching?marketplace=trendyol
 * List all matchings for the shop.
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const marketplace = request.nextUrl.searchParams.get("marketplace");

    const conditions = [eq(productMatchings.shopId, shop.id)];
    if (marketplace) conditions.push(eq(productMatchings.marketplace, marketplace));

    const matchings = await db.query.productMatchings.findMany({
      where: and(...conditions),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return NextResponse.json({
      matchings,
      total: matchings.length,
      limit: shop.productLimit,
      plan: shop.plan,
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/matching
 * Manual matching: link a Shopify variant to a marketplace variant.
 * Body: { marketplace, shopifyProductId, shopifyVariantId, shopifySku, shopifyBarcode, shopifyInventoryItemId, marketplaceProductId, marketplaceVariantId, marketplaceSku, marketplaceBarcode, shopifyTitle, marketplaceTitle }
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const body = await request.json();

    // Check plan limit
    const existingCount = await db.query.productMatchings.findMany({
      where: and(eq(productMatchings.shopId, shop.id), eq(productMatchings.isActive, true)),
      columns: { id: true },
    });

    if (existingCount.length >= shop.productLimit) {
      return NextResponse.json({
        error: `Plan limitinize ulaştınız (${shop.productLimit} ürün). Daha fazla eşleştirme için planınızı yükseltin.`,
      }, { status: 403 });
    }

    const [matching] = await db.insert(productMatchings).values({
      shopId: shop.id,
      marketplace: body.marketplace,
      shopifyProductId: body.shopifyProductId,
      shopifyVariantId: body.shopifyVariantId,
      shopifySku: body.shopifySku || null,
      shopifyBarcode: body.shopifyBarcode || null,
      shopifyInventoryItemId: body.shopifyInventoryItemId || null,
      shopifyTitle: body.shopifyTitle || null,
      marketplaceProductId: body.marketplaceProductId,
      marketplaceVariantId: body.marketplaceVariantId || null,
      marketplaceSku: body.marketplaceSku || null,
      marketplaceBarcode: body.marketplaceBarcode || null,
      marketplaceTitle: body.marketplaceTitle || null,
      matchType: "manual",
    }).onConflictDoUpdate({
      target: [productMatchings.shopId, productMatchings.marketplace, productMatchings.shopifyVariantId, productMatchings.marketplaceVariantId],
      set: { isActive: true, matchType: "manual", lastSyncAt: null },
    }).returning();

    return NextResponse.json({ matching });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/matching?id=123
 * Remove a matching.
 */
export async function DELETE(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const id = Number(request.nextUrl.searchParams.get("id"));

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.update(productMatchings).set({ isActive: false }).where(
      and(eq(productMatchings.id, id), eq(productMatchings.shopId, shop.id))
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
