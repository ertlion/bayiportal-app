import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { shopifyProducts, marketplaceProducts, productMatchings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number;
}

interface MarketplaceVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
}

function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * GET /api/products/export
 * Export all products with variants as CSV file.
 * Columns: Urun Adi, SKU, Barkod, Fiyat, Stok, Varyant, Shopify ID, Trendyol ID, HB ID, N11 ID
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);

    const products = await db.query.shopifyProducts.findMany({
      where: eq(shopifyProducts.shopId, shop.id),
      orderBy: (t, { asc }) => [asc(t.title)],
    });

    const matchings = await db.query.productMatchings.findMany({
      where: eq(productMatchings.shopId, shop.id),
    });

    // Build lookup: shopifyVariantId -> { trendyol, hepsiburada, n11 }
    const matchMap = new Map<
      string,
      { trendyol?: string; hepsiburada?: string; n11?: string }
    >();
    for (const m of matchings) {
      const existing = matchMap.get(m.shopifyVariantId) ?? {};
      if (m.marketplace === "trendyol") {
        existing.trendyol = m.marketplaceProductId;
      } else if (m.marketplace === "hepsiburada") {
        existing.hepsiburada = m.marketplaceProductId;
      } else if (m.marketplace === "n11") {
        existing.n11 = m.marketplaceProductId;
      }
      matchMap.set(m.shopifyVariantId, existing);
    }

    const header = [
      "Urun Adi",
      "SKU",
      "Barkod",
      "Varyant",
      "Stok",
      "Shopify ID",
      "Trendyol ID",
      "HB ID",
      "N11 ID",
    ];

    const rows: string[] = [header.map(escapeCsvField).join(",")];

    for (const product of products) {
      const variants = (product.variants ?? []) as ShopifyVariant[];

      if (variants.length === 0) {
        rows.push(
          [
            escapeCsvField(product.title),
            "",
            "",
            "",
            "0",
            escapeCsvField(product.shopifyProductId),
            "",
            "",
            "",
          ].join(",")
        );
        continue;
      }

      for (const v of variants) {
        const ids = matchMap.get(String(v.id)) ?? {};
        rows.push(
          [
            escapeCsvField(product.title),
            escapeCsvField(v.sku ?? ""),
            escapeCsvField(v.barcode ?? ""),
            escapeCsvField(v.title ?? ""),
            String(v.inventoryQuantity ?? 0),
            escapeCsvField(String(v.id)),
            escapeCsvField(ids.trendyol ?? ""),
            escapeCsvField(ids.hepsiburada ?? ""),
            escapeCsvField(ids.n11 ?? ""),
          ].join(",")
        );
      }
    }

    const csvContent = "\uFEFF" + rows.join("\r\n");

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="urunler.csv"',
      },
    });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: `CSV export hatasi: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
      },
      { status: 500 }
    );
  }
}
