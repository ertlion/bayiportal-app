import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify";
import { db } from "@/lib/db";
import { shops } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { queueFailedWebhook } from "@/lib/webhook-retry";
import { processWebhookRetry } from "@/lib/webhook-processor";

export async function POST(request: NextRequest) {
  const topic = request.headers.get("x-shopify-topic") || "";
  const shopDomain = request.headers.get("x-shopify-shop-domain") || "";
  const hmac = request.headers.get("x-shopify-hmac-sha256") || "";

  const body = await request.text();

  // Verify HMAC
  if (hmac && !verifyWebhookHmac(body, hmac)) {
    console.warn(`[webhook] Invalid HMAC from ${shopDomain}`);
  }

  // Find shop
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  if (!shop) {
    return NextResponse.json({ ok: true }); // Ack anyway
  }

  try {
    await processWebhookRetry(shop.id, topic, body);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] ${topic} error for ${shopDomain}:`, errorMsg);

    // Queue for retry instead of silently losing the webhook
    try {
      await queueFailedWebhook(shop.id, topic, body, errorMsg);
    } catch (queueErr) {
      console.error("[webhook] Failed to queue webhook for retry:", queueErr);
    }
  }

  return NextResponse.json({ ok: true });
}
