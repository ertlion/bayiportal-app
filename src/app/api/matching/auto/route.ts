import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { autoMatchProducts } from "@/lib/matching-engine";

/**
 * POST /api/matching/auto
 * Body: { marketplace: "trendyol" }
 * Runs auto-matching by barcode and SKU.
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const { marketplace } = await request.json();

    if (!marketplace) {
      return NextResponse.json({ error: "marketplace gerekli" }, { status: 400 });
    }

    const result = await autoMatchProducts(shop.id, marketplace);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
