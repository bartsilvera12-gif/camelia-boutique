import { MessageCircle } from "lucide-react";
import Ornament from "@/components/Ornament";
import { WhatsAppIcon } from "./ui";

export default function ConversacionesPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 chat-wallpaper">
      <div className="relative">
        <div className="opacity-40">
          <Ornament size={150} opacity={0.6} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-thyme text-champagne flex items-center justify-center shadow-lg">
            <MessageCircle size={24} strokeWidth={1.7} />
          </div>
        </div>
      </div>
      <h2 className="font-serif text-3xl text-ink mt-4">Elegí una conversación</h2>
      <p className="text-sm text-thyme mt-2 max-w-sm">
        Acá aparecen los chats de la web y de WhatsApp. El bot atiende solo; vos podés tomar cualquier conversación y responder.
      </p>
      <div className="flex items-center gap-2 text-xs text-thyme mt-5">
        <span className="w-4 h-4 rounded-full bg-[#25D366] flex items-center justify-center"><WhatsAppIcon size={9} color="#fff" /></span>
        WhatsApp
        <span className="w-4 h-4 rounded-full bg-thyme ml-3" /> Chat de la web
      </div>
    </div>
  );
}
