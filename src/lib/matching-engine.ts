import { db } from "./db";
import { shopifyProducts, marketplaceProducts, productMatchings, shops } from "./schema";
import { eq, and, count } from "drizzle-orm";

// ---------- Types for JSONB variant arrays ----------

interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string;
  inventoryQuantity: number;
}

interface MarketplaceVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
}

interface MatchResult {
  matched: number;
  unmatched: number;
  skipped: number;
  errors: string[];
}

// ---------- Helpers ----------

function normalizeIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function parseVariants<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
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

// ---------- Main engine ----------

/**
 * Auto-match Shopify products with marketplace products by barcode or SKU.
 *
 * Algorithm:
 * 1. Load all Shopify variants and marketplace variants from DB cache
 * 2. Build lookup maps: barcode -> marketplace variant, sku -> marketplace variant
 * 3. For each Shopify variant, try barcode match first, then SKU match
 * 4. Skip variants that already have an active matching record
 * 5. Respect plan product limits
 */
export async function autoMatchProducts(
  shopId: number,
  marketplace: string
): Promise<MatchResult> {
  const errors: string[] = [];
  let matched = 0;
  let unmatched = 0;
  let skipped = 0;

  // --- 1. Check plan limits ---
  const [shop] = await db
    .select({ productLimit: shops.productLimit })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  if (!shop) {
    return { matched: 0, unmatched: 0, skipped: 0, errors: ["Shop not found"] };
  }

  const [existingCount] = await db
    .select({ total: count() })
    .from(productMatchings)
    .where(
      and(
        eq(productMatchings.shopId, shopId),
        eq(productMatchings.marketplace, marketplace),
        eq(productMatchings.isActive, true)
      )
    );

  const currentMatchCount = existingCount?.total ?? 0;
  const remainingSlots = Math.max(0, shop.productLimit - currentMatchCount);

  if (remainingSlots <= 0) {
    return {
      matched: 0,
      unmatched: 0,
      skipped: 0,
      errors: [
        `Plan limiti doldu. Mevcut eslesme: ${currentMatchCount}, limit: ${shop.productLimit}. ` +
          "Daha fazla eslesme icin planınizi yükseltin.",
      ],
    };
  }

  // --- 2. Load products from DB cache ---
  const shopifyRows = await db
    .select()
    .from(shopifyProducts)
    .where(eq(shopifyProducts.shopId, shopId));

  const marketplaceRows = await db
    .select()
    .from(marketplaceProducts)
    .where(
      and(
        eq(marketplaceProducts.shopId, shopId),
        eq(marketplaceProducts.marketplace, marketplace)
      )
    );

  if (shopifyRows.length === 0) {
    return { matched: 0, unmatched: 0, skipped: 0, errors: ["Shopify urunleri bulunamadi. Once urunleri cekmeniz gerekiyor."] };
  }

  if (marketplaceRows.length === 0) {
    return { matched: 0, unmatched: 0, skipped: 0, errors: [`${marketplace} urunleri bulunamadi. Once urunleri cekmeniz gerekiyor.`] };
  }

  // --- 3. Load existing matchings to avoid duplicates ---
  const existingMatchings = await db
    .select({
      shopifyVariantId: productMatchings.shopifyVariantId,
      marketplaceVariantId: productMatchings.marketplaceVariantId,
    })
    .from(productMatchings)
    .where(
      and(
        eq(productMatchings.shopId, shopId),
        eq(productMatchings.marketplace, marketplace),
        eq(productMatchings.isActive, true)
      )
    );

  const alreadyMatchedShopify = new Set(
    existingMatchings.map((m) => m.shopifyVariantId)
  );
  const alreadyMatchedMarketplace = new Set(
    existingMatchings.map((m) => m.marketplaceVariantId)
  );

  // --- 4. Build marketplace lookup maps ---
  // Maps: normalizedBarcode -> { mpRow, variant }, normalizedSku -> { mpRow, variant }
  interface MpLookupEntry {
    mpRow: typeof marketplaceRows[number];
    variant: MarketplaceVariant;
  }

  const barcodeMap = new Map<string, MpLookupEntry>();
  const skuMap = new Map<string, MpLookupEntry>();

  for (const mpRow of marketplaceRows) {
    const variants = parseVariants<MarketplaceVariant>(mpRow.variants);
    for (const variant of variants) {
      if (alreadyMatchedMarketplace.has(variant.id)) continue;

      const normalizedBarcode = normalizeIdentifier(variant.barcode);
      if (normalizedBarcode) {
        barcodeMap.set(normalizedBarcode, { mpRow, variant });
      }

      const normalizedSku = normalizeIdentifier(variant.sku);
      if (normalizedSku) {
        skuMap.set(normalizedSku, { mpRow, variant });
      }
    }
  }

  // --- 5. Match Shopify variants ---
  const newMatchings: Array<typeof productMatchings.$inferInsert> = [];

  for (const spRow of shopifyRows) {
    const variants = parseVariants<ShopifyVariant>(spRow.variants);

    for (const sv of variants) {
      if (alreadyMatchedShopify.has(sv.id)) {
        skipped++;
        continue;
      }

      if (newMatchings.length >= remainingSlots) {
        unmatched++;
        continue;
      }

      const normalizedBarcode = normalizeIdentifier(sv.barcode);
      const normalizedSku = normalizeIdentifier(sv.sku);

      // Try barcode match first
      let matchEntry: MpLookupEntry | undefined;
      let matchType: "barcode" | "sku" = "barcode";

      if (normalizedBarcode) {
        matchEntry = barcodeMap.get(normalizedBarcode);
      }

      // Fallback to SKU match
      if (!matchEntry && normalizedSku) {
        matchEntry = skuMap.get(normalizedSku);
        matchType = "sku";
      }

      if (matchEntry) {
        const { mpRow, variant: mv } = matchEntry;

        newMatchings.push({
          shopId,
          marketplace,
          shopifyProductId: spRow.shopifyProductId,
          shopifyVariantId: sv.id,
          shopifyTitle: `${spRow.title} - ${sv.title}`,
          shopifySku: sv.sku,
          shopifyBarcode: sv.barcode,
          shopifyInventoryItemId: sv.inventoryItemId,
          marketplaceProductId: mpRow.externalProductId,
          marketplaceVariantId: mv.id,
          marketplaceTitle: `${mpRow.title} - ${mv.title}`,
          marketplaceSku: mv.sku,
          marketplaceBarcode: mv.barcode,
          matchType,
          isActive: true,
        });

        // Remove from maps so same marketplace variant is not matched twice
        const normalizedMvBarcode = normalizeIdentifier(mv.barcode);
        const normalizedMvSku = normalizeIdentifier(mv.sku);
        if (normalizedMvBarcode) barcodeMap.delete(normalizedMvBarcode);
        if (normalizedMvSku) skuMap.delete(normalizedMvSku);

        matched++;
      } else {
        unmatched++;
      }
    }
  }

  // --- 6. Bulk insert new matchings ---
  if (newMatchings.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < newMatchings.length; i += BATCH_SIZE) {
      const batch = newMatchings.slice(i, i + BATCH_SIZE);
      try {
        await db.insert(productMatchings).values(batch).onConflictDoNothing();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Batch insert hatasi (${i}-${i + batch.length}): ${msg}`);
        // Adjust counters: these were counted as matched but failed to persist
        matched -= batch.length;
        unmatched += batch.length;
      }
    }
  }

  return { matched, unmatched, skipped, errors };
}
