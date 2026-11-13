-- =====================================================================
--  Camélia Boutique — schema "cameliaboutique" (Supabase self-hosted)
--  Pegar completo en el SQL Editor y ejecutar. Es idempotente.
--
--  Todo vive en el schema cameliaboutique. Lo único que se crea fuera de
--  él es lo que Supabase exige para tener imágenes en un bucket:
--    · el bucket "cameliaboutique" (fila en storage.buckets)
--    · 4 policies sobre storage.objects, limitadas a ese bucket
--  No se toca public, auth ni ningún otro schema.
--
--  Antes de usar el panel: crear el usuario admin@cameliaboutique.com
--  en Authentication → Users (con contraseña, email confirmado).
-- =====================================================================

create schema if not exists cameliaboutique;

grant usage on schema cameliaboutique to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  ADMINS + is_admin()
-- ---------------------------------------------------------------------
create table if not exists cameliaboutique.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);
insert into cameliaboutique.admins (email) values ('admin@cameliaboutique.com')
on conflict (email) do nothing;

create or replace function cameliaboutique.is_admin()
returns boolean
language sql
stable
security definer
set search_path = cameliaboutique, pg_temp
as $$
  select exists (
    select 1 from cameliaboutique.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
--  CATÁLOGO
-- ---------------------------------------------------------------------
create table if not exists cameliaboutique.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists cameliaboutique.products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references cameliaboutique.categories(id) on delete set null,
  name        text not null,
  slug        text not null unique,
  description text,
  price       numeric(12,0) not null check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  images      text[] not null default '{}',   -- URLs públicas del bucket
  keywords    text,                           -- sinónimos para el bot ("tapado, abrigo")
  featured    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cb_products_category_idx on cameliaboutique.products(category_id);
create index if not exists cb_products_active_idx   on cameliaboutique.products(active) where active;

-- ---------------------------------------------------------------------
--  CONTACTOS / CLIENTES (checkout + bot)
-- ---------------------------------------------------------------------
create table if not exists cameliaboutique.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  email      text,
  address    text,
  city       text,
  notes      text,
  source     text not null default 'web',    -- web | bot | whatsapp | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cb_customers_phone_idx on cameliaboutique.customers(phone);

-- ---------------------------------------------------------------------
--  CONVERSACIONES DEL BOT
-- ---------------------------------------------------------------------
create table if not exists cameliaboutique.conversations (
  id              uuid primary key default gen_random_uuid(),
  token           uuid not null default gen_random_uuid(),  -- secreto del visitante
  channel         text not null default 'web',               -- web | whatsapp
  customer_id     uuid references cameliaboutique.customers(id) on delete set null,
  visitor_name    text,
  visitor_phone   text,
  status          text not null default 'bot'
                  check (status in ('bot','humano','cerrada')),
  needs_human     boolean not null default false,
  has_audio       boolean not null default false,
  taken_by        text,
  state           jsonb not null default '{}'::jsonb,          -- paso del flujo del bot
  unread          integer not null default 0,
  last_message    text,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists cb_conv_last_idx on cameliaboutique.conversations(last_message_at desc);

create table if not exists cameliaboutique.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references cameliaboutique.conversations(id) on delete cascade,
  sender          text not null check (sender in ('cliente','bot','agente')),
  kind            text not null default 'texto' check (kind in ('texto','audio')),
  body            text not null,
  options         jsonb,                     -- botones que mostró el bot
  created_at      timestamptz not null default now()
);
create index if not exists cb_messages_conv_idx on cameliaboutique.messages(conversation_id, created_at);

-- ---------------------------------------------------------------------
--  PEDIDOS / AGENDA
-- ---------------------------------------------------------------------
do $$ begin
  create type cameliaboutique.order_status as enum
    ('pendiente','confirmado','preparando','enviado','entregado','cancelado');
exception when duplicate_object then null; end $$;

create table if not exists cameliaboutique.orders (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references cameliaboutique.customers(id) on delete set null,
  conversation_id uuid references cameliaboutique.conversations(id) on delete set null,
  source          text not null default 'web',          -- web | bot | whatsapp | manual
  customer_name   text not null,
  phone           text not null,
  email           text,
  address         text,
  city            text,
  delivery        text not null default 'delivery',     -- delivery | pickup
  payment         text not null default 'transferencia',
  delivery_date   date,                                 -- día agendado
  notes           text,
  subtotal        numeric(12,0) not null default 0,
  total           numeric(12,0) not null default 0,
  status          cameliaboutique.order_status not null default 'pendiente',
  created_at      timestamptz not null default now()
);
create index if not exists cb_orders_status_idx   on cameliaboutique.orders(status);
create index if not exists cb_orders_created_idx  on cameliaboutique.orders(created_at desc);
create index if not exists cb_orders_delivery_idx on cameliaboutique.orders(delivery_date);

create table if not exists cameliaboutique.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references cameliaboutique.orders(id) on delete cascade,
  product_id uuid references cameliaboutique.products(id) on delete set null,
  name       text not null,
  price      numeric(12,0) not null,
  qty        integer not null check (qty > 0),
  subtotal   numeric(12,0) not null
);
create index if not exists cb_order_items_order_idx on cameliaboutique.order_items(order_id);

