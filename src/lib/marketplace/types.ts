export type MarketplaceName = "trendyol" | "hepsiburada" | "n11" | "pazarama";

export interface MarketplaceCredentials {
  [key: string]: string;
}

export interface RemoteVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
}

export interface RemoteProduct {
  externalProductId: string;
  title: string;
  image: string | null;
  variants: RemoteVariant[];
}

export interface StockUpdateResult {
  success: boolean;
  error?: string;
}

export interface PushProductInput {
  title: string;
  description: string;
  categoryId: string;
  salePrice: number;
  stockQuantity: number;
  sku: string;
  warehouseSku: string;
  images: string[];
}

export interface PushProductResult {
  success: boolean;
  externalProductId?: string;
  error?: string;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  hasSubCategories: boolean;
}

export interface MarketplaceAdapter {
  name: MarketplaceName;
  testConnection(creds: MarketplaceCredentials): Promise<{ success: boolean; error?: string }>;
  getProducts(creds: MarketplaceCredentials, page: number): Promise<{ products: RemoteProduct[]; hasMore: boolean }>;
  getStock(creds: MarketplaceCredentials, productId: string): Promise<{ success: boolean; variants: Array<{ externalVariantId: string; stockQuantity: number }>; error?: string }>;
  updateStock(creds: MarketplaceCredentials, updates: Array<{ externalVariantId: string; stockQuantity: number }>): Promise<StockUpdateResult>;
  pushProduct?(creds: MarketplaceCredentials, product: PushProductInput): Promise<PushProductResult>;
  getCategories?(creds: MarketplaceCredentials, parentId?: string): Promise<{ success: boolean; categories: MarketplaceCategory[]; error?: string }>;
}
