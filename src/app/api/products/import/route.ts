import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { shopifyProducts } from "@/lib/schema";
import { eq } from "drizzle-orm";

interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * POST /api/products/import
 * Accept CSV upload. Parse CSV and update stock quantities for matching SKUs/barcodes.
 * Does NOT create new products -- only updates existing variant stock.
 *
 * Expected CSV columns (header row required):
 *   SKU (or Barkod/Barcode), Stok (or Stock)
 *
 * Returns: { updated: number, skipped: number, errors: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "CSV dosyasi gerekli. 'file' alaninda gonderin." },
        { status: 400 }
      );
    }

    const text = await file.text();
    // Strip BOM if present
    const cleanText = text.replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/).filter((l) => l.trim() !== "");

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV dosyasi en az baslik satiri ve 1 veri satiri icermeli." },
        { status: 400 }
      );
    }

    // Parse header to find column indices
    const headerFields = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, "")
    );

    const skuIdx = headerFields.findIndex(
      (h) => h === "sku" || h === "skukodu"
    );
    const barcodeIdx = headerFields.findIndex(
      (h) =>
        h === "barkod" ||
        h === "barcode" ||
        h === "barkodkodu"
    );
    const stockIdx = headerFields.findIndex(
      (h) =>
        h === "stok" ||
        h === "stock" ||
        h === "miktar" ||
        h === "quantity"
    );

    if (skuIdx === -1 && barcodeIdx === -1) {
      return NextResponse.json(
        {
          error:
            "CSV basliginda 'SKU' veya 'Barkod' sutunu bulunamadi.",
        },
        { status: 400 }
      );
    }

    if (stockIdx === -1) {
      return NextResponse.json(
        {
          error:
            "CSV basliginda 'Stok' veya 'Stock' sutunu bulunamadi.",
        },
        { status: 400 }
      );
    }

    // Load all products for this shop
    const products = await db.query.shopifyProducts.findMany({
      where: eq(shopifyProducts.shopId, shop.id),
    });

    // Build lookup maps: sku -> { productId, variantIndex }, barcode -> same
    const skuMap = new Map<
      string,
      { productDbId: number; variantIdx: number }
    >();
    const barcodeMap = new Map<
      string,
      { productDbId: number; variantIdx: number }
    >();

    for (const product of products) {
      const variants = (product.variants ?? []) as ShopifyVariant[];
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (v.sku) {
          skuMap.set(v.sku.toLowerCase(), {
            productDbId: product.id,
            variantIdx: i,
          });
        }
        if (v.barcode) {
          barcodeMap.set(v.barcode.toLowerCase(), {
            productDbId: product.id,
            variantIdx: i,
          });
        }
      }
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Group updates by product DB id to batch
    const pendingUpdates = new Map<
      number,
      Array<{ variantIdx: number; stock: number }>
    >();

    for (let row = 1; row < lines.length; row++) {
      const fields = parseCsvLine(lines[row]);
      const sku = skuIdx !== -1 ? (fields[skuIdx] ?? "").trim() : "";
      const barcode =
        barcodeIdx !== -1 ? (fields[barcodeIdx] ?? "").trim() : "";
      const stockStr = (fields[stockIdx] ?? "").trim();

      const stockNum = parseInt(stockStr, 10);
      if (isNaN(stockNum) || stockNum < 0) {
        errors.push(`Satir ${row + 1}: Gecersiz stok degeri '${stockStr}'`);
        skipped++;
        continue;
      }

      // Find matching variant by SKU first, then barcode
      let match =
        sku ? skuMap.get(sku.toLowerCase()) : undefined;
      if (!match && barcode) {
        match = barcodeMap.get(barcode.toLowerCase());
      }

      if (!match) {
        skipped++;
        continue;
      }

      const existing = pendingUpdates.get(match.productDbId) ?? [];
      existing.push({ variantIdx: match.variantIdx, stock: stockNum });
      pendingUpdates.set(match.productDbId, existing);
    }

    // Apply updates per product
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const [productDbId, updates] of pendingUpdates) {
      const product = productById.get(productDbId);
      if (!product) continue;

      const variants = [...((product.variants ?? []) as ShopifyVariant[])];
      for (const u of updates) {
        if (variants[u.variantIdx]) {
          variants[u.variantIdx] = {
            ...variants[u.variantIdx],
            inventoryQuantity: u.stock,
          };
          updated++;
        }
      }

      await db
        .update(shopifyProducts)
        .set({ variants })
        .where(eq(shopifyProducts.id, productDbId));
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
    });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: `CSV import hatasi: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
      },
      { status: 500 }
    );
  }
}
