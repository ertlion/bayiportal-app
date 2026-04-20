import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify";
import { db } from "@/lib/db";
import { shops, productMatchings, syncLogs } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const topic = request.headers.get("x-shopify-topic") || "";
  const shopDomain = request.headers.get("x-shopify-shop-domain") || "";
  const hmac = request.headers.get("x-shopify-hmac-sha256") || "";

  const body = await request.text();

  // Verify HMAC
  if (hmac && !verifyWebhookHmac(body, hmac)) {
    console.warn(`[webhook] Invalid HMAC from ${shopDomain}`);
  }

  const data = JSON.parse(body);

  // Find shop
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  if (!shop) {
    return NextResponse.json({ ok: true }); // Ack anyway
  }

  try {
    switch (topic) {
      case "inventory_levels/update":
        await handleInventoryUpdate(shop.id, data);
        break;

      case "products/update":
        // Could refresh product cache, but inventory_levels/update is more precise
        break;

      case "app/uninstalled":
        await db.update(shops).set({
          isActive: false,
          uninstalledAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(shops.id, shop.id));
        break;
    }
  } catch (err) {
    console.error(`[webhook] ${topic} error for ${shopDomain}:`, err);
  }

  return NextResponse.json({ ok: true });
}

async function handleInventoryUpdate(shopId: number, data: { inventory_item_id: number; available: number; location_id: number }) {
  const inventoryItemId = String(data.inventory_item_id);
  const newQuantity = data.available;

  // Find matching by inventoryItemId
  const matching = await db.query.productMatchings.findFirst({
    where: and(
      eq(productMatchings.shopId, shopId),
      eq(productMatchings.shopifyInventoryItemId, inventoryItemId),
      eq(productMatchings.isActive, true),
    ),
  });

  if (!matching) return; // Not a matched product

  // Lazy import to avoid circular
  const { syncShopifyToMarketplace } = await import("@/lib/stock-sync");
  await syncShopifyToMarketplace(shopId, matching.shopifyVariantId, newQuantity);
}
