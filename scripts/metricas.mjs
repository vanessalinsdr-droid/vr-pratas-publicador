// Busca as métricas dos posts publicados nos últimos 30 dias e grava em resultados/.
import fs from "node:fs";
import path from "node:path";
import { graph, exigirConfig, lerJson, gravarJson, RAIZ } from "./meta.mjs";

const DIAS = 30;

async function tentar(fn) { try { return await fn(); } catch (e) { console.log("  aviso: " + e.message); return null; } }

async function metricasInstagram(id, formato) {
  const out = {};
  const base = await tentar(() => graph("GET", id, { fields: "like_count,comments_count" }));
  if (base) { out.curtidas = base.like_count ?? null; out.comentarios = base.comments_count ?? null; }
  const lista = (formato === "reels" || formato === "video") ? "reach,likes,comments,shares,saved,views" : "reach,likes,comments,shares,saved";
  const ins = await tentar(() => graph("GET", `${id}/insights`, { metric: lista }));
  for (const m of (ins && ins.data) || []) {
    const v = m.values ? m.values[0]?.value : m.total_value?.value;
    if (m.name === "reach") out.alcance = v;
    if (m.name === "likes") out.curtidas = v;
    if (m.name === "comments") out.comentarios = v;
    if (m.name === "shares") out.compartilhamentos = v;
    if (m.name === "saved") out.salvos = v;
    if (m.name === "views") out.visualizacoes = v;
  }
  return out;
}

async function metricasFacebook(id) {
  const out = {};
  const base = await tentar(() => graph("GET", id, { fields: "reactions.summary(total_count),comments.summary(total_count),shares" }));
  if (base) {
    out.curtidas = base.reactions?.summary?.total_count ?? null;
    out.comentarios = base.comments?.summary?.total_count ?? null;
    out.compartilhamentos = base.shares?.count ?? 0;
  }
  for (const metrica of ["post_impressions_unique", "post_total_media_view_unique"]) {
    const ins = await tentar(() => graph("GET", `${id}/insights`, { metric: metrica }));
    const v = ins?.data?.[0]?.values?.[0]?.value;
    if (typeof v === "number") { out.alcance = v; break; }
  }
  return out;
}

async function main() {
  exigirConfig();
  const dir = path.join(RAIZ, "resultados");
  const limite = Date.now() - DIAS * 864e5;
  let n = 0;
  for (const a of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const res = lerJson(path.join(dir, a));
    if (!res || res.status !== "publicado" || !res.idRede) continue;
    if (Date.parse(res.publicadoEm) < limite) continue;
    const post = lerJson(path.join(RAIZ, "fila", a), {});
    console.log(`Métricas de ${a}`);
    const m = post.canal === "facebook" ? await metricasFacebook(res.idRede) : await metricasInstagram(res.idRede, post.formato);
    const limpo = Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "number"));
    if (Object.keys(limpo).length) {
      gravarJson(path.join(dir, a), { ...res, metricas: { ...(res.metricas || {}), ...limpo }, metricasEm: new Date().toISOString() });
      n++;
    }
  }
  console.log(`Métricas atualizadas em ${n} post(s).`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
