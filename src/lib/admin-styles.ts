export const STATUS_STYLE: Record<string, string> = {
  pendiente: "bg-bisque/50 text-ink",
  confirmado: "bg-blush/60 text-ink",
  preparando: "bg-champagne text-ink",
  enviado: "bg-thyme/20 text-thyme",
  entregado: "bg-thyme text-champagne",
  cancelado: "bg-ink/10 text-ink/60 line-through",
};

export const SOURCE_LABEL: Record<string, string> = {
  web: "Web",
  bot: "Bot",
  whatsapp: "WhatsApp",
  manual: "Manual",
};
