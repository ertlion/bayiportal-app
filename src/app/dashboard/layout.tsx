import { Providers } from "../providers";

export const metadata = {
  title: "BayiPortal Entegrasyon",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
