import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { invoices, invoiceSettings } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { getInvoiceAdapter } from "@/lib/invoice/registry";
import type { InvoiceProvider, InvoiceItem } from "@/lib/invoice/types";

/**
 * GET /api/invoices
 * List invoices for the shop.
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);

    const list = await db.query.invoices.findMany({
      where: eq(invoices.shopId, shop.id),
      orderBy: [desc(invoices.createdAt)],
      limit: 100,
    });

    return NextResponse.json({ invoices: list });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/invoices
 * Create an invoice manually.
 * Body: {
 *   orderNumber, orderSource?, customerName, customerTaxId?, customerTaxOffice?,
 *   customerAddress?, customerCity?, items: InvoiceItem[], totalAmount, currency?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);

    // Get invoice settings
    const settings = await db.query.invoiceSettings.findFirst({
      where: eq(invoiceSettings.shopId, shop.id),
    });

    if (!settings || !settings.isActive) {
      return NextResponse.json({ error: "Fatura entegrasyonu yapilandirilmamis veya aktif degil" }, { status: 400 });
    }

    const body = await request.json() as {
      orderNumber: string;
      orderSource?: string;
      customerName: string;
      customerTaxId?: string;
      customerTaxOffice?: string;
      customerAddress?: string;
      customerCity?: string;
      items: InvoiceItem[];
      totalAmount: number;
      currency?: string;
    };

    // Input validation
    if (!body.orderNumber || !body.customerName || !body.items || body.items.length === 0 || !body.totalAmount) {
      return NextResponse.json({ error: "orderNumber, customerName, items ve totalAmount zorunlu" }, { status: 400 });
    }

    for (const item of body.items) {
      if (!item.name || typeof item.quantity !== "number" || typeof item.unitPrice !== "number" || typeof item.vatRate !== "number") {
        return NextResponse.json({ error: "Her kalem icin name, quantity, unitPrice ve vatRate zorunlu" }, { status: 400 });
      }
    }

    // Decrypt credentials
    const creds = JSON.parse(decrypt(settings.credentials)) as Record<string, string>;
    const provider = settings.provider as InvoiceProvider;
    const adapter = getInvoiceAdapter(provider);

    // Create the invoice via the provider
    const result = await adapter.createInvoice(creds, {
      customerName: body.customerName,
      customerTaxId: body.customerTaxId,
      customerTaxOffice: body.customerTaxOffice,
      customerAddress: body.customerAddress,
      customerCity: body.customerCity,
      items: body.items,
      totalAmount: body.totalAmount,
      currency: body.currency || "TRY",
      orderNumber: body.orderNumber,
      orderDate: new Date().toISOString(),
    });

    // Save to database
    const [invoice] = await db.insert(invoices).values({
      shopId: shop.id,
      provider,
      externalInvoiceId: result.externalId || null,
      orderNumber: body.orderNumber,
      orderSource: body.orderSource || null,
      customerName: body.customerName,
      customerTaxId: body.customerTaxId || null,
      customerTaxOffice: body.customerTaxOffice || null,
      totalAmount: String(body.totalAmount),
      currency: body.currency || "TRY",
      status: result.success ? "sent" : "error",
      errorMessage: result.error || null,
      pdfUrl: result.pdfUrl || null,
      items: body.items,
    }).returning();

    return NextResponse.json({
      success: result.success,
      invoice,
      error: result.error,
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
