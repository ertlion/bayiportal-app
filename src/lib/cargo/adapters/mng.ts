import type {
  CargoAdapter,
  CargoCredentials,
  CargoShipmentRequest,
  CargoShipmentResult,
} from "../types";

const BASE_URL = "https://service.mngkargo.com.tr/mng-kargo-api/api";
const TRACKING_BASE_URL = "https://www.mngkargo.com.tr/gonderi-takip";

function buildAuthHeaders(creds: CargoCredentials): Record<string, string> {
  const token = Buffer.from(
    `${creds.mng_username}:${creds.mng_password}`
  ).toString("base64");

  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface MngShipmentBody {
  order: {
    referenceId: string;
    barcode: string;
    billOfLandingId: string;
    isCOD: number;
    codAmount: number;
    shipmentServiceType: number;
    packingType: number;
    content: string;
    smsPreference1: number;
    smsPreference2: number;
    smsPreference3: number;
    paymentType: number;
    deliveryType: number;
    description: string;
    marketPlaceShortCode: string;
    marketPlaceSaleCode: string;
  };
  orderPiece: Array<{
    barcode: string;
    desi: number;
    kg: number;
    content: string;
  }>;
  recipient: {
    customerId: string;
    refCustomerId: string;
    cityCode: number;
    cityName: string;
    districtName: string;
    address: string;
    bussinessPhoneNumber: string;
    homePhoneNumber: string;
    mobilePhoneNumber: string;
    name: string;
  };
}

export class MngAdapter implements CargoAdapter {
  name = "mng" as const;

  async testConnection(
    creds: CargoCredentials
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creds.mng_username || !creds.mng_password || !creds.mng_customer_number) {
        return {
          success: false,
          error: "MNG Kargo: Kullanici adi, sifre ve musteri numarasi gerekli",
        };
      }

      // MNG doesn't have a dedicated "ping" endpoint.
      // We validate credentials format only; real validation happens on first shipment.
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `MNG Kargo baglanti hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async createShipment(
    creds: CargoCredentials,
    request: CargoShipmentRequest
  ): Promise<CargoShipmentResult> {
    try {
      const { sender, receiver, package: pkg } = request;

      const body: MngShipmentBody = {
        order: {
          referenceId: pkg.orderNumber,
          barcode: "",
          billOfLandingId: creds.mng_customer_number,
          isCOD: 0,
          codAmount: 0,
          shipmentServiceType: 1,
          packingType: 1,
          content: pkg.description ?? "E-ticaret gonderi",
          smsPreference1: 1,
          smsPreference2: 0,
          smsPreference3: 0,
          paymentType: 1,
          deliveryType: 1,
          description: pkg.description ?? "",
          marketPlaceShortCode: "",
          marketPlaceSaleCode: pkg.orderNumber,
        },
        orderPiece: [
          {
            barcode: "",
            desi: Math.max(1, Math.ceil(pkg.weight * 3)),
            kg: pkg.weight,
            content: pkg.description ?? "E-ticaret gonderi",
          },
        ],
        recipient: {
          customerId: creds.mng_customer_number,
          refCustomerId: "",
          cityCode: 0,
          cityName: receiver.city,
          districtName: receiver.district,
          address: receiver.address,
          bussinessPhoneNumber: "",
          homePhoneNumber: "",
          mobilePhoneNumber: receiver.phone,
          name: receiver.name,
        },
      };

      const res = await fetch(`${BASE_URL}/standardshipment`, {
        method: "POST",
        headers: buildAuthHeaders(creds),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `MNG Kargo gonderi olusturma hatasi (${res.status}): ${text}`,
        };
      }

      const data = await res.json();

      // MNG API returns the tracking barcode in the response
      const trackingNumber: string =
        data?.barcode ?? data?.data?.barcode ?? data?.trackingNumber ?? "";

      if (!trackingNumber) {
        return {
          success: false,
          error: "MNG Kargo: Takip numarasi alinamadi",
        };
      }

      return {
        success: true,
        trackingNumber,
        trackingUrl: this.getTrackingUrl(trackingNumber),
      };
    } catch (err) {
      return {
        success: false,
        error: `MNG Kargo gonderi hatasi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  getTrackingUrl(trackingNumber: string): string {
    return `${TRACKING_BASE_URL}/${encodeURIComponent(trackingNumber)}`;
  }
}
