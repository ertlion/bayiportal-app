import { db } from "./db";
import { syncLogs, productMatchings, shopifyProducts, shops } from "./schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { getTenantSetting } from "./tenant-settings";
import { notifyLowStock } from "./telegram";
import { sendStockChangeEmail } from "./mailer";

const DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour

interface VariantStockInfo {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  stockQuantity: number;
  marketplace: string;
}

/**
 * Check stock levels for changed variants and send notifications
 * when stock is at or below the alert threshold.
 *
 * Debounce: won't send the same alert more than once per hour
 * (checked via syncLogs with type "stock_alert").
 */
export async function checkAndNotifyStockAlerts(
  tenantId: number,
  changedVariantIds: string[]
): Promise<void> {
  if (changedVariantIds.length === 0) return;

  // Get threshold from tenant settings (default: 0 = only alert on zero stock)
  const thresholdStr = await getTenantSetting(tenantId, "stock_alert_threshold", "0");
  const threshold = parseInt(thresholdStr, 10) || 0;

  // Get shop info for notifications
  const [shop] = await db
    .select({ shopDomain: shops.shopDomain, email: shops.email })
    .from(shops)
    .where(eq(shops.id, tenantId))
    .limit(1);

  if (!shop) return;

  // Build variant info from product cache + matchings
  const variantsToCheck = await resolveVariantStockInfo(tenantId, changedVariantIds);

  const oneHourAgo = new Date(Date.now() - DEBOUNCE_MS);

  for (const variant of variantsToCheck) {
    // Only alert if stock is at or below threshold
    if (variant.stockQuantity > threshold) continue;

    // Debounce: check if we sent this alert recently
    const recentAlert = await db
      .select({ id: syncLogs.id })
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.shopId, tenantId),
          eq(syncLogs.type, "stock_alert"),
          gte(syncLogs.createdAt, oneHourAgo)
        )
      )
      .limit(1);

    // Check if this specific variant was alerted (via details jsonb is complex,
    // so we use summary field which contains the variant ID)
    const alreadySent = recentAlert.length > 0;
    if (alreadySent) {
      // Check more specifically if the summary mentions this variant
      const specificAlert = await db
        .select({ id: syncLogs.id })
        .from(syncLogs)
        .where(
          and(
            eq(syncLogs.shopId, tenantId),
            eq(syncLogs.type, "stock_alert"),
            eq(syncLogs.summary, `stock_alert:${variant.variantId}`),
            gte(syncLogs.createdAt, oneHourAgo)
          )
        )
        .limit(1);

      if (specificAlert.length > 0) continue;
    }

    // Send Telegram notification
    try {
      await notifyLowStock({
        shopDomain: shop.shopDomain,
        productTitle: variant.productTitle,
        variantTitle: variant.variantTitle,
        marketplace: variant.marketplace,
        currentStock: variant.stockQuantity,
        threshold,
      });
    } catch (err) {
      console.error("[stock-alerts] Telegram notification failed:", err);
    }

    // Send email notification
    if (shop.email) {
      try {
        await sendStockChangeEmail({
          to: shop.email,
          shopDomain: shop.shopDomain,
          productTitle: variant.productTitle,
          variantTitle: variant.variantTitle,
          marketplace: variant.marketplace,
          currentStock: variant.stockQuantity,
          threshold,
        });
      } catch (err) {
        console.error("[stock-alerts] Email notification failed:", err);
      }
    }

    // Log the alert for debouncing
    try {
      await db.insert(syncLogs).values({
        shopId: tenantId,
        type: "stock_alert",
        marketplace: variant.marketplace,
        summary: `stock_alert:${variant.variantId}`,
        details: {
          variantId: variant.variantId,
          productTitle: variant.productTitle,
          variantTitle: variant.variantTitle,
          stockQuantity: variant.stockQuantity,
          threshold,
        },
        status: "success",
      });
    } catch {
      // Log failure should not crash the flow
    }
  }
}

/**
 * Resolve variant IDs to full stock info from Shopify product cache + matchings.
 */
async function resolveVariantStockInfo(
  shopId: number,
  variantIds: string[]
): Promise<VariantStockInfo[]> {
  const result: VariantStockInfo[] = [];

  // Get product cache for this shop
  const products = await db
    .select()
    .from(shopifyProducts)
    .where(eq(shopifyProducts.shopId, shopId));

  // Build variantId -> product+variant info map
  const variantMap = new Map<string, { productTitle: string; variantTitle: string; stockQuantity: number }>();
  for (const product of products) {
    const variants = Array.isArray(product.variants)
      ? product.variants
      : typeof product.variants === "string"
        ? JSON.parse(product.variants as string)
        : [];

    for (const v of variants as Array<{ id: string; title: string; inventoryQuantity: number }>) {
      variantMap.set(String(v.id), {
        productTitle: product.title,
        variantTitle: v.title || "Default",
        stockQuantity: v.inventoryQuantity ?? 0,
      });
    }
  }

  // Get matchings to know the marketplace
  const matchings = await db
    .select({
      shopifyVariantId: productMatchings.shopifyVariantId,
      marketplace: productMatchings.marketplace,
    })
    .from(productMatchings)
    .where(
      and(
        eq(productMatchings.shopId, shopId),
        eq(productMatchings.isActive, true)
      )
    );

  const marketplaceMap = new Map<string, string>();
  for (const m of matchings) {
    marketplaceMap.set(m.shopifyVariantId, m.marketplace);
  }

  for (const variantId of variantIds) {
    const info = variantMap.get(variantId);
    if (!info) continue;

    result.push({
      variantId,
      productTitle: info.productTitle,
      variantTitle: info.variantTitle,
      stockQuantity: info.stockQuantity,
      marketplace: marketplaceMap.get(variantId) || "unknown",
    });
  }

  return result;
}
