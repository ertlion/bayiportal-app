import type { Metadata } from "next";
import "@shopify/polaris/build/esm/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BayiPortal Entegrasyon",
  description: "Shopify pazaryeri stok entegrasyonu",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" defer></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
