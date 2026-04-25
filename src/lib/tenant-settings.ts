import { db } from "./db";
import { tenantSettings } from "./schema";
import { eq } from "drizzle-orm";

// ---------- In-memory TTL cache ----------

interface CacheEntry {
  data: Record<string, string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const settingsCache = new Map<string, CacheEntry>();

function cacheKey(shopId: number): string {
  return `tenant_${shopId}`;
}

/**
 * Get all settings for a tenant (shop).
 * Returns a key-value record. Uses in-memory cache with 5min TTL.
 */
export async function getTenantSettings(shopId: number): Promise<Record<string, string>> {
  const key = cacheKey(shopId);
  const cached = settingsCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Cache miss or expired — fetch from DB
  const rows = await db
    .select({ key: tenantSettings.key, value: tenantSettings.value })
    .from(tenantSettings)
    .where(eq(tenantSettings.shopId, shopId));

  const data: Record<string, string> = {};
  for (const row of rows) {
    data[row.key] = row.value;
  }

  settingsCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return data;
}

/**
 * Get a single setting value for a tenant.
 * Returns the value or the provided default.
 */
export async function getTenantSetting(
  shopId: number,
  settingKey: string,
  defaultValue = ""
): Promise<string> {
  const all = await getTenantSettings(shopId);
  return all[settingKey] ?? defaultValue;
}

/**
 * Invalidate the in-memory settings cache for a tenant.
 * Call this when settings are updated.
 */
export function invalidateSettingsCache(shopId: number): void {
  settingsCache.delete(cacheKey(shopId));
}

/**
 * Upsert a tenant setting.
 */
export async function setTenantSetting(
  shopId: number,
  key: string,
  value: string
): Promise<void> {
  await db
    .insert(tenantSettings)
    .values({ shopId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tenantSettings.shopId, tenantSettings.key],
      set: { value, updatedAt: new Date() },
    });

  invalidateSettingsCache(shopId);
}
