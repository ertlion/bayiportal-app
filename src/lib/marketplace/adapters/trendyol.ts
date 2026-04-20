import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  RemoteProduct,
  StockUpdateResult,
} from "../types";

const BASE_URL = "https://apigw.trendyol.com";
const PAGE_SIZE = 200;
const USER_AGENT = "bayiportal-app - SelfIntegration";

function buildAuth(creds: MarketplaceCredentials): string {
  const token = Buffer.from(
    `${creds.trendyol_api_key}:${creds.trendyol_api_secret}`
  ).toString("base64");
  return `Basic ${token}`;
}

function headers(creds: MarketplaceCredentials): Record<string, string> {
  return {
    Authorization: buildAuth(creds),
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
}

interface TrendyolVariant {
  barcode: string;
  title: string;
  productCode: string;
  stockCode: string;
  quantity: number;
  images: Array<{ url: string }>;
  productMainId: string;
}

export class TrendyolAdapter implements MarketplaceAdapter {
  name = "trendyol" as const;

  async testConnection(
    creds: MarketplaceCredentials
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sellerId = creds.trendyol_seller_id;
      const res = await fetch(
        `${BASE_URL}/integration/sellers/${sellerId}/addresses`,
        { headers: headers(creds) }
      );

      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          error: `Trendyol baglanti hatasi (${res.status}): ${body}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Trendyol baglanti hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getProducts(
    creds: MarketplaceCredentials,
    page: number
  ): Promise<{ products: RemoteProduct[]; hasMore: boolean }> {
    try {
      const sellerId = creds.trendyol_seller_id;
      const url = `${BASE_URL}/integration/product/sellers/${sellerId}/products?page=${page}&size=${PAGE_SIZE}&approved=true`;

      const res = await fetch(url, { headers: headers(creds) });

      if (!res.ok) {
        throw new Error(`Trendyol urun listesi hatasi (${res.status})`);
      }

      const data = await res.json();
      const items: TrendyolVariant[] = data?.content ?? [];
      const totalPages: number = data?.totalPages ?? 0;

      // Trendyol returns each variant as a separate product.
      // Group by productMainId to form a single RemoteProduct per main product.
      const grouped = new Map<string, TrendyolVariant[]>();
      for (const item of items) {
        const key = item.productMainId ?? item.barcode;
        const list = grouped.get(key);
        if (list) {
          list.push(item);
        } else {
          grouped.set(key, [item]);
        }
      }

      const products: RemoteProduct[] = [];
      for (const [mainId, variants] of Array.from(grouped.entries())) {
        const first = variants[0];
        products.push({
          externalProductId: mainId,
          title: first.title,
          image: first.images?.[0]?.url ?? null,
          variants: variants.map((v) => ({
            id: v.barcode,
            title: v.title,
            sku: v.stockCode ?? null,
            barcode: v.barcode ?? null,
            stockQuantity: v.quantity ?? 0,
          })),
        });
      }

      return {
        products,
        hasMore: page + 1 < totalPages,
      };
    } catch (err) {
      throw new Error(
        `Trendyol urun listesi alinamadi: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async getStock(
    creds: MarketplaceCredentials,
    productId: string
  ): Promise<{
    success: boolean;
    variants: Array<{ externalVariantId: string; stockQuantity: number }>;
    error?: string;
  }> {
    try {
      const sellerId = creds.trendyol_seller_id;
      const url = `${BASE_URL}/integration/product/sellers/${sellerId}/products?productMainId=${encodeURIComponent(productId)}&approved=true`;

      const res = await fetch(url, { headers: headers(creds) });

      if (!res.ok) {
        return {
          success: false,
          variants: [],
          error: `Trendyol stok sorgulama hatasi (${res.status})`,
        };
      }

      const data = await res.json();
      const items: TrendyolVariant[] = data?.content ?? [];

      return {
        success: true,
        variants: items.map((item) => ({
          externalVariantId: item.barcode,
          stockQuantity: item.quantity ?? 0,
        })),
      };
    } catch (err) {
      return {
        success: false,
        variants: [],
        error: `Trendyol stok sorgulama hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async updateStock(
    creds: MarketplaceCredentials,
    updates: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    try {
      const sellerId = creds.trendyol_seller_id;
      const url = `${BASE_URL}/integration/inventory/sellers/${sellerId}/products/price-and-inventory`;

      const body = {
        items: updates.map((u) => ({
          barcode: u.externalVariantId,
          quantity: u.stockQuantity,
        })),
      };

      const res = await fetch(url, {
        method: "POST",
        headers: headers(creds),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `Trendyol stok guncelleme hatasi (${res.status}): ${text}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Trendyol stok guncelleme hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
