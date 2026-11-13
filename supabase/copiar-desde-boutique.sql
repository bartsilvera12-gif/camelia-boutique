-- =====================================================================
--  Camélia — copiar los datos de la tienda vieja (schema "boutique")
--  al schema nuevo "cameliaboutique".
--
--  OPCIONAL. Ejecutar DESPUÉS de cameliaboutique.sql, una sola vez.
--  Solo LEE de boutique: no modifica ni borra nada ahí.
--  Se puede volver a correr sin duplicar (usa los mismos ids / slugs).
--
--  · Categorías y productos: si ya existen en cameliaboutique (mismo slug),
--    se actualizan con los datos de boutique (precio, stock, fotos, rebaja…).
--  · Clientes, pedidos e ítems: se copian con sus ids originales.
--    Copiar pedidos NO descuenta stock otra vez.
-- =====================================================================

begin;

-- 1. Categorías
insert into cameliaboutique.categories (name, slug, description, active, created_at)
select c.name, c.slug, c.description, c.active, c.created_at
  from boutique.categories c
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, active = excluded.active;

-- 2. Productos (la categoría se resuelve por slug)
insert into cameliaboutique.products
  (category_id, name, slug, description, price, stock, images, featured, active, discount, sizes, created_at)
select nc.id, p.name, p.slug, p.description, p.price, p.stock,
       -- las rutas /img/p-XX del seed viejo no existen: se descartan (queda el ornamento)
       array(select x from unnest(p.images) x where x not like '/img/%'),
       p.featured, p.active,
       coalesce(p.discount, 0), coalesce(p.sizes, '{}'), p.created_at
  from boutique.products p
  left join boutique.categories oc on oc.id = p.category_id
  left join cameliaboutique.categories nc on nc.slug = oc.slug
on conflict (slug) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  price = excluded.price, stock = excluded.stock,
  images = case when cardinality(excluded.images) = 0 then cameliaboutique.products.images else excluded.images end,
  featured = excluded.featured, active = excluded.active,
  discount = excluded.discount, sizes = excluded.sizes;

-- 3. Clientes
insert into cameliaboutique.customers (id, name, phone, email, address, city, source, created_at)
select c.id, c.name, c.phone, c.email, c.address, c.city, 'web', c.created_at
  from boutique.customers c
on conflict (id) do nothing;

-- 4. Pedidos (el estado se pasa por texto: los dos schemas usan los mismos nombres)
insert into cameliaboutique.orders
  (id, customer_id, source, customer_name, phone, email, address, city,
   delivery, payment, notes, subtotal, total, status, created_at)
select o.id,
       (select c.id from cameliaboutique.customers c where c.id = o.customer_id),
       'web', o.customer_name, o.phone, o.email, o.address, o.city,
       o.delivery, o.payment, o.notes, o.subtotal, o.total,
       o.status::text::cameliaboutique.order_status, o.created_at
  from boutique.orders o
on conflict (id) do nothing;

-- 5. Ítems (el producto se resuelve por slug)
insert into cameliaboutique.order_items (id, order_id, product_id, name, price, qty, subtotal)
select i.id, i.order_id, np.id, i.name, i.price, i.qty, i.subtotal
  from boutique.order_items i
  left join boutique.products op on op.id = i.product_id
  left join cameliaboutique.products np on np.slug = op.slug
 where exists (select 1 from cameliaboutique.orders o where o.id = i.order_id)
on conflict (id) do nothing;

commit;

-- Resumen
select 'categorías' as que, count(*) from cameliaboutique.categories
union all select 'productos', count(*) from cameliaboutique.products
union all select 'clientes', count(*) from cameliaboutique.customers
union all select 'pedidos', count(*) from cameliaboutique.orders;

-- Que la API recargue el schema.
notify pgrst, 'reload schema';
