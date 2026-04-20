import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { shopifyProducts, marketplaceProducts } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { fetchAllShopifyProducts } from "@/lib/shopify";
import { getAdapter } from "@/lib/marketplace/registry";
import { decrypt } from "@/lib/crypto";
import { marketplaceCredentials } from "@/lib/schema";
import type { MarketplaceName } from "@/lib/marketplace/types";

/**
 * GET /api/products?source=shopify|trendyol|hepsiburada|n11|pazarama
 * Get cached products for the shop.
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const source = request.nextUrl.searchParams.get("source") || "shopify";

    if (source === "shopify") {
      const products = await db.query.shopifyProducts.findMany({
        where: eq(shopifyProducts.shopId, shop.id),
        orderBy: (t, { asc }) => [asc(t.title)],
      });
      return NextResponse.json({ products, total: products.length });
    }

    // Marketplace products
    const products = await db.query.marketplaceProducts.findMany({
      where: and(
        eq(marketplaceProducts.shopId, shop.id),
        eq(marketplaceProducts.marketplace, source),
      ),
      orderBy: (t, { asc }) => [asc(t.title)],
    });
    return NextResponse.json({ products, total: products.length });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/products
 * Fetch products from source and cache in DB.
 * Body: { source: "shopify" | "trendyol" | ... , page?: 0 }
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const { source, page = 0 } = await request.json();

    if (source === "shopify") {
      return await fetchAndCacheShopify(shop);
    }

    return await fetchAndCacheMarketplace(shop, source as MarketplaceName, page);
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function fetchAndCacheShopify(shop: { id: number; shopDomain: string; accessToken: string }) {
  const products = await fetchAllShopifyProducts(shop.shopDomain, shop.accessToken);

  for (const p of products) {
    await db.insert(shopifyProducts).values({
      shopId: shop.id,
      shopifyProductId: p.id,
      title: p.title,
      image: p.image,
      variants: p.variants,
      lastFetchedAt: new Date(),
    }).onConflictDoUpdate({
      target: [shopifyProducts.shopId, shopifyProducts.shopifyProductId],
      set: {
        title: p.title,
        image: p.image,
        variants: p.variants,
        lastFetchedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ fetched: products.length, hasMore: false });
}

async function fetchAndCacheMarketplace(
  shop: { id: number },
  marketplace: MarketplaceName,
  page: number
) {
  const cred = await db.query.marketplaceCredentials.findFirst({
    where: and(
      eq(marketplaceCredentials.shopId, shop.id),
      eq(marketplaceCredentials.marketplace, marketplace),
    ),
  });

  if (!cred) {
    return NextResponse.json({ error: `${marketplace} ayarları yapılandırılmamış` }, { status: 400 });
  }

  const decrypted = JSON.parse(decrypt(cred.credentials));
  const adapter = getAdapter(marketplace);
  const result = await adapter.getProducts(decrypted, page);

  for (const p of result.products) {
    await db.insert(marketplaceProducts).values({
      shopId: shop.id,
      marketplace,
      externalProductId: p.externalProductId,
      title: p.title,
      image: p.image,
      variants: p.variants,
      lastFetchedAt: new Date(),
    }).onConflictDoUpdate({
      target: [marketplaceProducts.shopId, marketplaceProducts.marketplace, marketplaceProducts.externalProductId],
      set: {
        title: p.title,
        image: p.image,
        variants: p.variants,
        lastFetchedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ fetched: result.products.length, hasMore: result.hasMore, page });
}
