import { db } from "./db";
import { shops, productMatchings } from "./schema";
import { eq, and } from "drizzle-orm";

/**
 * Process a webhook body for retry purposes.
 * Extracted from the webhook route handler so it can be called
 * both from the live handler and the retry system.
 */
export async function processWebhookRetry(
  shopId: number,
  topic: string,
  body: string
): Promise<void> {
  const data = JSON.parse(body);

  switch (topic) {
    case "inventory_levels/update":
      await handleInventoryUpdate(shopId, data);
      break;

    case "products/update":
      // Could refresh product cache
      break;

    case "app/uninstalled":
      await db
        .update(shops)
        .set({
          isActive: false,
          uninstalledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(shops.id, shopId));
      break;

    default:
      console.warn(`[webhook-processor] Unknown topic: ${topic}`);
  }
}

async function handleInventoryUpdate(
  shopId: number,
  data: { inventory_item_id: number; available: number; location_id: number }
): Promise<void> {
  const inventoryItemId = String(data.inventory_item_id);
  const newQuantity = data.available;

  const matching = await db.query.productMatchings.findFirst({
    where: and(
      eq(productMatchings.shopId, shopId),
      eq(productMatchings.shopifyInventoryItemId, inventoryItemId),
      eq(productMatchings.isActive, true)
    ),
  });

  if (!matching) return;

  const { syncShopifyToMarketplace } = await import("./stock-sync");
  await syncShopifyToMarketplace(shopId, matching.shopifyVariantId, newQuantity);
}
