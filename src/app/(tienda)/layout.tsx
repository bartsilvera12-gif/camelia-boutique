import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import KeycapButton from "@/components/KeycapButton";
import Toast from "@/components/Toast";
import { StoreProvider } from "@/components/StoreContext";
import { getStoreSettings } from "@/lib/data";

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  const settings = await getStoreSettings();
  return (
    <StoreProvider value={{ whatsappNumber: settings?.whatsapp_number ?? null }}>
      <Header />
      <main>{children}</main>
      <Footer whatsapp={settings?.whatsapp_number} />
      <KeycapButton />
      <Toast />
      <ChatWidget />
    </StoreProvider>
  );
}
