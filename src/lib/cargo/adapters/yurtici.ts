import type {
  CargoAdapter,
  CargoCredentials,
  CargoShipmentRequest,
  CargoShipmentResult,
} from "../types";

const TRACKING_BASE_URL = "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula";

export class YurticiAdapter implements CargoAdapter {
  name = "yurtici" as const;

  async testConnection(
    creds: CargoCredentials
  ): Promise<{ success: boolean; error?: string }> {
    if (!creds.yurtici_username || !creds.yurtici_password) {
      return {
        success: false,
        error: "Yurtici Kargo: Kullanici adi ve sifre gerekli",
      };
    }
    // TODO: Implement actual connection test via Yurtici SOAP/REST API
    return { success: true };
  }

  async createShipment(
    _creds: CargoCredentials,
    _request: CargoShipmentRequest
  ): Promise<CargoShipmentResult> {
    return {
      success: false,
      error: "Yurtici Kargo entegrasyonu henuz tamamlanmadi",
    };
  }

  getTrackingUrl(trackingNumber: string): string {
    return `${TRACKING_BASE_URL}?code=${encodeURIComponent(trackingNumber)}`;
  }
}
