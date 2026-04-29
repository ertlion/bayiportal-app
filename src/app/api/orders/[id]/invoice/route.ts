import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { db } from "@/lib/db";
import { invoices, invoiceSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { getInvoiceAdapter } from "@/lib/invoice/registry";
import { shopifyApi } from "@/lib/shopify";
import type { InvoiceProvider, InvoiceItem } from "@/lib/invoice/types";

/**
 * POST /api/orders/[id]/invoice
 * Create an e-invoice for a Shopify order.
 *
 * Fetches order details from Shopify, constructs invoice items
 * from line items, and creates the invoice via the configured provider.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const shop = await getShop(request);
    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        { error: "Siparis ID zorunlu" },
        { status: 400 },
      );
    }

    // Get invoice settings
    const settings = await db.query.invoiceSettings.findFirst({
      where: eq(invoiceSettings.shopId, shop.id),
    });

    if (!settings || !settings.isActive) {
      return NextResponse.json(
        {
          error:
            "Fatura entegrasyonu yapilandirilmamis veya aktif degil",
        },
        { status: 400 },
      );
    }

    // Fetch the order from Shopify
    const orderData = await shopifyApi<{
      order: {
        id: number;
        name: string;
        created_at: string;
        total_price: string;
        currency: string;
        note: string | null;
        customer: {
          first_name: string;
          last_name: string;
          email: string;
        } | null;
        billing_address?: {
          name: string;
          address1: string;
          city: string;
          province: string;
          company: string | null;
        };
        shipping_address?: {
          name: string;
          address1: string;
          city: string;
        };
        line_items: Array<{
          id: number;
          title: string;
          quantity: number;
          price: string;
          tax_lines: Array<{
            rate: number;
            price: string;
          }>;
        }>;
      };
    }>(shop.shopDomain, shop.accessToken, `orders/${orderId}.json`);

    const order = orderData.order;
    if (!order) {
      return NextResponse.json(
        { error: "Siparis bulunamadi" },
        { status: 404 },
      );
    }

    // Build customer info from billing address or customer
    const billingAddr = order.billing_address;
    const customerName =
      billingAddr?.company ||
      billingAddr?.name ||
      (order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
        : "Bilinmeyen Musteri");

    const customerAddress = billingAddr?.address1 || "";
    const customerCity = billingAddr?.city || "";

    // Build invoice items from line items
    const invoiceItems: InvoiceItem[] = order.line_items.map((li) => {
      const unitPrice = parseFloat(li.price);
      const vatRate =
        li.tax_lines?.[0]?.rate != null
          ? Math.round(li.tax_lines[0].rate * 100)
          : 20; // Default 20% KDV
      const totalPrice =
        Math.round(
          li.quantity * unitPrice * (1 + vatRate / 100) * 100,
        ) / 100;

      return {
        name: li.title,
        quantity: li.quantity,
        unitPrice,
        vatRate,
        totalPrice,
      };
    });

    const totalAmount = parseFloat(order.total_price);

    // Decrypt credentials
    const creds = JSON.parse(decrypt(settings.credentials)) as Record<
      string,
      string
    >;
    const provider = settings.provider as InvoiceProvider;
    const adapter = getInvoiceAdapter(provider);

    // Create the invoice
    const result = await adapter.createInvoice(creds, {
      customerName,
      customerAddress,
      customerCity,
      items: invoiceItems,
      totalAmount,
      currency: order.currency || "TRY",
      orderNumber: order.name,
      orderDate: order.created_at,
    });

    // Save to database
    const [invoice] = await db
      .insert(invoices)
      .values({
        shopId: shop.id,
        provider,
        externalInvoiceId: result.externalId || null,
        orderNumber: order.name,
        orderSource: "shopify",
        customerName,
        totalAmount: String(totalAmount),
        currency: order.currency || "TRY",
        status: result.success ? "sent" : "error",
        errorMessage: result.error || null,
        pdfUrl: result.pdfUrl || null,
        items: invoiceItems,
      })
      .returning();

    // If successful, add a note to the Shopify order
    if (result.success && result.externalId) {
      try {
        const existingNote = order.note || "";
        const invoiceNote = `[INVOICE:${result.externalId}]`;
        if (!existingNote.includes("[INVOICE:")) {
          await shopifyApi(
            shop.shopDomain,
            shop.accessToken,
            `orders/${orderId}.json`,
            {
              method: "PUT",
              body: {
                order: {
                  id: parseInt(orderId, 10),
                  note: existingNote
                    ? `${existingNote}\n${invoiceNote}`
                    : invoiceNote,
                },
              },
            },
          );
        }
      } catch {
        // Note update failed, non-critical
      }
    }

    return NextResponse.json({
      success: result.success,
      invoiceId: invoice.id,
      externalId: result.externalId,
      error: result.error,
    });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
