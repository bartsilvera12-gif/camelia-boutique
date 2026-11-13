// Reconoce productos del catálogo en una foto o captura de pantalla, sin IA y gratis.
//
// Cómo funciona: cada foto del catálogo se resume en una grilla chiquita de 8×10 (forma en gris
// + color medio por celda). En la captura del cliente se prueban ventanas de varios tamaños y
// posiciones (la foto puede estar en cualquier parte: en la ficha, en una tarjeta del catálogo,
// recortada por el borde del celular) y se busca la que más se parece a cada producto.
// Funciona bien con capturas de la propia web; con fotos sacadas de otro lado no promete nada.
import sharp from "sharp";
import type { Product } from "../types";

const GW = 8;
const GH = 10;
const CELLS = GW * GH;

type Img = { data: Buffer; w: number; h: number };
type Integral = { S: Float64Array[]; w: number; h: number };
type Desc = { g: Float64Array; col: Float64Array; sd: number };

/** Proporciones en que la web muestra las fotos (ancho/alto) y recortes por un costado. */
const VARIANTS = [
  { a: 0.8, fx: 0, fw: 1 },
  { a: 0.67, fx: 0, fw: 1 },
  { a: 1, fx: 0, fw: 1 },
  { a: 0.75, fx: 0, fw: 1 },
  { a: 0.8, fx: 0, fw: 0.8 }, // foto cortada a la derecha (pantalla del celular)
  { a: 0.8, fx: 0.2, fw: 0.8 }, // cortada a la izquierda
];

/** Puntaje mínimo para decir "es este" y para "puede ser". Calibrado con capturas reales. */
export const MATCH_SURE = 0.55;
export const MATCH_MAYBE = 0.47;

async function load(input: Buffer, width: number): Promise<Img> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function integral(img: Img): Integral {
  const { data, w, h } = img;
  const S = [0, 1, 2].map(() => new Float64Array((w + 1) * (h + 1)));
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 3; c++) {
      let row = 0;
      const s = S[c];
      for (let x = 0; x < w; x++) {
        row += data[(y * w + x) * 3 + c];
        s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row;
      }
    }
  return { S, w, h };
}

function boxMean(I: Integral, c: number, x0: number, y0: number, x1: number, y1: number) {
  const s = I.S[c];
  const W = I.w + 1;
  return (s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
}

function describe(I: Integral, x: number, y: number, ww: number, hh: number): Desc {
  const g = new Float64Array(CELLS);
  const col = new Float64Array(CELLS * 3);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x0 = Math.round(x + (i * ww) / GW);
      const x1 = Math.max(x0 + 1, Math.round(x + ((i + 1) * ww) / GW));
      const y0 = Math.round(y + (j * hh) / GH);
      const y1 = Math.max(y0 + 1, Math.round(y + ((j + 1) * hh) / GH));
      const r = boxMean(I, 0, x0, y0, x1, y1);
      const gg = boxMean(I, 1, x0, y0, x1, y1);
      const b = boxMean(I, 2, x0, y0, x1, y1);
      const k = j * GW + i;
      col[k * 3] = r;
      col[k * 3 + 1] = gg;
      col[k * 3 + 2] = b;
      g[k] = 0.299 * r + 0.587 * gg + 0.114 * b;
    }
  let m = 0;
  for (let k = 0; k < CELLS; k++) m += g[k];
  m /= CELLS;
  let sd = 0;
  for (let k = 0; k < CELLS; k++) {
    g[k] -= m;
    sd += g[k] * g[k];
  }
  sd = Math.sqrt(sd / CELLS);
  if (sd > 0) for (let k = 0; k < CELLS; k++) g[k] /= sd;
  return { g, col, sd };
}

