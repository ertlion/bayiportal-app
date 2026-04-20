import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  RemoteProduct,
  StockUpdateResult,
} from "../types";

const PRODUCTS_BASE = "https://mpop-sit.hepsiburada.com";
const LISTING_BASE = "https://listing-external.hepsiburada.com";
const PAGE_SIZE = 100;
const USER_AGENT = "kalemyazilim_dev";

function buildAuth(creds: MarketplaceCredentials): string {
  const token = Buffer.from(
    `${creds.hb_merchant_id}:${creds.hb_password}`
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

interface HBProduct {
  hepsiburadaSku: string;
  merchantSku: string;
  productName: string;
  barcode: string;
  availableStock: number;
  imageUrl?: string;
}

export class HepsiburadaAdapter implements MarketplaceAdapter {
  name = "hepsiburada" as const;

  async testConnection(
    creds: MarketplaceCredentials
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.getProducts(creds, 0);
      // If getProducts doesn't throw, connection is valid
      void result;
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Hepsiburada baglanti hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getProducts(
    creds: MarketplaceCredentials,
    page: number
  ): Promise<{ products: RemoteProduct[]; hasMore: boolean }> {
    try {
      const merchantId = creds.hb_merchant_id;
      const offset = page * PAGE_SIZE;
      const url = `${PRODUCTS_BASE}/products/api/products/all-products-of-merchant/${merchantId}?offset=${offset}&limit=${PAGE_SIZE}`;

      const res = await fetch(url, { headers: headers(creds) });

      if (!res.ok) {
        throw new Error(`Hepsiburada urun listesi hatasi (${res.status})`);
      }

      const data = await res.json();
      const items: HBProduct[] = data?.products ?? data ?? [];

      const products: RemoteProduct[] = items.map((item) => ({
        externalProductId: item.hepsiburadaSku,
        title: item.productName,
        image: item.imageUrl ?? null,
        variants: [
          {
            id: item.hepsiburadaSku,
            title: item.productName,
            sku: item.merchantSku ?? null,
            barcode: item.barcode ?? null,
            stockQuantity: item.availableStock ?? 0,
          },
        ],
      }));

      const totalCount: number = data?.totalCount ?? data?.length ?? 0;
      const hasMore = offset + PAGE_SIZE < totalCount;

      return { products, hasMore };
    } catch (err) {
      throw new Error(
        `Hepsiburada urun listesi alinamadi: ${err instanceof Error ? err.message : String(err)}`
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
      const merchantId = creds.hb_merchant_id;
      const url = `${LISTING_BASE}/listings/merchantid/${merchantId}/sku/${encodeURIComponent(productId)}`;

      const res = await fetch(url, { headers: headers(creds) });

      if (!res.ok) {
        return {
          success: false,
          variants: [],
          error: `Hepsiburada stok sorgulama hatasi (${res.status})`,
        };
      }

      const data = await res.json();
      const listings: Array<{
        hepsiburadaSku: string;
        availableStock: number;
      }> = Array.isArray(data) ? data : [data];

      return {
        success: true,
        variants: listings.map((l) => ({
          externalVariantId: l.hepsiburadaSku,
          stockQuantity: l.availableStock ?? 0,
        })),
      };
    } catch (err) {
      return {
        success: false,
        variants: [],
        error: `Hepsiburada stok sorgulama hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async updateStock(
    creds: MarketplaceCredentials,
    updates: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    try {
      const merchantId = creds.hb_merchant_id;
      const url = `${LISTING_BASE}/listings/merchantid/${merchantId}/inventory-uploads`;

      const body = {
        listings: updates.map((u) => ({
          hepsiburadaSku: u.externalVariantId,
          availableStock: u.stockQuantity,
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
          error: `Hepsiburada stok guncelleme hatasi (${res.status}): ${text}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Hepsiburada stok guncelleme hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
