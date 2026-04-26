export type CargoProvider = "yurtici" | "aras" | "mng";

export interface CargoCredentials {
  [key: string]: string;
}

export interface CargoSenderInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
}

export interface CargoReceiverInfo {
  name: string;
  address: string;
  city: string;
  district: string;
  phone: string;
}

export interface CargoPackageInfo {
  orderNumber: string;
  weight: number; // kg
  description?: string;
  count?: number; // number of packages, default 1
}

export interface CargoShipmentRequest {
  sender: CargoSenderInfo;
  receiver: CargoReceiverInfo;
  package: CargoPackageInfo;
}

export interface CargoShipmentResult {
  success: boolean;
  trackingNumber?: string;
  trackingUrl?: string;
  error?: string;
}

export interface CargoAdapter {
  name: CargoProvider;
  testConnection(creds: CargoCredentials): Promise<{ success: boolean; error?: string }>;
  createShipment(creds: CargoCredentials, request: CargoShipmentRequest): Promise<CargoShipmentResult>;
  getTrackingUrl(trackingNumber: string): string;
}
