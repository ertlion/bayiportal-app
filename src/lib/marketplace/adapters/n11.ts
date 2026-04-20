import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  RemoteProduct,
  StockUpdateResult,
} from "../types";

const BASE_URL = "https://api.n11.com/ws";

function soapEnvelope(auth: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
  <soapenv:Header/>
  <soapenv:Body>
    ${auth}
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function authBlock(creds: MarketplaceCredentials): string {
  return `<sch:auth>
      <sch:appKey>${escapeXml(creds.n11_api_key)}</sch:appKey>
      <sch:appSecret>${escapeXml(creds.n11_api_secret)}</sch:appSecret>
    </sch:auth>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9]+:)?${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(
    `<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9]+:)?${tag}>`,
    "gi"
  );
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

async function soapRequest(
  endpoint: string,
  body: string
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body,
  });

  if (!res.ok) {
    throw new Error(`N11 SOAP hatasi (${res.status})`);
  }

  return res.text();
}

export class N11Adapter implements MarketplaceAdapter {
  name = "n11" as const;

  async testConnection(
    creds: MarketplaceCredentials
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getProducts(creds, 0);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `N11 baglanti hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getProducts(
    creds: MarketplaceCredentials,
    page: number
  ): Promise<{ products: RemoteProduct[]; hasMore: boolean }> {
    try {
      const requestBody = soapEnvelope(
        "",
        `<sch:GetProductListRequest>
          ${authBlock(creds)}
          <sch:pagingData>
            <sch:currentPage>${page}</sch:currentPage>
            <sch:pageSize>100</sch:pageSize>
          </sch:pagingData>
        </sch:GetProductListRequest>`
      );

      const xml = await soapRequest(
        `${BASE_URL}/ProductService/`,
        requestBody
      );

      const errorMessage = extractTag(xml, "errorMessage");
      if (errorMessage && errorMessage !== "null") {
        throw new Error(`N11 API hatasi: ${errorMessage}`);
      }

      const productBlocks = extractAllTags(xml, "product");
      const totalPages = parseInt(extractTag(xml, "pageCount") || "0", 10);

      const products: RemoteProduct[] = productBlocks.map((block) => {
        const productId = extractTag(block, "id");
        const title = extractTag(block, "title");
        const imageUrl = extractTag(block, "url"); // first image url

        const skuBlocks = extractAllTags(block, "productSkuDetail");
        const variants = skuBlocks.length > 0
          ? skuBlocks.map((skuBlock) => ({
              id: extractTag(skuBlock, "id"),
              title: extractTag(skuBlock, "value") || title,
              sku: extractTag(skuBlock, "sellerStockCode") || null,
              barcode: extractTag(skuBlock, "gtin") || null,
              stockQuantity: parseInt(extractTag(skuBlock, "quantity") || "0", 10),
            }))
          : [
              {
                id: productId,
                title,
                sku: extractTag(block, "productSellerCode") || null,
                barcode: null,
                stockQuantity: parseInt(extractTag(block, "stockAmount") || "0", 10),
              },
            ];

        return {
          externalProductId: productId,
          title,
          image: imageUrl || null,
          variants,
        };
      });

      return {
        products,
        hasMore: page + 1 < totalPages,
      };
    } catch (err) {
      throw new Error(
        `N11 urun listesi alinamadi: ${err instanceof Error ? err.message : String(err)}`
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
      const requestBody = soapEnvelope(
        "",
        `<sch:GetProductStockByProductIdRequest>
          ${authBlock(creds)}
          <sch:productId>${escapeXml(productId)}</sch:productId>
        </sch:GetProductStockByProductIdRequest>`
      );

      const xml = await soapRequest(
        `${BASE_URL}/ProductStockService/`,
        requestBody
      );

      const errorMessage = extractTag(xml, "errorMessage");
      if (errorMessage && errorMessage !== "null") {
        return { success: false, variants: [], error: `N11: ${errorMessage}` };
      }

      const stockItems = extractAllTags(xml, "stockItem");

      return {
        success: true,
        variants: stockItems.map((item) => ({
          externalVariantId: extractTag(item, "id"),
          stockQuantity: parseInt(extractTag(item, "quantity") || "0", 10),
        })),
      };
    } catch (err) {
      return {
        success: false,
        variants: [],
        error: `N11 stok sorgulama hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async updateStock(
    creds: MarketplaceCredentials,
    updates: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    try {
      const stockItems = updates
        .map(
          (u) => `<sch:stockItem>
            <sch:id>${escapeXml(u.externalVariantId)}</sch:id>
            <sch:quantity>${u.stockQuantity}</sch:quantity>
          </sch:stockItem>`
        )
        .join("\n");

      const requestBody = soapEnvelope(
        "",
        `<sch:UpdateProductStockByStockIdRequest>
          ${authBlock(creds)}
          <sch:stockItems>
            ${stockItems}
          </sch:stockItems>
        </sch:UpdateProductStockByStockIdRequest>`
      );

      const xml = await soapRequest(
        `${BASE_URL}/ProductStockService/`,
        requestBody
      );

      const errorMessage = extractTag(xml, "errorMessage");
      if (errorMessage && errorMessage !== "null") {
        return { success: false, error: `N11 stok guncelleme hatasi: ${errorMessage}` };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `N11 stok guncelleme hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
