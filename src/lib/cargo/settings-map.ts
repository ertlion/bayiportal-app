interface SettingsKeyConfig {
  key: string;
  label: string;
  type: string;
}

interface CargoProviderSettings {
  displayName: string;
  settingsKeys: SettingsKeyConfig[];
}

/**
 * Cargo provider credential settings.
 * Used by the settings UI to render provider-specific configuration forms.
 */
export const CARGO_SETTINGS: Record<string, CargoProviderSettings> = {
  yurtici: {
    displayName: "Yurtici Kargo",
    settingsKeys: [
      { key: "yurtici_username", label: "Kullanici Adi", type: "text" },
      { key: "yurtici_password", label: "Sifre", type: "password" },
    ],
  },
  aras: {
    displayName: "Aras Kargo",
    settingsKeys: [
      { key: "aras_username", label: "Kullanici Adi", type: "text" },
      { key: "aras_password", label: "Sifre", type: "password" },
      { key: "aras_customer_code", label: "Musteri Kodu", type: "text" },
    ],
  },
  mng: {
    displayName: "MNG Kargo",
    settingsKeys: [
      { key: "mng_username", label: "Kullanici Adi", type: "text" },
      { key: "mng_password", label: "Sifre", type: "password" },
      { key: "mng_customer_number", label: "Musteri Numarasi", type: "text" },
    ],
  },
};

/**
 * Shared sender info settings used across all cargo providers.
 * These are stored as tenant-level settings, not per-provider.
 */
export const CARGO_SENDER_SETTINGS: SettingsKeyConfig[] = [
  { key: "cargo_sender_name", label: "Gonderici Adi", type: "text" },
  { key: "cargo_sender_address", label: "Gonderici Adresi", type: "text" },
  { key: "cargo_sender_city", label: "Gonderici Sehri", type: "text" },
  { key: "cargo_sender_phone", label: "Gonderici Telefonu", type: "text" },
];

/**
 * Get all settings keys for a given cargo provider (including shared sender settings).
 */
export function getCargoSettingsKeys(provider: string): SettingsKeyConfig[] {
  const providerConfig = CARGO_SETTINGS[provider];
  if (!providerConfig) return [];
  return [...providerConfig.settingsKeys, ...CARGO_SENDER_SETTINGS];
}