-- ---------------------------------------------------------------------
--  BOT: respuestas / palabras clave
-- ---------------------------------------------------------------------
create table if not exists cameliaboutique.bot_intents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  keywords    text[] not null default '{}',
  response    text not null default '',
  action      text not null default 'respuesta'
              check (action in ('respuesta','productos','pedido','humano','horarios')),
  menu_label  text,                 -- si tiene texto, aparece como botón del menú
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  CONFIGURACIÓN (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists cameliaboutique.settings (
  id               integer primary key default 1 check (id = 1),
  store_name       text not null default 'Camélia Boutique',
  whatsapp_number  text not null default '595981000000',
  email            text default 'hola@camelia.py',
  address          text default 'Asunción, Paraguay',
  hours            text not null default 'Lunes a viernes de 9:00 a 19:00 y sábados de 9:00 a 13:00.',
  bot_enabled      boolean not null default true,
  bot_auto_confirm boolean not null default false,
  bot_name         text not null default 'Camila',
  welcome_message  text not null default '¡Hola! Soy Camila, la asistente de Camélia Boutique 🌸 ¿En qué te ayudo?',
  fallback_message text not null default 'Perdón, no te entendí bien. Podés elegir una opción o escribir el nombre de un producto.',
  handoff_message  text not null default 'Listo, le aviso a una persona del equipo. Te responden por acá en breve.',
  offline_message  text not null default 'En este momento el asistente está apagado. Dejanos tu mensaje y te respondemos apenas podamos.',
  audio_message    text not null default 'Todavía no puedo escuchar audios 🙈 ¿Me lo escribís o elegís una opción?',
  notify_name      text,            -- a quién se avisa cuando entra un pedido (solo admin)
  notify_whatsapp  text,
  notify_email     text,
  updated_at       timestamptz not null default now()
);
insert into cameliaboutique.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
--  updated_at
-- ---------------------------------------------------------------------
create or replace function cameliaboutique.touch_updated_at()
returns trigger language plpgsql set search_path = cameliaboutique, pg_temp as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_products_touch on cameliaboutique.products;
create trigger trg_products_touch before update on cameliaboutique.products
  for each row execute function cameliaboutique.touch_updated_at();
drop trigger if exists trg_customers_touch on cameliaboutique.customers;
create trigger trg_customers_touch before update on cameliaboutique.customers
  for each row execute function cameliaboutique.touch_updated_at();
drop trigger if exists trg_settings_touch on cameliaboutique.settings;
create trigger trg_settings_touch before update on cameliaboutique.settings
  for each row execute function cameliaboutique.touch_updated_at();

-- ---------------------------------------------------------------------
--  STOCK: cancelar devuelve stock, reactivar lo vuelve a descontar
-- ---------------------------------------------------------------------
create or replace function cameliaboutique.order_stock_sync()
returns trigger language plpgsql security definer
set search_path = cameliaboutique, pg_temp as $$
declare r record;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'cancelado' then
      update cameliaboutique.products p set stock = p.stock + i.qty
        from cameliaboutique.order_items i
       where i.order_id = old.id and i.product_id = p.id;
    end if;
    return old;
  end if;

  if old.status <> 'cancelado' and new.status = 'cancelado' then
    update cameliaboutique.products p set stock = p.stock + i.qty
      from cameliaboutique.order_items i
     where i.order_id = new.id and i.product_id = p.id;
  elsif old.status = 'cancelado' and new.status <> 'cancelado' then
    for r in
      select p.id, p.name, p.stock, i.qty
        from cameliaboutique.order_items i
        join cameliaboutique.products p on p.id = i.product_id
       where i.order_id = new.id
       order by p.id
         for update of p
    loop
      if r.stock < r.qty then
        raise exception 'No hay stock para reactivar el pedido: % (hay %, se necesitan %)', r.name, r.stock, r.qty;
      end if;
      update cameliaboutique.products set stock = stock - r.qty where id = r.id;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_stock on cameliaboutique.orders;
create trigger trg_orders_stock before update of status on cameliaboutique.orders
  for each row execute function cameliaboutique.order_stock_sync();
drop trigger if exists trg_orders_stock_del on cameliaboutique.orders;
create trigger trg_orders_stock_del before delete on cameliaboutique.orders
  for each row execute function cameliaboutique.order_stock_sync();

-- ---------------------------------------------------------------------
--  create_order(): checkout y bot.
--  Toma los precios de la base (no del navegador), bloquea las filas
--  de producto y revisa stock antes de guardar: si dos clientes piden
--  la última unidad al mismo tiempo, solo uno se la lleva.
-- ---------------------------------------------------------------------
create or replace function cameliaboutique.create_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = cameliaboutique, pg_temp
as $$
declare
  v_source   text := coalesce(nullif(p->>'source',''), 'web');
  v_name     text := trim(coalesce(p->>'name',''));
  v_phone    text := trim(coalesce(p->>'phone',''));
  v_r        record;
  v_short    jsonb := '[]'::jsonb;
  v_total    numeric := 0;
  v_customer uuid;
  v_order    uuid;
  v_status   cameliaboutique.order_status := 'pendiente';
  v_conv     uuid;
  v_items    jsonb;
begin
  if v_source not in ('web','bot','whatsapp') then v_source := 'web'; end if;
  if v_name = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'Faltan nombre o teléfono');
  end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    return jsonb_build_object('ok', false, 'error', 'El pedido está vacío');
  end if;

  -- agrupa ítems repetidos
  select coalesce(jsonb_agg(jsonb_build_object('product_id', s.pid, 'qty', s.q) order by s.pid), '[]'::jsonb)
    into v_items
    from (select (e->>'product_id')::uuid as pid, sum((e->>'qty')::int) as q
            from jsonb_array_elements(p->'items') e group by 1) s;
  if exists (select 1 from jsonb_to_recordset(v_items) i(product_id uuid, qty int)
              where i.qty is null or i.qty <= 0) then
    return jsonb_build_object('ok', false, 'error', 'Cantidad inválida');
  end if;

  -- bloquea las filas de producto (orden fijo para evitar deadlocks)
  perform 1 from cameliaboutique.products pr
   where pr.id in (select i.product_id from jsonb_to_recordset(v_items) i(product_id uuid, qty int))
   order by pr.id
     for update;

  for v_r in
    select i.product_id, i.qty, pr.id as pid, pr.name, pr.stock, pr.price, pr.active
      from jsonb_to_recordset(v_items) i(product_id uuid, qty int)
      left join cameliaboutique.products pr on pr.id = i.product_id
     order by i.product_id
  loop
    if v_r.pid is null or not v_r.active then
      v_short := v_short || jsonb_build_object('product_id', v_r.product_id, 'name', v_r.name, 'requested', v_r.qty, 'available', 0);
    elsif v_r.stock < v_r.qty then
      v_short := v_short || jsonb_build_object('product_id', v_r.product_id, 'name', v_r.name, 'requested', v_r.qty, 'available', v_r.stock);
    else
      v_total := v_total + v_r.price * v_r.qty;
    end if;
  end loop;

  if jsonb_array_length(v_short) > 0 then
    return jsonb_build_object('ok', false, 'error', 'stock', 'shortages', v_short);
  end if;

  -- contacto: reutiliza por teléfono
  select id into v_customer from cameliaboutique.customers where phone = v_phone order by created_at limit 1;
  if v_customer is null then
    insert into cameliaboutique.customers (name, phone, email, address, city, source)
    values (v_name, v_phone, nullif(p->>'email',''), nullif(p->>'address',''), nullif(p->>'city',''), v_source)
    returning id into v_customer;
  else
    update cameliaboutique.customers set
      name    = v_name,
      email   = coalesce(nullif(p->>'email',''), email),
      address = coalesce(nullif(p->>'address',''), address),
      city    = coalesce(nullif(p->>'city',''), city)
    where id = v_customer;
  end if;

  if v_source in ('bot','whatsapp') and (select bot_auto_confirm from cameliaboutique.settings where id = 1) then
    v_status := 'confirmado';
  end if;

  if nullif(p->>'conversation_id','') is not null then
    select id into v_conv from cameliaboutique.conversations
     where id = (p->>'conversation_id')::uuid and token = (p->>'conversation_token')::uuid;
  end if;

  insert into cameliaboutique.orders
    (customer_id, conversation_id, source, customer_name, phone, email, address, city,
     delivery, payment, delivery_date, notes, subtotal, total, status)
  values
    (v_customer, v_conv, v_source, v_name, v_phone, nullif(p->>'email',''),
     nullif(p->>'address',''), nullif(p->>'city',''),
     coalesce(nullif(p->>'delivery',''), 'delivery'),
     coalesce(nullif(p->>'payment',''), 'transferencia'),
     nullif(p->>'delivery_date','')::date,
     nullif(p->>'notes',''), v_total, v_total, v_status)
  returning id into v_order;

  insert into cameliaboutique.order_items (order_id, product_id, name, price, qty, subtotal)
  select v_order, pr.id, pr.name, pr.price, i.qty, pr.price * i.qty
    from jsonb_to_recordset(v_items) i(product_id uuid, qty int)
    join cameliaboutique.products pr on pr.id = i.product_id;

  update cameliaboutique.products pr set stock = pr.stock - i.qty
    from jsonb_to_recordset(v_items) i(product_id uuid, qty int) where pr.id = i.product_id;

  if v_conv is not null then
    update cameliaboutique.conversations set customer_id = v_customer where id = v_conv;
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order, 'total', v_total, 'status', v_status);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Datos inválidos');
end $$;

