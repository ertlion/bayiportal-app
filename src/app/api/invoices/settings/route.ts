import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { invoiceSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";
import { getInvoiceAdapter } from "@/lib/invoice/registry";
import type { InvoiceProvider } from "@/lib/invoice/types";

/**
 * GET /api/invoices/settings
 * Get invoice provider settings for the shop.
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);

    const settings = await db.query.invoiceSettings.findFirst({
      where: eq(invoiceSettings.shopId, shop.id),
    });

    if (!settings) {
      return NextResponse.json({ configured: false });
    }

    return NextResponse.json({
      configured: true,
      provider: settings.provider,
      isActive: settings.isActive,
      autoInvoice: settings.autoInvoice,
      lastTestedAt: settings.lastTestedAt,
      testResult: settings.testResult,
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/invoices/settings
 * Save invoice provider credentials.
 * Body: { provider: "uyumsoft", credentials: { ... }, autoInvoice?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const body = await request.json() as {
      provider: InvoiceProvider;
      credentials: Record<string, string>;
      autoInvoice?: boolean;
    };

    if (!body.provider || !body.credentials) {
      return NextResponse.json({ error: "provider and credentials required" }, { status: 400 });
    }

    const validProviders: InvoiceProvider[] = ["uyumsoft", "parasut", "logo", "elogo", "kolaybi"];
    if (!validProviders.includes(body.provider)) {
      return NextResponse.json({ error: "Gecersiz fatura saglayici" }, { status: 400 });
    }

    // Test connection first
    const adapter = getInvoiceAdapter(body.provider);
    const testResult = await adapter.testConnection(body.credentials);

    // Encrypt and save
    const encrypted = encrypt(JSON.stringify(body.credentials));

    const existing = await db.query.invoiceSettings.findFirst({
      where: eq(invoiceSettings.shopId, shop.id),
    });

    if (existing) {
      await db.update(invoiceSettings).set({
        provider: body.provider,
        credentials: encrypted,
        isActive: testResult.success,
        autoInvoice: body.autoInvoice ?? existing.autoInvoice,
        lastTestedAt: new Date(),
        testResult: testResult.success ? "success" : testResult.error || "Connection failed",
      }).where(eq(invoiceSettings.shopId, shop.id));
    } else {
      await db.insert(invoiceSettings).values({
        shopId: shop.id,
        provider: body.provider,
        credentials: encrypted,
        isActive: testResult.success,
        autoInvoice: body.autoInvoice ?? false,
        lastTestedAt: new Date(),
        testResult: testResult.success ? "success" : testResult.error || "Connection failed",
      });
    }

    return NextResponse.json({
      success: testResult.success,
      error: testResult.error,
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
