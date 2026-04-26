import { describe, it, before } from "node:test";
import assert from "node:assert";

// ---------- Crypto round-trip ----------

describe("credential-crypto", () => {
  before(() => {
    // Set a test encryption key (32 bytes = 64 hex chars)
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    }
  });

  it("encrypt and decrypt should round-trip correctly", async () => {
    const { encrypt, decrypt } = await import("../crypto");

    const plaintext = "test-secret-credential-value";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    assert.strictEqual(decrypted, plaintext);
  });

  it("encrypted output should have iv:authTag:ciphertext format", async () => {
    const { encrypt } = await import("../crypto");

    const encrypted = encrypt("hello");
    const parts = encrypted.split(":");

    assert.strictEqual(parts.length, 3, "Expected 3 colon-separated parts");
    // IV = 12 bytes = 24 hex chars
    assert.strictEqual(parts[0].length, 24, "IV should be 24 hex chars");
    // Auth tag = 16 bytes = 32 hex chars
    assert.strictEqual(parts[1].length, 32, "Auth tag should be 32 hex chars");
    // Ciphertext should be non-empty
    assert.ok(parts[2].length > 0, "Ciphertext should not be empty");
  });

  it("different encryptions of the same plaintext should produce different ciphertext", async () => {
    const { encrypt } = await import("../crypto");

    const plaintext = "same-value";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    assert.notStrictEqual(
      encrypted1,
      encrypted2,
      "Random IV should make each encryption unique"
    );
  });

  it("decrypt should throw on tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("../crypto");

    const encrypted = encrypt("sensitive-data");
    const parts = encrypted.split(":");
    // Tamper with the ciphertext
    const tampered = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;

    assert.throws(
      () => decrypt(tampered),
      "Tampered ciphertext should throw an error"
    );
  });

  it("decrypt should throw on invalid format", async () => {
    const { decrypt } = await import("../crypto");

    assert.throws(
      () => decrypt("not-valid-format"),
      "Invalid format should throw"
    );
  });
});

// ---------- Cargo adapter tracking URL ----------

describe("cargo tracking URLs", () => {
  it("MNG adapter should generate correct tracking URL", async () => {
    const { MngAdapter } = await import("../../lib/cargo/adapters/mng");
    const adapter = new MngAdapter();

    const url = adapter.getTrackingUrl("ABC123456");
    assert.strictEqual(
      url,
      "https://www.mngkargo.com.tr/gonderi-takip/ABC123456"
    );
  });

  it("MNG adapter should encode special characters in tracking number", async () => {
    const { MngAdapter } = await import("../../lib/cargo/adapters/mng");
    const adapter = new MngAdapter();

    const url = adapter.getTrackingUrl("ABC 123/456");
    assert.ok(
      url.includes("ABC%20123%2F456"),
      "Special characters should be URL-encoded"
    );
  });

  it("Yurtici adapter should generate correct tracking URL", async () => {
    const { YurticiAdapter } = await import("../../lib/cargo/adapters/yurtici");
    const adapter = new YurticiAdapter();

    const url = adapter.getTrackingUrl("YK123456");
    assert.ok(url.includes("YK123456"), "URL should contain tracking number");
    assert.ok(
      url.startsWith("https://www.yurticikargo.com"),
      "URL should be yurticikargo.com"
    );
  });

  it("Aras adapter should generate correct tracking URL", async () => {
    const { ArasAdapter } = await import("../../lib/cargo/adapters/aras");
    const adapter = new ArasAdapter();

    const url = adapter.getTrackingUrl("AR123456");
    assert.ok(url.includes("AR123456"), "URL should contain tracking number");
    assert.ok(
      url.startsWith("https://www.araskargo.com.tr"),
      "URL should be araskargo.com.tr"
    );
  });
});

// ---------- Cargo settings map ----------

describe("cargo settings-map", () => {
  it("CARGO_SETTINGS should have all three providers", async () => {
    const { CARGO_SETTINGS } = await import("../../lib/cargo/settings-map");

    assert.ok(CARGO_SETTINGS.yurtici, "yurtici should exist");
    assert.ok(CARGO_SETTINGS.aras, "aras should exist");
    assert.ok(CARGO_SETTINGS.mng, "mng should exist");
  });

  it("each provider should have displayName and settingsKeys", async () => {
    const { CARGO_SETTINGS } = await import("../../lib/cargo/settings-map");

    for (const [name, config] of Object.entries(CARGO_SETTINGS)) {
      assert.ok(config.displayName, `${name} should have displayName`);
      assert.ok(
        Array.isArray(config.settingsKeys) && config.settingsKeys.length > 0,
        `${name} should have non-empty settingsKeys`
      );
    }
  });

  it("getCargoSettingsKeys should return provider + sender keys", async () => {
    const { getCargoSettingsKeys, CARGO_SETTINGS, CARGO_SENDER_SETTINGS } =
      await import("../../lib/cargo/settings-map");

    const mngKeys = getCargoSettingsKeys("mng");
    const expectedLength =
      CARGO_SETTINGS.mng.settingsKeys.length + CARGO_SENDER_SETTINGS.length;

    assert.strictEqual(mngKeys.length, expectedLength);
  });

  it("getCargoSettingsKeys should return empty for unknown provider", async () => {
    const { getCargoSettingsKeys } = await import(
      "../../lib/cargo/settings-map"
    );

    const keys = getCargoSettingsKeys("unknown_provider");
    assert.strictEqual(keys.length, 0);
  });

  it("password fields should have type password", async () => {
    const { CARGO_SETTINGS } = await import("../../lib/cargo/settings-map");

    for (const [, config] of Object.entries(CARGO_SETTINGS)) {
      const passwordKeys = config.settingsKeys.filter(
        (k) => k.key.includes("password")
      );
      for (const pk of passwordKeys) {
        assert.strictEqual(
          pk.type,
          "password",
          `${pk.key} should have type "password"`
        );
      }
    }
  });
});

// ---------- Cargo registry ----------

describe("cargo registry", () => {
  it("should return all three provider names", async () => {
    const { getCargoProviderNames } = await import(
      "../../lib/cargo/registry"
    );

    const names = getCargoProviderNames();
    assert.ok(names.includes("yurtici"));
    assert.ok(names.includes("aras"));
    assert.ok(names.includes("mng"));
  });

  it("should return adapter by name", async () => {
    const { getCargoAdapter } = await import("../../lib/cargo/registry");

    const adapter = getCargoAdapter("mng");
    assert.strictEqual(adapter.name, "mng");
  });

  it("should throw for unknown provider", async () => {
    const { getCargoAdapter } = await import("../../lib/cargo/registry");

    assert.throws(
      () => getCargoAdapter("unknown" as never),
      /Desteklenmeyen kargo/
    );
  });
});
