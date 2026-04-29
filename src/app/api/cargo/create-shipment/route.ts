import { NextRequest, NextResponse } from "next/server";
import { getShop } from "@/lib/session";
import { getTenantSettings } from "@/lib/tenant-settings";
import { getCargoAdapter } from "@/lib/cargo/registry";
import { shopifyApi } from "@/lib/shopify";
import type { CargoProvider, CargoShipmentRequest } from "@/lib/cargo/types";

const VALID_PROVIDERS: CargoProvider[] = ["yurtici", "aras", "mng"];

/**
 * POST /api/cargo/create-shipment
 * Body: { orderId: number, provider: CargoProvider }
 *
 * 1. Validates the provider
 * 2. Fetches order details from Shopify
 * 3. Reads tenant cargo settings (sender info + provider creds)
 * 4. Calls the cargo adapter to create shipment
 * 5. Creates a fulfillment in Shopify with the tracking number
 * 6. Returns the tracking info
 */
export async function POST(request: NextRequest) {
  try {
    const shop = await getShop(request);

    const body = (await request.json()) as {
      orderId: number;
      provider: string;
    };

    if (!body.orderId || !body.provider) {
      return NextResponse.json(
        { error: "orderId ve provider zorunlu" },
        { status: 400 },
      );
    }

    if (!VALID_PROVIDERS.includes(body.provider as CargoProvider)) {
      return NextResponse.json(
        { error: `Gecersiz kargo saglayici: ${body.provider}` },
        { status: 400 },
      );
    }

    const provider = body.provider as CargoProvider;
    const adapter = getCargoAdapter(provider);

    // Fetch tenant settings for cargo credentials + sender info
    const settings = await getTenantSettings(shop.id);

    // Collect provider-specific credentials
    const creds: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith(`${provider}_`)) {
        creds[key] = value;
      }
    }

    // Validate sender info
    const senderName = settings.cargo_sender_name;
    const senderAddress = settings.cargo_sender_address;
    const senderCity = settings.cargo_sender_city;
    const senderPhone = settings.cargo_sender_phone;

    if (!senderName || !senderAddress || !senderCity || !senderPhone) {
      return NextResponse.json(
        {
          error:
            "Kargo gonderici bilgileri eksik. Lutfen ayarlardan gonderici bilgilerini tamamlayin.",
        },
        { status: 400 },
      );
    }

    // Fetch the order from Shopify
    const orderData = await shopifyApi<{
      order: {
        id: number;
        name: string;
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
          grams: number;
        }>;
      };
    }>(shop.shopDomain, shop.accessToken, `orders/${body.orderId}.json`);

    const order = orderData.order;
    if (!order) {
      return NextResponse.json(
        { error: "Siparis bulunamadi" },
        { status: 404 },
      );
    }

    if (!order.shipping_address) {
      return NextResponse.json(
        { error: "Sipariste teslimat adresi bulunamadi" },
        { status: 400 },
      );
    }

    // Calculate total weight (in kg)
    const totalWeightGrams = order.line_items.reduce(
      (sum, li) => sum + (li.grams || 0) * li.quantity,
      0,
    );
    const totalWeightKg = Math.max(totalWeightGrams / 1000, 0.5); // min 0.5 kg

    const shipmentRequest: CargoShipmentRequest = {
      sender: {
        name: senderName,
        address: senderAddress,
        city: senderCity,
        phone: senderPhone,
      },
      receiver: {
        name: order.shipping_address.name,
        address: order.shipping_address.address1,
        city: order.shipping_address.city,
        district: order.shipping_address.province,
        phone: order.shipping_address.phone,
      },
      package: {
        orderNumber: order.name,
        weight: totalWeightKg,
        description: order.line_items.map((li) => li.title).join(", "),
        count: 1,
      },
    };

    // Create the shipment
    const result = await adapter.createShipment(creds, shipmentRequest);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Kargo olusturulamadi" },
        { status: 500 },
      );
    }

    // Create a fulfillment in Shopify with tracking info
    if (result.trackingNumber) {
      try {
        await shopifyApi(
          shop.shopDomain,
          shop.accessToken,
          `orders/${body.orderId}/fulfillments.json`,
          {
            method: "POST",
            body: {
              fulfillment: {
                tracking_number: result.trackingNumber,
                tracking_url: result.trackingUrl || null,
                tracking_company:
                  provider === "yurtici"
                    ? "Yurtici Kargo"
                    : provider === "aras"
                      ? "Aras Kargo"
                      : "MNG Kargo",
                notify_customer: true,
              },
            },
          },
        );
      } catch (fulfillmentErr) {
        // Shipment was created but fulfillment failed - still return success
        console.error("Fulfillment creation failed:", fulfillmentErr);
      }
    }

    return NextResponse.json({
      success: true,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
    });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