-- ---------------------------------------------------------------------
--  RPCs del chat (el visitante solo accede a SU conversación con token)
-- ---------------------------------------------------------------------

-- Configuración pública del bot + menú
create or replace function cameliaboutique.bot_config()
returns jsonb language sql stable security definer
set search_path = cameliaboutique, pg_temp as $$
  select jsonb_build_object(
    'settings', (select jsonb_build_object(
        'store_name', store_name, 'whatsapp_number', whatsapp_number, 'email', email,
        'address', address, 'hours', hours, 'bot_enabled', bot_enabled, 'bot_name', bot_name,
        'welcome_message', welcome_message, 'fallback_message', fallback_message,
        'handoff_message', handoff_message, 'offline_message', offline_message,
        'audio_message', audio_message)
      from cameliaboutique.settings where id = 1),
    'intents', coalesce((select jsonb_agg(to_jsonb(b) - 'created_at' order by b.sort_order, b.name)
      from cameliaboutique.bot_intents b where b.active), '[]'::jsonb)
  );
$$;

-- Abre (o retoma) una conversación
create or replace function cameliaboutique.chat_open(p_id uuid default null, p_token uuid default null, p_channel text default 'web')
returns jsonb language plpgsql security definer
set search_path = cameliaboutique, pg_temp as $$
declare c cameliaboutique.conversations;
begin
  if p_id is not null then
    select * into c from cameliaboutique.conversations where id = p_id and token = p_token;
  end if;
  if c.id is null then
    insert into cameliaboutique.conversations (channel)
    values (case when p_channel in ('web','whatsapp') then p_channel else 'web' end)
    returning * into c;
  end if;
  return jsonb_build_object(
    'id', c.id, 'token', c.token, 'status', c.status, 'state', c.state,
    'visitor_name', c.visitor_name, 'visitor_phone', c.visitor_phone,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'kind', m.kind, 'body', m.body,
        'options', m.options, 'created_at', m.created_at) order by m.created_at)
      from (select * from cameliaboutique.messages where conversation_id = c.id
            order by created_at desc limit 80) m), '[]'::jsonb)
  );
