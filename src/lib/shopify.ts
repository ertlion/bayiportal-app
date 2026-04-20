import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || "read_products,read_inventory,write_inventory,read_orders";
const APP_URL = process.env.APP_URL!;

/** Generate Shopify OAuth install URL */
export function getInstallUrl(shop: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${APP_URL}/api/auth/callback`;
  return `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
}

/** Exchange code for permanent access token */
export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

/** Verify HMAC from Shopify */
export function verifyHmac(query: Record<string, string>): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  const sorted = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join("&");
  const computed = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(sorted).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(computed));
}

/** Verify webhook HMAC */
export function verifyWebhookHmac(body: string, hmacHeader: string): boolean {
  const computed = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(computed));
  } catch {
    return false;
  }
}

/** Shopify Admin API request */
export async function shopifyApi<T = unknown>(
  shop: string,
  accessToken: string,
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/2024-01/${endpoint}`, {
    method: options.method || "GET",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }

  return res.json();
}

/** Register webhooks for a shop */
export async function registerWebhooks(shop: string, accessToken: string): Promise<void> {
  const webhooks = [
    { topic: "products/update", address: `${APP_URL}/api/webhooks/shopify` },
    { topic: "inventory_levels/update", address: `${APP_URL}/api/webhooks/shopify` },
    { topic: "app/uninstalled", address: `${APP_URL}/api/webhooks/shopify` },
  ];

  for (const wh of webhooks) {
    try {
      await shopifyApi(shop, accessToken, "webhooks.json", {
        method: "POST",
        body: { webhook: { ...wh, format: "json" } },
      });
    } catch (err) {
      // Webhook might already exist
      console.warn(`Webhook ${wh.topic} registration:`, err);
    }
  }
}

/** Fetch all products from Shopify (paginated) */
export async function fetchAllShopifyProducts(
  shop: string,
  accessToken: string
): Promise<Array<{
  id: string;
  title: string;
  image: string | null;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    barcode: string | null;
    inventory_item_id: string;
    inventory_quantity: number;
  }>;
}>> {
  const all: any[] = [];
  let pageInfo: string | null = null;

  while (true) {
    const url = pageInfo
      ? `products.json?limit=250&page_info=${pageInfo}`
      : "products.json?limit=250&fields=id,title,images,variants";

    const data = await shopifyApi<{ products: any[] }>(shop, accessToken, url);
    all.push(...data.products);

    // Check for pagination
    // Shopify REST pagination uses Link headers, simplified here
    if (data.products.length < 250) break;
    // For simplicity, we'll use since_id pagination
    const lastId = data.products[data.products.length - 1]?.id;
    if (!lastId) break;
    pageInfo = null; // TODO: proper cursor pagination
    break; // For now, limit to first page
  }

  return all.map((p) => ({
    id: String(p.id),
    title: p.title,
    image: p.images?.[0]?.src || null,
    variants: (p.variants || []).map((v: any) => ({
      id: String(v.id),
      title: v.title,
      sku: v.sku || null,
      barcode: v.barcode || null,
      inventory_item_id: String(v.inventory_item_id),
      inventory_quantity: v.inventory_quantity ?? 0,
    })),
  }));
}
