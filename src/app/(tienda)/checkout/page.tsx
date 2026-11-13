"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Ornament from "@/components/Ornament";
import { useCart } from "@/lib/cart-store";
import { formatGs } from "@/lib/format";
import { applyCoupon, type Coupon } from "@/lib/coupons";
import type { ShippingMethod } from "@/lib/types";
import { checkCoupon, getCheckoutOptions, startWhatsAppCheckout } from "./actions";

function WaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Zm5.7 14.3c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .1-1.6-.1-2.3-.7-3.8-3-3.9-3.1-.1-.1-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.1.1.3 0 .5 0 .1-.1.3-.3.5s-.4.4-.5.6c-.2.2-.4.4-.2.7.2.4.9 1.4 1.9 2.3 1.3 1.1 2.3 1.4 2.7 1.6.4.1.6.1.8-.1s.9-1 1.1-1.3c.2-.3.4-.3.7-.2s1.8.9 2.1 1c.3.2.5.2.6.3.1.2.1.7-.1 1.3Z" />
    </svg>
  );
}

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [shipping, setShipping] = useState<ShippingMethod[] | null>(null);
  const [shipId, setShipId] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; url: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    getCheckoutOptions()
      .then((o) => {
        setShipping(o.shipping);
        if (o.shipping.length) setShipId(o.shipping[0].id);
      })
      .catch(() => setShipping([]));
  }, []);

  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const { discount } = applyCoupon(subtotal, coupon);
  const envio = shipping?.find((m) => m.id === shipId);
  const total = subtotal - discount + Number(envio?.price || 0);

  if (!mounted) return null;

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setChecking(true);
    const c = await checkCoupon(couponInput).catch(() => null);
    setChecking(false);
    if (!c) {
      setCoupon(null);
      setCouponMsg("Ese cupón no es válido.");
      setTimeout(() => setCouponMsg(null), 2500);
      return;
    }
    setCoupon(c);
    setCouponMsg(`✓ ${c.label || `${c.percent}% de descuento`}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) return;
    if (shipping?.length && !shipId) return setError("Elegí cómo lo querés recibir");
    setLoading(true);
    setError(null);
    const r = await startWhatsAppCheckout({ name, shippingId: shipId, couponCode: coupon?.code, items }).catch(
      () => ({ ok: false as const, error: "No se pudo preparar el pedido. Probá de nuevo." })
    );
    setLoading(false);
    if (!r.ok) return setError(r.error);
    setDone({ code: r.code, url: r.url });
    clear();
    window.location.href = r.url;
  }

  // ---- ya se abrió WhatsApp ----
  if (done) {
    return (
      <section className="max-w-xl mx-auto px-5 md:px-8 py-16 text-center relative">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 opacity-25 pointer-events-none">
          <Ornament size={160} opacity={0.35} />
        </div>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#25D366] text-white mb-6 relative">
          <WaIcon />
        </div>
        <h1 className="font-serif text-4xl text-ink">¡Seguimos por WhatsApp!</h1>
        <p className="text-muted mt-3">
          Te abrimos WhatsApp con tu pedido <span className="font-mono text-ink">{done.code}</span>. Enviá el mensaje y
          nuestro asistente te pide el día de entrega y la forma de pago.
        </p>
        <a href={done.url} className="btn-wa w-full mt-8"><WaIcon /> Abrir WhatsApp</a>
        <Link href="/catalogo" className="block text-sm text-thyme mt-6 hover:text-rose">← Seguir viendo productos</Link>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-5 md:px-8 py-12 relative">
      <div className="absolute -top-4 -right-4 opacity-25 pointer-events-none hidden md:block">
        <Ornament size={180} opacity={0.3} />
      </div>
      <div className="eyebrow mb-2">— Checkout</div>
      <h1 className="font-serif text-4xl text-ink">Finalizar compra</h1>
      <p className="text-sm text-muted mt-2 mb-8">Solo dos datos: el resto lo coordinamos por WhatsApp en un minuto.</p>

      <div className="grid md:grid-cols-[1fr_340px] gap-8">
        <form onSubmit={onSubmit} className="space-y-7 bg-cream border border-champagne rounded-2xl p-6">
          <div>
            <label className="label" htmlFor="name">Tu nombre</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Nombre y apellido"
              className="input"
            />
          </div>

          <div>
            <div className="label">¿Cómo lo querés recibir?</div>
            {shipping === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-[62px] rounded-xl bg-champagne/60 animate-pulse" />)}
              </div>
            ) : shipping.length === 0 ? (
              <p className="text-sm text-thyme">Coordinamos el envío por WhatsApp.</p>
            ) : (
              <div className="space-y-2">
                {shipping.map((m) => {
                  const sel = m.id === shipId;
                  return (
                    <label
                      key={m.id}
                      className={
                        "flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition " +
                        (sel ? "border-thyme bg-thyme/5 ring-1 ring-thyme" : "border-bisque hover:border-thyme/60")
                      }
                    >
                      <input type="radio" name="shipping" value={m.id} checked={sel} onChange={() => setShipId(m.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink">{m.name}</div>
                        {m.description && <div className="text-[11px] text-thyme">{m.description}</div>}
                      </div>
                      <div className={"text-sm font-medium " + (Number(m.price) ? "text-ink" : "text-thyme")}>
                        {Number(m.price) ? formatGs(Number(m.price)) : "Gratis"}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div className="text-sm text-rose">{error}</div>}
          <button disabled={loading || items.length === 0} className="btn-wa w-full !py-3.5 disabled:opacity-50">
            <WaIcon /> {loading ? "Preparando tu pedido…" : "Continuar por WhatsApp"}
          </button>
          <p className="text-xs text-thyme -mt-3">
            Se abre WhatsApp con tu pedido. Nuestro asistente te confirma el stock, te ofrece días y horarios de entrega y la forma de pago.
          </p>
        </form>

        <aside className="bg-champagne/70 rounded-2xl p-6 h-fit">
          <div className="eyebrow mb-3">Resumen</div>
          <div className="space-y-2 text-sm max-h-56 overflow-auto pr-1">
            {items.map((i) => (
              <div key={i.productId} className="flex justify-between gap-3">
                <span>{i.qty} × {i.name}</span>
                <span className="shrink-0">{formatGs(i.price * i.qty)}</span>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-thyme text-xs">
                Tu carrito está vacío. <Link href="/catalogo" className="underline">Ver productos</Link>
              </div>
            )}
          </div>

          {/* Cupón */}
          <div className="mt-5 pt-4 border-t border-bisque">
            <div className="eyebrow mb-2">Cupón</div>
            {coupon ? (
              <div className="flex items-center justify-between gap-2 bg-cream border border-thyme/50 rounded-lg px-3 py-2">
                <div className="text-sm">
                  <div className="text-thyme font-medium">{coupon.code}</div>
                  <div className="text-[11px] text-muted">-{coupon.percent}% aplicado</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setCoupon(null); setCouponInput(""); setCouponMsg(null); }}
                  className="text-xs text-rose hover:underline"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="CAMELIA10"
                    className="input flex-1 uppercase tracking-widest text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleApplyCoupon();
                      }
                    }}
                  />
                  <button type="button" onClick={handleApplyCoupon} disabled={checking} className="btn-outline !py-2 !px-3 !text-[11px] disabled:opacity-50">
                    {checking ? "…" : "Aplicar"}
                  </button>
                </div>
                {couponMsg && (
                  <div className={`text-[11px] mt-1.5 ${couponMsg.startsWith("✓") ? "text-thyme" : "text-rose"}`}>{couponMsg}</div>
                )}
              </>
            )}
          </div>

          {/* Totales */}
          <div className="mt-4 space-y-1 text-sm border-t border-bisque pt-3">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatGs(subtotal)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-thyme"><span>Cupón {coupon?.code}</span><span>-{formatGs(discount)}</span></div>
            )}
            {envio && (
              <div className="flex justify-between text-muted">
                <span>Envío</span>
                <span>{Number(envio.price) ? formatGs(Number(envio.price)) : "Gratis"}</span>
              </div>
            )}
            <div className="flex justify-between font-serif text-xl pt-2">
              <span>Total</span>
              <span className="text-rose">{formatGs(total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