end $$;

-- Guarda mensajes nuevos + estado del flujo
create or replace function cameliaboutique.chat_append(
  p_id uuid, p_token uuid, p_messages jsonb,
  p_state jsonb default null, p_needs_human boolean default null,
  p_status text default null, p_visitor_name text default null,
  p_visitor_phone text default null, p_has_audio boolean default null)
returns jsonb language plpgsql security definer
set search_path = cameliaboutique, pg_temp as $$
declare
  c cameliaboutique.conversations;
  m jsonb;
  v_client int := 0;
  v_last text;
begin
  select * into c from cameliaboutique.conversations where id = p_id and token = p_token for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'conversación inválida'); end if;

  for m in select * from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    if coalesce(m->>'sender','') not in ('cliente','bot') then continue; end if;
    if length(coalesce(m->>'body','')) = 0 then continue; end if;
    insert into cameliaboutique.messages (conversation_id, sender, kind, body, options)
    values (c.id, m->>'sender',
            case when m->>'kind' = 'audio' then 'audio' else 'texto' end,
            left(m->>'body', 4000), m->'options');
    if m->>'sender' = 'cliente' then v_client := v_client + 1; end if;
    v_last := left(m->>'body', 200);
  end loop;

  update cameliaboutique.conversations set
    state           = coalesce(p_state, state),
    needs_human     = coalesce(p_needs_human, needs_human),
    has_audio       = has_audio or coalesce(p_has_audio, false),
    status          = case when p_status in ('bot','humano') and status <> 'humano' then p_status
                           when status = 'cerrada' and v_client > 0 then 'bot'
                           else status end,
    visitor_name    = coalesce(nullif(p_visitor_name,''), visitor_name),
    visitor_phone   = coalesce(nullif(p_visitor_phone,''), visitor_phone),
    unread          = unread + v_client,
    last_message    = coalesce(v_last, last_message),
    last_message_at = case when v_last is null then last_message_at else now() end
  where id = c.id
  returning * into c;

  return jsonb_build_object('ok', true, 'status', c.status);
