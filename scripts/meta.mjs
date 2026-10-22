// Funções comuns para falar com a API oficial da Meta (Instagram e Facebook).
import fs from "node:fs";
import path from "node:path";

export const VERSAO = process.env.GRAPH_VERSION || "v23.0";
export const API = process.env.GRAPH_API || `https://graph.facebook.com/${VERSAO}`;
export const TOKEN = process.env.META_TOKEN || "";
export const IG_ID = process.env.IG_USER_ID || "";
export const PAGE_ID = process.env.FB_PAGE_ID || "";
export const BASE_URL = (process.env.BASE_URL || "").replace(/\/+$/, "");
export const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export function exigirConfig() {
  const faltando = [["META_TOKEN", TOKEN], ["IG_USER_ID", IG_ID], ["FB_PAGE_ID", PAGE_ID], ["BASE_URL", BASE_URL]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (faltando.length) throw new Error("Configuração faltando no GitHub: " + faltando.join(", "));
}

// Chave da Página: se a chave guardada for de usuário (ou usuário do sistema), troca pela chave da Página.
let chavePagina = null;
export async function tokenPagina() {
  if (chavePagina) return chavePagina;
  const r = await graph("GET", PAGE_ID, { fields: "access_token" }).catch(() => ({}));
  return (chavePagina = r.access_token || TOKEN);
}

export async function graph(metodo, caminho, params = {}, token = TOKEN) {
  const url = new URL(API + "/" + caminho.replace(/^\//, ""));
  const corpo = new URLSearchParams();
  const alvo = metodo === "GET" ? url.searchParams : corpo;
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) alvo.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  alvo.set("access_token", token);
  const r = await fetch(url, metodo === "GET" ? {} : { method: metodo, body: corpo });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const msg = (e.error_user_msg || e.message || ("HTTP " + r.status)).replace(TOKEN, "***").replace(token, "***");
    const err = new Error(msg); err.codigo = e.code; err.sub = e.error_subcode; throw err;
  }
  return j;
}

export const esperar = ms => new Promise(ok => setTimeout(ok, ms));

export function lerJson(arq, padrao = null) {
  try { return JSON.parse(fs.readFileSync(arq, "utf8")); } catch { return padrao; }
}
export function gravarJson(arq, dados) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, JSON.stringify(dados, null, 2) + "\n");
}
export function urlPublica(rel) { return BASE_URL + "/" + rel.split("/").map(encodeURIComponent).join("/"); }

// Data e hora do painel são no horário de Brasília (UTC-3, sem horário de verão).
export function quando(post) { return new Date(`${post.data}T${post.hora || "12:00"}:00-03:00`); }