/** forma (correlación, -1..1) menos diferencia de color: cerca de 1 = la misma foto */
function similarity(a: Desc, b: Desc) {
  let z = 0;
  for (let k = 0; k < CELLS; k++) z += a.g[k] * b.g[k];
  z /= CELLS;
  let d = 0;
  for (let k = 0; k < a.col.length; k++) d += Math.abs(a.col[k] - b.col[k]);
  d /= a.col.length;
  return z - d / 60;
}

// ---------- huellas del catálogo (se guardan en memoria mientras la función siga viva) ----------

const cache = new Map<string, Promise<Desc[] | null>>();

async function fingerprint(url: string): Promise<Desc[] | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const img = await load(Buffer.from(await res.arrayBuffer()), 200);
    const I = integral(img);
    return VARIANTS.map((v) => {
      // recorte "cover" con la proporción de la variante
      let cw = img.w;
      let ch = Math.round(img.w / v.a);
      if (ch > img.h) {
        ch = img.h;
        cw = Math.round(img.h * v.a);
      }
      const cx = Math.round((img.w - cw) / 2);
      const cy = Math.round((img.h - ch) / 2);
      return describe(I, cx + Math.round(cw * v.fx), cy, Math.max(GW, Math.round(cw * v.fw)), ch);
    });
  } catch {
    return null;
  }
}

function productFingerprint(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fingerprint(url);
    cache.set(url, p);
    p.then((r) => r || cache.delete(url)); // si falló, se reintenta la próxima vez
  }
  return p;
}

export type ImageMatch = { product: Product; score: number };

/**
 * Productos que aparecen en la imagen, del más parecido al menos parecido.
 * `sure`: hay uno que coincide claramente. Si la captura es del catálogo pueden ser varios.
 */
export async function matchProducts(
  image: Buffer,
  products: Product[],
  baseUrl: string // para las fotos guardadas con ruta relativa (/products/…)
): Promise<{ sure: ImageMatch[]; maybe: ImageMatch[] }> {
  // hasta 3 fotos por producto
  const refs: { product: Product; descs: Desc[] }[] = [];
  await Promise.all(
    products.flatMap((p) =>
      (p.images || []).slice(0, 3).map(async (url) => {
        const abs = /^https?:\/\//i.test(url) ? url : baseUrl.replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");
        const d = await productFingerprint(abs);
        if (d) refs.push({ product: p, descs: d });
      })
    )
  );
  if (!refs.length) return { sure: [], maybe: [] };

  const meta = await sharp(image, { failOn: "none" }).rotate().metadata();
  const landscape = (meta.width || 1) > (meta.height || 1);
  const img = await load(image, landscape ? 320 : 240);
  const I = integral(img);

  const best = new Map<string, number>();
  const minW = Math.round(Math.min(img.w, img.h) * 0.16);
  VARIANTS.forEach((v, vi) => {
    const aspect = v.a * v.fw;
    for (let ww = img.w; ww >= minW; ww = Math.round(ww * 0.86)) {
      const hh = Math.round(ww / aspect);
      if (hh > img.h) continue;
      const step = Math.max(2, Math.round(ww / 16));
      for (let y = 0; y + hh <= img.h; y += step)
        for (let x = 0; x + ww <= img.w; x += step) {
          const d = describe(I, x, y, ww, hh);
          if (d.sd < 8) continue; // zona lisa (fondo, texto chico)
          for (const r of refs) {
            const s = similarity(d, r.descs[vi]);
            if (s > (best.get(r.product.id) ?? -9)) best.set(r.product.id, s);
          }
        }
    }
  });

  const ranked = [...best.entries()]
    .map(([id, score]) => ({ product: products.find((p) => p.id === id)!, score }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? -9;
  // los que quedan cerca del mejor; uno muy por debajo es casualidad
  const near = ranked.filter((m) => m.score >= top - 0.15);
  const sure = near.filter((m) => m.score >= MATCH_SURE).slice(0, 4);
  const maybe = sure.length ? [] : near.filter((m) => m.score >= MATCH_MAYBE).slice(0, 3);
  return { sure, maybe };
}