end $$;

-- Mensajes posteriores a una fecha (para ver respuestas del equipo)
create or replace function cameliaboutique.chat_poll(p_id uuid, p_token uuid, p_after timestamptz)
returns jsonb language sql stable security definer
set search_path = cameliaboutique, pg_temp as $$
  select case when c.id is null then null else jsonb_build_object(
    'status', c.status,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'kind', m.kind, 'body', m.body,
        'options', m.options, 'created_at', m.created_at) order by m.created_at)
      from cameliaboutique.messages m
     where m.conversation_id = c.id and m.created_at > coalesce(p_after, '-infinity')), '[]'::jsonb))
  end
  from (select * from cameliaboutique.conversations where id = p_id and token = p_token) c
  right join (select 1) one on true;
$$;

-- ---------------------------------------------------------------------
--  WHATSAPP (puente Baileys por QR)
--  El puente reenvía cada mensaje a la web; la web valida el secreto
--  contra wa_config, que nadie puede leer por la API (sin grants ni policies).
--  Para copiarlo al puente y a Vercel:
--    select bridge_secret from cameliaboutique.wa_config;
-- ---------------------------------------------------------------------
alter table cameliaboutique.conversations add column if not exists wa_id text;  -- a quién se le responde
create unique index if not exists cb_conv_wa_idx on cameliaboutique.conversations(wa_id) where channel = 'whatsapp';

alter table cameliaboutique.settings add column if not exists wa_bot_enabled   boolean not null default true;
alter table cameliaboutique.settings add column if not exists wa_notify_orders boolean not null default true;

create table if not exists cameliaboutique.wa_config (
  id            integer primary key default 1 check (id = 1),
  bridge_secret text not null
);
insert into cameliaboutique.wa_config (id, bridge_secret)
values (1, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create table if not exists cameliaboutique.wa_seen (
  wa_message_id text primary key,
  created_at    timestamptz not null default now()
);

create or replace function cameliaboutique.wa_secret_ok(p_secret text)
returns boolean language sql stable security definer
set search_path = cameliaboutique, pg_temp as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from cameliaboutique.wa_config where id = 1 and bridge_secret = p_secret);
$$;

-- Mensaje entrante: deduplica, abre/retoma la conversación de ese número
create or replace function cameliaboutique.wa_inbound(
  p_secret text, p_wa_id text, p_message_id text,
  p_phone text default null, p_name text default null)
returns jsonb language plpgsql security definer
set search_path = cameliaboutique, pg_temp as $$
declare
  c   cameliaboutique.conversations;
  s   cameliaboutique.settings;
  n   int;
