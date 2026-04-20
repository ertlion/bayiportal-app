import { NextRequest } from "next/server";
import { db } from "./db";
import { shops } from "./schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const SESSION_SECRET = process.env.SHOPIFY_API_SECRET || "fallback-secret";

interface SessionPayload {
  shopId: number;
  shop: string;
  exp: number;
}

export function encodeSession(shopId: number, shopDomain: string): string {
  const payload: SessionPayload = {
    shopId,
    shop: shopDomain,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64");
  return `${encoded}.${sig}`;
}

export function decodeSession(cookie: string): SessionPayload | null {
  try {
    const [encoded, sig] = cookie.split(".");
    if (!encoded || !sig) return null;

    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64").toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Get authenticated shop from request, throw 401 response if invalid */
export async function getShop(request: NextRequest): Promise<{ id: number; shopDomain: string; accessToken: string; plan: string; productLimit: number; marketplace: string | null }> {
  const cookie = request.cookies.get("bp_session")?.value;
  if (!cookie) throw new Response("Unauthorized", { status: 401 });

  const session = decodeSession(cookie);
  if (!session) throw new Response("Unauthorized", { status: 401 });

  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, session.shopId),
  });

  if (!shop || !shop.isActive) throw new Response("Shop not found", { status: 404 });

  return {
    id: shop.id,
    shopDomain: shop.shopDomain,
    accessToken: shop.accessToken,
    plan: shop.plan,
    productLimit: shop.productLimit,
    marketplace: shop.marketplace,
  };
}
