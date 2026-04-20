import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  RemoteProduct,
  StockUpdateResult,
} from "../types";

const BASE_URL = "https://isortagimapi.pazarama.com";
const PAGE_SIZE = 100;

async function getAccessToken(
  creds: MarketplaceCredentials
): Promise<string> {
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: creds.pazarama_api_key,
      apiSecret: creds.pazarama_api_secret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Pazarama token alinamadi (${res.status})`);
  }

  const data = await res.json();
  const token: string = data?.data?.accessToken ?? data?.accessToken ?? data?.token;

  if (!token) {
    throw new Error("Pazarama token yaniti bos");
  }

  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

interface PazaramaProduct {
  id: string;
  name: string;
  imageUrl?: string;
  code?: string;
  barcode?: string;
  stockCount?: number;
  variants?: Array<{
    id: string;
    name: string;
    code?: string;
    barcode?: string;
    stockCount?: number;
  }>;
}

export class PazaramaAdapter implements MarketplaceAdapter {
  name = "pazarama" as const;

  async testConnection(
    creds: MarketplaceCredentials
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await getAccessToken(creds);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Pazarama baglanti hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getProducts(
    creds: MarketplaceCredentials,
    page: number
  ): Promise<{ products: RemoteProduct[]; hasMore: boolean }> {
    try {
      const token = await getAccessToken(creds);
      const url = `${BASE_URL}/api/products?page=${page}&size=${PAGE_SIZE}`;

      const res = await fetch(url, { headers: authHeaders(token) });

      if (!res.ok) {
        throw new Error(`Pazarama urun listesi hatasi (${res.status})`);
      }

      const data = await res.json();
      const items: PazaramaProduct[] = data?.data?.items ?? data?.data ?? data?.items ?? [];
      const totalPages: number = data?.data?.totalPages ?? data?.totalPages ?? 0;

      const products: RemoteProduct[] = items.map((item) => {
        const variants =
          item.variants && item.variants.length > 0
            ? item.variants.map((v) => ({
                id: v.id,
                title: v.name || item.name,
                sku: v.code ?? null,
                barcode: v.barcode ?? null,
                stockQuantity: v.stockCount ?? 0,
              }))
            : [
                {
                  id: item.id,
                  title: item.name,
                  sku: item.code ?? null,
                  barcode: item.barcode ?? null,
                  stockQuantity: item.stockCount ?? 0,
                },
              ];

        return {
          externalProductId: item.id,
          title: item.name,
          image: item.imageUrl ?? null,
          variants,
        };
      });

      return {
        products,
        hasMore: page + 1 < totalPages,
      };
    } catch (err) {
      throw new Error(
        `Pazarama urun listesi alinamadi: ${err instanceof Error ? err.message : String(err)}`
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
      const token = await getAccessToken(creds);
      const url = `${BASE_URL}/api/products/${encodeURIComponent(productId)}`;

      const res = await fetch(url, { headers: authHeaders(token) });

      if (!res.ok) {
        return {
          success: false,
          variants: [],
          error: `Pazarama stok sorgulama hatasi (${res.status})`,
        };
      }

      const data = await res.json();
      const product: PazaramaProduct | undefined = data?.data ?? data;

      if (!product) {
        return { success: false, variants: [], error: "Urun bulunamadi" };
      }

      const variants =
        product.variants && product.variants.length > 0
          ? product.variants.map((v) => ({
              externalVariantId: v.id,
              stockQuantity: v.stockCount ?? 0,
            }))
          : [
              {
                externalVariantId: product.id,
                stockQuantity: product.stockCount ?? 0,
              },
            ];

      return { success: true, variants };
    } catch (err) {
      return {
        success: false,
        variants: [],
        error: `Pazarama stok sorgulama hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async updateStock(
    creds: MarketplaceCredentials,
    updates: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    try {
      const token = await getAccessToken(creds);
      const url = `${BASE_URL}/api/products/stocks`;

      const body = {
        items: updates.map((u) => ({
          id: u.externalVariantId,
          stockCount: u.stockQuantity,
        })),
      };

      const res = await fetch(url, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `Pazarama stok guncelleme hatasi (${res.status}): ${text}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Pazarama stok guncelleme hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