begin
  if not cameliaboutique.wa_secret_ok(p_secret) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if coalesce(p_wa_id, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'falta el número');
  end if;

  if coalesce(p_message_id, '') <> '' then
    insert into cameliaboutique.wa_seen (wa_message_id) values (p_message_id) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('ok', true, 'duplicate', true); end if;
    delete from cameliaboutique.wa_seen where created_at < now() - interval '7 days';
  end if;

  select * into c from cameliaboutique.conversations where channel = 'whatsapp' and wa_id = p_wa_id;
  if c.id is null then
    insert into cameliaboutique.conversations (channel, wa_id, visitor_name, visitor_phone)
    values ('whatsapp', p_wa_id, nullif(p_name, ''), coalesce(nullif(p_phone, ''), p_wa_id))
    on conflict (wa_id) where channel = 'whatsapp' do update set visitor_name = cameliaboutique.conversations.visitor_name
    returning * into c;
  elsif nullif(p_phone, '') is not null and c.visitor_phone is distinct from p_phone then
    update cameliaboutique.conversations set visitor_phone = p_phone where id = c.id returning * into c;
  end if;
  select * into s from cameliaboutique.settings where id = 1;

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'id', c.id, 'token', c.token, 'status', c.status, 'state', c.state,
    'visitor_name', c.visitor_name, 'visitor_phone', c.visitor_phone,
    'bot_enabled', s.bot_enabled and s.wa_bot_enabled,
    'notify_whatsapp', s.notify_whatsapp,
    -- lo que la tienda mandó hace poco: sirve para reconocer el eco de nuestros propios envíos
    'recent_out', coalesce((select jsonb_agg(m.body) from cameliaboutique.messages m
                             where m.conversation_id = c.id and m.sender in ('bot','agente')
                               and m.created_at > now() - interval '15 minutes'), '[]'::jsonb)
  );
end $$;

-- Mensaje escrito por el equipo desde el celular de la tienda: queda como "Equipo" y pausa el bot
create or replace function cameliaboutique.wa_agent_message(p_secret text, p_conversation uuid, p_body text)
returns jsonb language plpgsql security definer
set search_path = cameliaboutique, pg_temp as $$
begin
  if not cameliaboutique.wa_secret_ok(p_secret) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if coalesce(trim(p_body), '') = '' then return jsonb_build_object('ok', true); end if;
  insert into cameliaboutique.messages (conversation_id, sender, body)
  values (p_conversation, 'agente', left(p_body, 4000));
  update cameliaboutique.conversations set
    status = 'humano', needs_human = false, taken_by = coalesce(taken_by, 'celular de la tienda'),
    last_message = left(p_body, 200), last_message_at = now()
  where id = p_conversation;
  return jsonb_build_object('ok', true);
end $$;

-- Datos para avisar de un pedido nuevo al responsable
create or replace function cameliaboutique.wa_order_alert(p_secret text, p_order uuid)
returns jsonb language plpgsql stable security definer
set search_path = cameliaboutique, pg_temp as $$
declare s cameliaboutique.settings;
begin
  if not cameliaboutique.wa_secret_ok(p_secret) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  select * into s from cameliaboutique.settings where id = 1;
  return jsonb_build_object(
    'ok', true,
    'enabled', s.wa_notify_orders and coalesce(s.notify_whatsapp, '') <> '',
    'to', s.notify_whatsapp,
    'pending', (select count(*) from cameliaboutique.orders where status = 'pendiente'),
    'order', (select to_jsonb(o) || jsonb_build_object('items',
                coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty)) from cameliaboutique.order_items i where i.order_id = o.id), '[]'::jsonb))
              from cameliaboutique.orders o where o.id = p_order)
  );
end $$;

-- ---------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------
alter table cameliaboutique.wa_config enable row level security;
alter table cameliaboutique.wa_seen   enable row level security;
alter table cameliaboutique.admins        enable row level security;
alter table cameliaboutique.categories    enable row level security;
alter table cameliaboutique.products      enable row level security;
alter table cameliaboutique.customers     enable row level security;
alter table cameliaboutique.conversations enable row level security;
alter table cameliaboutique.messages      enable row level security;
alter table cameliaboutique.orders        enable row level security;
alter table cameliaboutique.order_items   enable row level security;
alter table cameliaboutique.bot_intents   enable row level security;
alter table cameliaboutique.settings      enable row level security;

-- lectura pública del catálogo activo
drop policy if exists cb_public_categories on cameliaboutique.categories;
create policy cb_public_categories on cameliaboutique.categories
  for select to anon, authenticated using (active);
drop policy if exists cb_public_products on cameliaboutique.products;
create policy cb_public_products on cameliaboutique.products
  for select to anon, authenticated using (active);

