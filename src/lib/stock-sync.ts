import { db } from "./db";
import {
  productMatchings,
  shops,
  marketplaceCredentials,
  syncLogs,
  shopifyProducts,
} from "./schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "./crypto";
import { shopifyApi } from "./shopify";
import type { MarketplaceAdapter, MarketplaceCredentials as MpCreds } from "./marketplace/types";
import { TrendyolAdapter } from "./marketplace/adapters/trendyol";

// ---------- Adapter Registry ----------

const adapters: Record<string, MarketplaceAdapter> = {
  trendyol: new TrendyolAdapter(),
};

function getAdapter(marketplace: string): MarketplaceAdapter {
  const adapter = adapters[marketplace];
  if (!adapter) {
    throw new Error(`Unsupported marketplace: ${marketplace}. Available: ${Object.keys(adapters).join(", ")}`);
  }
  return adapter;
}

// ---------- Types ----------

interface ShopifyVariantCache {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string;
  inventoryQuantity: number;
}

interface SyncStats {
  synced: number;
  skipped: number;
  errors: string[];
}

// ---------- Rate limiter ----------

/**
 * Simple in-memory token bucket rate limiter.
 * Prevents hammering external APIs during bulk sync.
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerSecond: number
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitMs = Math.ceil((1 / this.refillPerSecond) * 1000);
    await sleep(waitMs);
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 5 requests/second burst, refill 2/sec — safe for most marketplace APIs
const shopifyLimiter = new RateLimiter(4, 2);
const marketplaceLimiter = new RateLimiter(5, 2);

// ---------- Helpers ----------

async function getShopWithToken(shopId: number) {
  const [shop] = await db
    .select({
      id: shops.id,
      shopDomain: shops.shopDomain,
      accessToken: shops.accessToken,
      plan: shops.plan,
      productLimit: shops.productLimit,
      isActive: shops.isActive,
    })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  return shop ?? null;
}

async function getMarketplaceCredentials(
  shopId: number,
  marketplace: string
): Promise<MpCreds | null> {
  const [cred] = await db
    .select()
    .from(marketplaceCredentials)
    .where(
      and(
        eq(marketplaceCredentials.shopId, shopId),
        eq(marketplaceCredentials.marketplace, marketplace),
        eq(marketplaceCredentials.isActive, true)
      )
    )
    .limit(1);

  if (!cred) return null;

  try {
    const decrypted = decrypt(cred.credentials);
    return JSON.parse(decrypted) as MpCreds;
  } catch (err) {
    throw new Error(
      `Failed to decrypt ${marketplace} credentials for shop ${shopId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

async function writeSyncLog(
  shopId: number,
  marketplace: string,
  status: "success" | "error" | "partial",
  summary: string,
  details?: unknown,
  errorMessage?: string
): Promise<void> {
  try {
    await db.insert(syncLogs).values({
      shopId,
      type: "stock_sync",
      marketplace,
      summary,
      details: details ?? null,
      status,
      errorMessage: errorMessage ?? null,
    });
  } catch {
    // Logging failure should not crash the sync
    console.error(`[stock-sync] Failed to write sync log for shop ${shopId}`);
  }
}

function parseVariantsFromCache(raw: unknown): ShopifyVariantCache[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ---------- A) Shopify -> Marketplace ----------

/**
 * Called when a Shopify inventory_levels/update webhook fires.
 * Updates matched marketplace listings to reflect the new Shopify stock.
 *
 * Strategy: lower stock wins.
 * If Shopify went DOWN, someone bought on Shopify -> reduce marketplace to match.
 * If Shopify went UP (manual restock), set marketplace to the same level.
 */
