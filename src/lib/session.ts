import { NextRequest } from "next/server";
import { db } from "./db";
import { shops } from "./schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;

interface SessionTokenPayload {
  iss: string;  // https://{shop}.myshopify.com/admin
  dest: string; // https://{shop}.myshopify.com
  aud: string;  // API key
  sub: string;  // user ID
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

/**
 * Base64url decode (JWT uses base64url, not standard base64).
 */
function base64urlDecode(input: string): Buffer {
  // Replace base64url chars with standard base64
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/**
 * Verify a Shopify Session Token (JWT signed with HS256 using SHOPIFY_API_SECRET).
 * Returns the decoded payload if valid, throws otherwise.
 */
export function verifySessionToken(token: string): { shop: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify HMAC-SHA256 signature
  const signInput = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(signInput)
    .digest();
  const actualSig = base64urlDecode(signatureB64);

  if (expectedSig.length !== actualSig.length) {
    throw new Error("Invalid token signature");
  }
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) {
    throw new Error("Invalid token signature");
  }

  // Decode payload
  const payload: SessionTokenPayload = JSON.parse(
    base64urlDecode(payloadB64).toString("utf-8")
  );

  // Verify expiration (exp is in seconds)
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    throw new Error("Token expired");
  }

  // Verify audience matches our API key
  if (payload.aud !== SHOPIFY_API_KEY) {
    throw new Error("Invalid token audience");
  }

  // Extract shop domain from dest (e.g. "https://shop.myshopify.com" -> "shop.myshopify.com")
  let shopDomain: string;
  try {
    const url = new URL(payload.dest);
    shopDomain = url.hostname;
  } catch {
    // Fallback: strip protocol manually
    shopDomain = payload.dest.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  return { shop: shopDomain };
}

/** Get authenticated shop from request via Shopify Session Token (Authorization: Bearer header) */
export async function getShop(request: NextRequest): Promise<{
  id: number;
  shopDomain: string;
  accessToken: string;
  plan: string;
  productLimit: number;
  marketplace: string | null;
}> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Response("Unauthorized: Missing session token", { status: 401 });
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  let shopDomain: string;
  try {
    const result = verifySessionToken(token);
    shopDomain = result.shop;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    throw new Response(`Unauthorized: ${message}`, { status: 401 });
  }

  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  if (!shop || !shop.isActive) {
    throw new Response("Shop not found or inactive", { status: 404 });
  }

  return {
    id: shop.id,
    shopDomain: shop.shopDomain,
    accessToken: shop.accessToken,
    plan: shop.plan,
    productLimit: shop.productLimit,
    marketplace: shop.marketplace,
  };
}
