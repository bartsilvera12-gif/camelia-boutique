export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  active: boolean;
  sort_order?: number;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  stock: number;
  images: string[];
  keywords?: string | null;
  featured: boolean;
  active: boolean;
  category?: Category | null;
};

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  stock: number;
};

export type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "preparando"
  | "enviado"
  | "entregado"
  | "cancelado";

export const ORDER_STATUSES: OrderStatus[] = [
  "pendiente",
  "confirmado",
  "preparando",
  "enviado",
  "entregado",
  "cancelado",
];

export type Order = {
  id: string;
  customer_id?: string | null;
  conversation_id?: string | null;
  source?: string;
  customer_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  delivery: string;
  payment: string;
  delivery_date?: string | null;
  notes?: string | null;
  subtotal: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  order_items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  price: number;
  qty: number;
  subtotal: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  source: string;
  created_at: string;
};

export type ConversationStatus = "bot" | "humano" | "cerrada";

export type Conversation = {
  id: string;
  channel: string;
  customer_id?: string | null;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  status: ConversationStatus;
  needs_human: boolean;
  has_audio: boolean;
  taken_by?: string | null;
  unread: number;
  last_message?: string | null;
  last_message_at: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  sender: "cliente" | "bot" | "agente";
  kind: "texto" | "audio";
  body: string;
  options?: ChatOption[] | null;
  created_at: string;
};

export type ChatOption = { label: string; value: string };

export type BotAction = "respuesta" | "productos" | "pedido" | "humano" | "horarios";

export type BotIntent = {
  id: string;
  name: string;
  keywords: string[];
  response: string;
  action: BotAction;
  menu_label?: string | null;
  sort_order: number;
  active: boolean;
};

export type StoreSettings = {
  store_name: string;
  whatsapp_number: string;
  email?: string | null;
  address?: string | null;
  hours: string;
  bot_enabled: boolean;
  bot_auto_confirm?: boolean;
  bot_name: string;
  welcome_message: string;
  fallback_message: string;
  handoff_message: string;
  offline_message: string;
  audio_message: string;
  notify_name?: string | null;
  notify_whatsapp?: string | null;
  notify_email?: string | null;
  wa_bot_enabled?: boolean;
  wa_notify_orders?: boolean;
};