export async function syncShopifyToMarketplace(
  shopId: number,
  shopifyVariantId: string,
  newQuantity: number
): Promise<SyncStats> {
  const stats: SyncStats = { synced: 0, skipped: 0, errors: [] };

  // Get all active matchings for this Shopify variant
  const matchings = await db
    .select()
    .from(productMatchings)
    .where(
      and(
        eq(productMatchings.shopId, shopId),
        eq(productMatchings.shopifyVariantId, shopifyVariantId),
        eq(productMatchings.isActive, true)
      )
    );

  if (matchings.length === 0) {
    stats.skipped++;
    return stats;
  }

  const shop = await getShopWithToken(shopId);
  if (!shop || !shop.isActive) {
    stats.errors.push("Shop not found or inactive");
    return stats;
  }

  // Group matchings by marketplace (a variant could be matched to multiple marketplaces on pro plan)
  const byMarketplace = new Map<string, typeof matchings>();
  for (const m of matchings) {
    const list = byMarketplace.get(m.marketplace) ?? [];
    list.push(m);
    byMarketplace.set(m.marketplace, list);
  }

  for (const [marketplace, mpMatchings] of byMarketplace) {
    let creds: MpCreds | null;
    try {
      creds = await getMarketplaceCredentials(shopId, marketplace);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`[${marketplace}] Credential error: ${msg}`);
      continue;
    }

    if (!creds) {
      stats.errors.push(`[${marketplace}] No active credentials found`);
      continue;
    }

    const adapter = getAdapter(marketplace);
    const updates: Array<{ externalVariantId: string; stockQuantity: number }> = [];

    for (const matching of mpMatchings) {
      if (!matching.marketplaceVariantId) {
        stats.errors.push(
          `[${marketplace}] Missing marketplace variant ID for matching ${matching.id}`
        );
        continue;
      }

      // Get current marketplace stock to apply "lower wins" rule
      try {
        await marketplaceLimiter.acquire();
        const mpStock = await adapter.getStock(creds, matching.marketplaceProductId);

        if (!mpStock.success) {
          stats.errors.push(
            `[${marketplace}] Stock query failed for product ${matching.marketplaceProductId}: ${mpStock.error}`
          );
          await updateMatchingStatus(matching.id, "error", mpStock.error ?? "Stock query failed");
          continue;
        }

        const mpVariant = mpStock.variants.find(
          (v) => v.externalVariantId === matching.marketplaceVariantId
        );

        if (!mpVariant) {
          stats.errors.push(
            `[${marketplace}] Variant ${matching.marketplaceVariantId} not found in marketplace response`
          );
          continue;
        }

        // Lower stock wins: if marketplace already lower, Shopify should also go down
        const targetQuantity = Math.min(newQuantity, mpVariant.stockQuantity);

        if (mpVariant.stockQuantity !== targetQuantity) {
          updates.push({
            externalVariantId: matching.marketplaceVariantId,
            stockQuantity: targetQuantity,
          });
        }

        // If Shopify is higher than the calculated target, adjust Shopify down too
        if (newQuantity > targetQuantity && matching.shopifyInventoryItemId) {
          try {
            await shopifyLimiter.acquire();
            await setShopifyInventory(
              shop.shopDomain,
              shop.accessToken,
              matching.shopifyInventoryItemId,
              targetQuantity
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            stats.errors.push(
              `[shopify] Failed to adjust Shopify stock for variant ${shopifyVariantId}: ${msg}`
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.errors.push(
          `[${marketplace}] Unexpected error for matching ${matching.id}: ${msg}`
        );
        await updateMatchingStatus(matching.id, "error", msg);
      }
    }

    // Batch update marketplace stock
    if (updates.length > 0) {
      try {
        await marketplaceLimiter.acquire();
        const result = await adapter.updateStock(creds, updates);

        if (result.success) {
          stats.synced += updates.length;
          for (const matching of mpMatchings) {
            await updateMatchingStatus(matching.id, "success");
          }
        } else {
          stats.errors.push(`[${marketplace}] Stock update failed: ${result.error}`);
          for (const matching of mpMatchings) {
            await updateMatchingStatus(matching.id, "error", result.error ?? "Update failed");
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.errors.push(`[${marketplace}] Stock update error: ${msg}`);
      }
    }
  }

  // Write sync log
  const logStatus = stats.errors.length === 0
    ? "success"
    : stats.synced > 0
      ? "partial"
      : "error";

  await writeSyncLog(
    shopId,
    matchings[0].marketplace,
    logStatus,
    `Shopify->MP sync: variant ${shopifyVariantId}, qty ${newQuantity}. ` +
      `Synced: ${stats.synced}, Errors: ${stats.errors.length}`,
    { shopifyVariantId, newQuantity, stats },
    stats.errors.length > 0 ? stats.errors.join("; ") : undefined
  );

  return stats;
}

// ---------- B) Marketplace -> Shopify (Cron) ----------

/**
 * Called by cron job. Polls all active matchings for a shop,
 * compares marketplace stock with Shopify stock, applies "lower wins" rule.
 */
export async function syncMarketplaceToShopify(shopId: number): Promise<SyncStats> {
  const stats: SyncStats = { synced: 0, skipped: 0, errors: [] };

  const shop = await getShopWithToken(shopId);
  if (!shop || !shop.isActive) {
    stats.errors.push("Shop not found or inactive");
    return stats;
  }

  // Get all active matchings
  const matchings = await db
    .select()
    .from(productMatchings)
    .where(
      and(
        eq(productMatchings.shopId, shopId),
        eq(productMatchings.isActive, true)
      )
    );

  if (matchings.length === 0) {
    stats.skipped++;
    return stats;
  }

  // Group by marketplace
  const byMarketplace = new Map<string, typeof matchings>();
  for (const m of matchings) {
    const list = byMarketplace.get(m.marketplace) ?? [];
    list.push(m);
    byMarketplace.set(m.marketplace, list);
  }

  // Load Shopify product cache for stock lookup
  const shopifyCache = await db
    .select()
    .from(shopifyProducts)
    .where(eq(shopifyProducts.shopId, shopId));

  // Build shopifyVariantId -> inventoryQuantity map from cache
  const shopifyStockMap = new Map<string, number>();
  for (const sp of shopifyCache) {
    const variants = parseVariantsFromCache(sp.variants);
    for (const v of variants) {
      shopifyStockMap.set(v.id, v.inventoryQuantity);
    }
  }

  for (const [marketplace, mpMatchings] of byMarketplace) {
    let creds: MpCreds | null;
    try {
      creds = await getMarketplaceCredentials(shopId, marketplace);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`[${marketplace}] Credential error: ${msg}`);
      continue;
    }

    if (!creds) {
      stats.errors.push(`[${marketplace}] No active credentials found`);
      continue;
    }

    const adapter = getAdapter(marketplace);

    // Group matchings by marketplace product to reduce API calls
    const byProduct = new Map<string, typeof mpMatchings>();
    for (const m of mpMatchings) {
      const list = byProduct.get(m.marketplaceProductId) ?? [];
      list.push(m);
      byProduct.set(m.marketplaceProductId, list);
    }

    // Collect marketplace stock updates to batch later
    const mpUpdates: Array<{ externalVariantId: string; stockQuantity: number }> = [];

    for (const [productId, productMatchingsList] of byProduct) {
      try {
        await marketplaceLimiter.acquire();
        const mpStock = await adapter.getStock(creds, productId);

        if (!mpStock.success) {
          stats.errors.push(
            `[${marketplace}] Stock query failed for product ${productId}: ${mpStock.error}`
          );
          for (const m of productMatchingsList) {
            await updateMatchingStatus(m.id, "error", mpStock.error ?? "Stock query failed");
          }
          continue;
        }

        // Build marketplace variant stock map
        const mpStockMap = new Map<string, number>();
        for (const v of mpStock.variants) {
          mpStockMap.set(v.externalVariantId, v.stockQuantity);
        }

        for (const matching of productMatchingsList) {
          try {
            const mpQty = matching.marketplaceVariantId
              ? mpStockMap.get(matching.marketplaceVariantId)
              : undefined;

            if (mpQty === undefined) {
              stats.errors.push(
                `[${marketplace}] Variant ${matching.marketplaceVariantId} not found in stock response`
              );
              continue;
            }

            const shopifyQty = shopifyStockMap.get(matching.shopifyVariantId);

            if (shopifyQty === undefined) {
              stats.errors.push(
                `[shopify] Variant ${matching.shopifyVariantId} not found in product cache. Stale cache?`
              );
              continue;
            }

            // Stocks are equal — nothing to do
            if (mpQty === shopifyQty) {
              stats.skipped++;
              await updateMatchingStatus(matching.id, "success");
              continue;
            }

            // Lower wins
            const targetQuantity = Math.min(mpQty, shopifyQty);

            // Update Shopify if it's higher
            if (shopifyQty > targetQuantity && matching.shopifyInventoryItemId) {
              await shopifyLimiter.acquire();
              await setShopifyInventory(
                shop.shopDomain,
                shop.accessToken,
                matching.shopifyInventoryItemId,
                targetQuantity
              );
              stats.synced++;
            }

            // Update marketplace if it's higher
            if (mpQty > targetQuantity && matching.marketplaceVariantId) {
              mpUpdates.push({
                externalVariantId: matching.marketplaceVariantId,
                stockQuantity: targetQuantity,
              });
              stats.synced++;
            }

            // If both needed update, synced was incremented twice — that's correct (two operations)
            await updateMatchingStatus(matching.id, "success");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            stats.errors.push(
              `[${marketplace}] Error processing matching ${matching.id}: ${msg}`
            );
            await updateMatchingStatus(matching.id, "error", msg);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.errors.push(
          `[${marketplace}] Error fetching stock for product ${productId}: ${msg}`
        );
      }
    }

    // Batch update marketplace stock (most marketplace APIs support batch)
    if (mpUpdates.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < mpUpdates.length; i += BATCH_SIZE) {
        const batch = mpUpdates.slice(i, i + BATCH_SIZE);
        try {
          await marketplaceLimiter.acquire();
          const result = await adapter.updateStock(creds, batch);
          if (!result.success) {
            stats.errors.push(`[${marketplace}] Batch stock update failed: ${result.error}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.errors.push(`[${marketplace}] Batch stock update error: ${msg}`);
        }
      }
    }
  }

  // Write sync log
  const logStatus = stats.errors.length === 0
    ? "success"
    : stats.synced > 0
      ? "partial"
      : "error";

  await writeSyncLog(
    shopId,
    "all",
    logStatus,
    `MP->Shopify cron sync. Synced: ${stats.synced}, Skipped: ${stats.skipped}, Errors: ${stats.errors.length}`,
    { matchingsCount: matchings.length, stats },
    stats.errors.length > 0 ? stats.errors.join("; ") : undefined
  );

  return stats;
}

// ---------- Shopify Inventory API ----------

/**
 * Set absolute inventory level for a Shopify inventory item.
 * Requires the shop's primary location_id, which we fetch once and cache per call chain.
 */
async function setShopifyInventory(
  shopDomain: string,
  accessToken: string,
  inventoryItemId: string,
  quantity: number
): Promise<void> {
  // Get the primary location
  const locationId = await getShopifyPrimaryLocation(shopDomain, accessToken);

  const response = await shopifyApi<{ inventory_level: unknown }>(
    shopDomain,
    accessToken,
    "inventory_levels/set.json",
    {
      method: "POST",
      body: {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: quantity,
      },
    }
  );

  if (!response) {
    throw new Error("Empty response from Shopify inventory_levels/set");
  }
}

// Simple in-memory cache for shop location IDs (cleared on process restart)
const locationCache = new Map<string, string>();

async function getShopifyPrimaryLocation(
  shopDomain: string,
  accessToken: string
): Promise<string> {
  const cached = locationCache.get(shopDomain);
  if (cached) return cached;

  const data = await shopifyApi<{ locations: Array<{ id: number; primary: boolean }> }>(
    shopDomain,
    accessToken,
    "locations.json"
  );

  const primary = data.locations.find((l) => l.primary) ?? data.locations[0];
  if (!primary) {
    throw new Error("No locations found for shop");
  }

  const locationId = String(primary.id);
  locationCache.set(shopDomain, locationId);
  return locationId;
}

// ---------- Matching status update ----------

async function updateMatchingStatus(
  matchingId: number,
  status: "success" | "error",
  error?: string
): Promise<void> {
  try {
    await db
      .update(productMatchings)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: error ?? null,
      })
      .where(eq(productMatchings.id, matchingId));
  } catch {
    // Non-critical: don't crash sync for a status update failure
  }
}
