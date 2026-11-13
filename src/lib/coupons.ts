// Cupones: viven en la tabla cameliaboutique.coupons (se administran desde el panel).
// Acá solo está el cálculo para mostrarlo en el checkout; el descuento real lo
// calcula create_order() en la base.

export type Coupon = {
  code: string;
  percent: number;
  label?: string | null;
};

export function applyCoupon(subtotal: number, coupon: Coupon | null) {
  if (!coupon) return { discount: 0, total: subtotal };
  const discount = Math.round((subtotal * coupon.percent) / 100);
  return { discount, total: subtotal - discount };
}
