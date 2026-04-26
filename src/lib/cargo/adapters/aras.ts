import type {
  CargoAdapter,
  CargoCredentials,
  CargoShipmentRequest,
  CargoShipmentResult,
} from "../types";

const TRACKING_BASE_URL = "https://www.araskargo.com.tr/trs_gonderi_sorgula.html";

export class ArasAdapter implements CargoAdapter {
  name = "aras" as const;

  async testConnection(
    creds: CargoCredentials
  ): Promise<{ success: boolean; error?: string }> {
    if (!creds.aras_username || !creds.aras_password || !creds.aras_customer_code) {
      return {
        success: false,
        error: "Aras Kargo: Kullanici adi, sifre ve musteri kodu gerekli",
      };
    }
    // TODO: Implement actual connection test via Aras SOAP/REST API
    return { success: true };
  }

  async createShipment(
    _creds: CargoCredentials,
    _request: CargoShipmentRequest
  ): Promise<CargoShipmentResult> {
    return {
      success: false,
      error: "Aras Kargo entegrasyonu henuz tamamlanmadi",
    };
  }

  getTrackingUrl(trackingNumber: string): string {
    return `${TRACKING_BASE_URL}?q=${encodeURIComponent(trackingNumber)}`;
  }
}
