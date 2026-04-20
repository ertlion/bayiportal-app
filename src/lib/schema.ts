import { pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ==================== SHOPS (Shopify mağazaları) ====================
export const shops = pgTable("shops", {
  id: serial("id").primaryKey(),
  shopDomain: text("shop_domain").notNull().unique(), // xxx.myshopify.com
  accessToken: text("access_token").notNull(),
  shopName: text("shop_name"),
  email: text("email"),
  plan: text("plan").notNull().default("free"), // free, starter, pro
  productLimit: integer("product_limit").notNull().default(10),
  marketplace: text("marketplace"), // trendyol, hepsiburada, n11, pazarama (free: pick one)
  isActive: boolean("is_active").notNull().default(true),
  installedAt: timestamp("installed_at").defaultNow(),
  uninstalledAt: timestamp("uninstalled_at"),
  billingId: text("billing_id"), // Shopify recurring charge ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== MARKETPLACE CREDENTIALS ====================
export const marketplaceCredentials = pgTable("marketplace_credentials", {
  id: serial("id").primaryKey(),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  marketplace: text("marketplace").notNull(), // trendyol, hepsiburada, n11, pazarama
  credentials: text("credentials").notNull(), // encrypted JSON
  isActive: boolean("is_active").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at"),
  testResult: text("test_result"), // success, error message
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("cred_shop_mp_idx").on(t.shopId, t.marketplace),
]);

// ==================== PRODUCT MATCHINGS ====================
export const productMatchings = pgTable("product_matchings", {
  id: serial("id").primaryKey(),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  marketplace: text("marketplace").notNull(),

  // Shopify side
  shopifyProductId: text("shopify_product_id").notNull(),
  shopifyVariantId: text("shopify_variant_id").notNull(),
  shopifyTitle: text("shopify_title"),
  shopifySku: text("shopify_sku"),
  shopifyBarcode: text("shopify_barcode"),
  shopifyInventoryItemId: text("shopify_inventory_item_id"),

  // Marketplace side
  marketplaceProductId: text("marketplace_product_id").notNull(),
  marketplaceVariantId: text("marketplace_variant_id"),
  marketplaceTitle: text("marketplace_title"),
  marketplaceSku: text("marketplace_sku"),
  marketplaceBarcode: text("marketplace_barcode"),

  // Matching metadata
  matchType: text("match_type").notNull().default("manual"), // manual, barcode, sku
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"), // success, error
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("match_unique_idx").on(t.shopId, t.marketplace, t.shopifyVariantId, t.marketplaceVariantId),
  index("match_shopify_idx").on(t.shopId, t.shopifyVariantId),
  index("match_marketplace_idx").on(t.shopId, t.marketplace, t.marketplaceProductId),
  index("match_barcode_idx").on(t.shopId, t.shopifyBarcode),
]);

// ==================== SHOPIFY PRODUCTS (cache) ====================
export const shopifyProducts = pgTable("shopify_products", {
  id: serial("id").primaryKey(),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  shopifyProductId: text("shopify_product_id").notNull(),
  title: text("title").notNull(),
  image: text("image"),
  variants: jsonb("variants").notNull().default("[]"),
  // variants: [{ id, title, sku, barcode, inventoryItemId, inventoryQuantity }]
  lastFetchedAt: timestamp("last_fetched_at").defaultNow(),
}, (t) => [
  uniqueIndex("sp_shop_product_idx").on(t.shopId, t.shopifyProductId),
]);

// ==================== MARKETPLACE PRODUCTS (cache) ====================
export const marketplaceProducts = pgTable("marketplace_products", {
  id: serial("id").primaryKey(),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  marketplace: text("marketplace").notNull(),
  externalProductId: text("external_product_id").notNull(),
  title: text("title").notNull(),
  image: text("image"),
  variants: jsonb("variants").notNull().default("[]"),
  // variants: [{ id, title, sku, barcode, stockQuantity }]
  lastFetchedAt: timestamp("last_fetched_at").defaultNow(),
}, (t) => [
  uniqueIndex("mp_shop_mp_product_idx").on(t.shopId, t.marketplace, t.externalProductId),
]);

// ==================== SYNC LOGS ====================
export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // stock_sync, order_import, product_fetch, auto_match
  marketplace: text("marketplace"),
  summary: text("summary"),
  details: jsonb("details"),
  status: text("status").notNull().default("success"), // success, error, partial
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sl_shop_created_idx").on(t.shopId, t.createdAt),
]);

// ==================== RELATIONS ====================
export const shopsRelations = relations(shops, ({ many }) => ({
  credentials: many(marketplaceCredentials),
  matchings: many(productMatchings),
  shopifyProducts: many(shopifyProducts),
  marketplaceProducts: many(marketplaceProducts),
  syncLogs: many(syncLogs),
}));

export const credentialsRelations = relations(marketplaceCredentials, ({ one }) => ({
  shop: one(shops, { fields: [marketplaceCredentials.shopId], references: [shops.id] }),
}));

export const matchingsRelations = relations(productMatchings, ({ one }) => ({
  shop: one(shops, { fields: [productMatchings.shopId], references: [shops.id] }),
}));

export const shopifyProductsRelations = relations(shopifyProducts, ({ one }) => ({
  shop: one(shops, { fields: [shopifyProducts.shopId], references: [shops.id] }),
}));

export const marketplaceProductsRelations = relations(marketplaceProducts, ({ one }) => ({
  shop: one(shops, { fields: [marketplaceProducts.shopId], references: [shops.id] }),
}));

export const syncLogsRelations = relations(syncLogs, ({ one }) => ({
  shop: one(shops, { fields: [syncLogs.shopId], references: [shops.id] }),
}));
