import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { shopifyApi } from "@/lib/shopify";

/**
 * Shopify Order shape (subset used by the dashboard).
 */
interface ShopifyOrder {
  id: number;
  name: string; // e.g. "#1001"
  email: string;
  created_at: string;
  financial_status: string; // paid, pending, refunded, etc.
  fulfillment_status: string | null; // null, fulfilled, partial
  total_price: string;
  currency: string;
  note: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    default_address?: {
      address1: string;
      city: string;
      province: string;
      phone: string;
    };
  } | null;
  shipping_address?: {
    name: string;
    address1: string;
    city: string;
    province: string;
    phone: string;
  };
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string | null;
  }>;
  fulfillments: Array<{
    tracking_number: string | null;
    tracking_url: string | null;
    tracking_company: string | null;
    status: string;
  }>;
}

/**
 * GET /api/orders
 * Fetch recent orders from Shopify.
 * Query params: status (any|open|closed|cancelled), limit (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const shop = await getShop(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "any";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 250);

    const data = await shopifyApi<{ orders: ShopifyOrder[] }>(
      shop.shopDomain,
      shop.accessToken,
      `orders.json?status=${status}&limit=${limit}&order=created_at+desc`,
    );

    const orders = (data.orders || []).map((o) => {
      const trackingNumber =
        o.fulfillments?.[0]?.tracking_number || null;
      const trackingUrl =
        o.fulfillments?.[0]?.tracking_url || null;
      const trackingCompany =
        o.fulfillments?.[0]?.tracking_company || null;

      return {
        id: o.id,
        name: o.name,
        email: o.email,
        createdAt: o.created_at,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        totalPrice: o.total_price,
        currency: o.currency,
        note: o.note,
        customerName: o.customer
          ? `${o.customer.first_name} ${o.customer.last_name}`.trim()
          : o.email,
        shippingAddress: o.shipping_address
          ? {
              name: o.shipping_address.name,
              address: o.shipping_address.address1,
              city: o.shipping_address.city,
              district: o.shipping_address.province,
              phone: o.shipping_address.phone,
            }
          : null,
        lineItems: o.line_items.map((li) => ({
          id: li.id,
          title: li.title,
          quantity: li.quantity,
          price: li.price,
          sku: li.sku,
        })),
        trackingNumber,
        trackingUrl,
        trackingCompany,
      };
    });

    return NextResponse.json({ orders });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