-- lectura pública de settings (las columnas notify_* no se otorgan a anon, ver grants)
drop policy if exists cb_public_settings on cameliaboutique.settings;
create policy cb_public_settings on cameliaboutique.settings
  for select to anon, authenticated using (true);

-- admin: todo en todas las tablas
do $$
declare t text;
begin
  foreach t in array array['admins','categories','products','customers','conversations',
                           'messages','orders','order_items','bot_intents','settings']
  loop
    execute format('drop policy if exists cb_admin_all on cameliaboutique.%I', t);
    execute format('create policy cb_admin_all on cameliaboutique.%I for all to authenticated
                    using (cameliaboutique.is_admin()) with check (cameliaboutique.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  GRANTS (solo dentro del schema)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema cameliaboutique from anon, authenticated;
revoke all on all functions in schema cameliaboutique from public, anon, authenticated;

grant select on cameliaboutique.categories, cameliaboutique.products to anon;
grant select (id, store_name, whatsapp_number, email, address, hours, bot_enabled, bot_name,
              welcome_message, fallback_message, handoff_message, offline_message, audio_message)
  on cameliaboutique.settings to anon;

grant select, insert, update, delete on all tables in schema cameliaboutique to authenticated;
grant all on all tables in schema cameliaboutique to service_role;

grant execute on function cameliaboutique.is_admin()        to anon, authenticated, service_role;
grant execute on function cameliaboutique.create_order(jsonb) to anon, authenticated, service_role;
grant execute on function cameliaboutique.bot_config()        to anon, authenticated, service_role;
grant execute on function cameliaboutique.chat_open(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function cameliaboutique.chat_append(uuid, uuid, jsonb, jsonb, boolean, text, text, text, boolean)
  to anon, authenticated, service_role;
grant execute on function cameliaboutique.chat_poll(uuid, uuid, timestamptz) to anon, authenticated, service_role;

-- WhatsApp: el secreto y los ids vistos no se exponen a nadie por la API
revoke all on cameliaboutique.wa_config, cameliaboutique.wa_seen from anon, authenticated;
grant execute on function cameliaboutique.wa_inbound(text, text, text, text, text)  to anon, authenticated, service_role;
grant execute on function cameliaboutique.wa_agent_message(text, uuid, text)        to anon, authenticated, service_role;
grant execute on function cameliaboutique.wa_order_alert(text, uuid)                to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  STORAGE: bucket "cameliaboutique" (imágenes públicas, solo admin sube)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cameliaboutique', 'cameliaboutique', true, 8388608,
        array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cameliaboutique_read"   on storage.objects;
drop policy if exists "cameliaboutique_insert" on storage.objects;
drop policy if exists "cameliaboutique_update" on storage.objects;
drop policy if exists "cameliaboutique_delete" on storage.objects;

create policy "cameliaboutique_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'cameliaboutique');
create policy "cameliaboutique_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'cameliaboutique' and cameliaboutique.is_admin());
create policy "cameliaboutique_update" on storage.objects
  for update to authenticated using (bucket_id = 'cameliaboutique' and cameliaboutique.is_admin());
create policy "cameliaboutique_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cameliaboutique' and cameliaboutique.is_admin());

-- ---------------------------------------------------------------------
--  DATOS INICIALES
-- ---------------------------------------------------------------------
insert into cameliaboutique.categories (name, slug, description, sort_order) values
  ('Sacos & Abrigos','sacos','Sacos, tapados y abrigos de temporada',1),
  ('Suéteres','sueteres','Suéteres tejidos y de punto',2),
  ('Remeras','remeras','Remeras y blusas',3),
  ('Bufandas','bufandas','Bufandas y pashminas',4),
  ('Accesorios','accesorios','Accesorios seleccionados',5)
on conflict (slug) do nothing;

insert into cameliaboutique.products (category_id, name, slug, description, price, stock, keywords, featured)
select c.id, x.name, x.slug, x.description, x.price, x.stock, x.keywords, x.featured
from cameliaboutique.categories c
join (values
  ('sacos',     'Saco Camélia',       'saco-camelia',       'Saco de paño en tono rose, corte oversize.',               480000, 6,  'abrigo, campera',  true),
  ('sacos',     'Tapado Bisque',      'tapado-bisque',      'Tapado largo en bisque con cinturón.',                      620000, 3,  'abrigo largo',     true),
  ('sueteres',  'Suéter Thyme',       'sueter-thyme',       'Suéter de punto grueso en verde thyme.',                   280000, 12, 'buzo, tejido',     true),
  ('sueteres',  'Cardigan Champagne', 'cardigan-champagne', 'Cardigan liviano tono champagne.',                         260000, 8,  'saquito, tejido',  false),
  ('remeras',   'Remera Blush',       'remera-blush',       'Remera de algodón peinado, cuello redondo.',               120000, 20, 'polera, rosada',   true),
  ('remeras',   'Blusa Antique',      'blusa-antique',      'Blusa de gasa con detalle floral.',                        180000, 10, 'camisa',           false),
  ('bufandas',  'Bufanda Rose',       'bufanda-rose',       'Bufanda tejida a mano en antique rose.',                    95000, 15, 'chalina',          true),
  ('bufandas',  'Pashmina Bisque',    'pashmina-bisque',    'Pashmina de lana suave en bisque.',                        110000, 9,  'chal, chalina',    false),
  ('accesorios','Vincha Camélia',     'vincha-camelia',     'Vincha con flor de camelia bordada.',                       45000, 25, 'diadema, pelo',    false),
  ('accesorios','Cinturón Thyme',     'cinturon-thyme',     'Cinturón de cuero verde thyme.',                            80000, 14, 'cinto',            false),
  ('remeras',   'Top Art Nouveau',    'top-art-nouveau',    'Top con estampa Art Nouveau exclusiva.',                   150000, 7,  'musculosa',        true),
  ('sacos',     'Trench Champagne',   'trench-champagne',   'Trench liviano en color champagne, ideal media estación.', 550000, 4,  'piloto, gabardina', false)
) as x(cat_slug, name, slug, description, price, stock, keywords, featured)
  on c.slug = x.cat_slug
on conflict (slug) do nothing;

insert into cameliaboutique.bot_intents (name, keywords, response, action, menu_label, sort_order)
select * from (values
  ('Ver productos',   array['productos','catalogo','que tienen','que venden','ver','precio','precios','cuanto','cuesta','sale','stock','hay'],
                      'Estos son algunos de nuestros productos. Escribí el nombre de lo que buscás y te digo precio y stock.',
                      'productos', 'Ver productos', 1),
  ('Hacer un pedido', array['pedido','pedir','comprar','quiero','encargar','reservar','llevar'],
                      'Perfecto, armemos tu pedido.', 'pedido', 'Hacer un pedido', 2),
  ('Horarios',        array['horario','horarios','abren','cierran','atienden','hora'],
                      'Nuestro horario de atención es:', 'horarios', 'Horarios', 3),
  ('Hablar con una persona', array['persona','humano','asesor','asesora','vendedora','atencion','ayuda'],
                      '', 'humano', 'Hablar con una persona', 4),
  ('Envíos',          array['envio','envios','delivery','entrega','enviar','mandan'],
                      'Hacemos envíos a todo el país. En Asunción y Gran Asunción llega en 24-48 h; al interior por encomienda. También podés retirar en el local.',
                      'respuesta', null, 5),
  ('Formas de pago',  array['pago','pagar','transferencia','tarjeta','efectivo','qr'],
                      'Aceptamos transferencia, tarjeta y efectivo contra entrega.', 'respuesta', null, 6),
  ('Cambios',         array['cambio','cambios','devolucion','talle','talles'],
                      'Podés cambiar tu prenda hasta 7 días después de recibirla, con etiqueta y sin uso.', 'respuesta', null, 7),
  ('Ubicación',       array['donde','direccion','ubicacion','local','tienda'],
                      'Estamos en Asunción, Paraguay. Escribinos y te pasamos la ubicación exacta.', 'respuesta', null, 8),
  ('Saludo',          array['hola','buenas','buen dia','buenos dias','buenas tardes','buenas noches'],
                      '¡Hola! ¿En qué te puedo ayudar?', 'respuesta', null, 9),
  ('Gracias',         array['gracias','genial','perfecto','dale'],
                      '¡De nada! Si necesitás algo más, acá estoy 🌸', 'respuesta', null, 10)
) v(name, keywords, response, action, menu_label, sort_order)
where not exists (select 1 from cameliaboutique.bot_intents);

-- Para el realtime del panel no hace falta nada: el panel consulta cada pocos segundos.
-- Exponer el schema: agregar "cameliaboutique" a PGRST_DB_SCHEMAS y reiniciar rest.
