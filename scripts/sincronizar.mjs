// Ponte com a Central de Conteúdo VR Pratas.
//   baixar     — traz os posts liberados no painel (texto e artes) para fila/ e midia/
//   confirmar  — avisa o painel que os posts já estão guardados aqui (depois do push)
//   enviar     — devolve ao painel o que aconteceu com cada post (publicado, falhou, métricas)
// A identidade do robô é provada com o token OIDC do próprio GitHub Actions: não há senha guardada.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { lerJson, gravarJson, RAIZ } from "./meta.mjs";

const PONTE = process.env.MARKETING_URL || "https://fecizzdgsggdsfaothnc.supabase.co/functions/v1/publicador";
const PENDENTE = path.join(RAIZ, ".ponte-recebidos.json"); // não vai para o repositório
const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

let tokenCache = "";
async function tokenGitHub() {
  if (tokenCache) return tokenCache;
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tk = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tk) throw new Error("Sem permissão de identidade (id-token: write) neste robô");
  const r = await fetch(url + "&audience=vr-marketing", { headers: { Authorization: "Bearer " + tk } });
  const j = await r.json();
  if (!j.value) throw new Error("GitHub não entregou o token de identidade");
  return (tokenCache = j.value);
}

async function chamar(acao, params = {}, corpo) {
  const u = new URL(PONTE);
  u.searchParams.set("acao", acao);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, {
    method: corpo ? "POST" : "GET",
    headers: { Authorization: "Bearer " + (await tokenGitHub()), ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`Painel respondeu ${r.status} em ${acao}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

function apagar(rel) {
  const alvo = path.join(RAIZ, rel);
  if (!alvo.startsWith(RAIZ + path.sep)) return;
  fs.rmSync(alvo, { recursive: true, force: true });
}

async function baixar() {
  const { posts = [] } = await (await chamar("pendentes")).json();
  const recebidos = [], removidos = [];
  for (const p of posts) {
    if (!ID_OK.test(p.id)) { console.log("Ignorado: identificador inválido"); continue; }
    const arqFila = `fila/${p.id}.json`, arqRes = path.join(RAIZ, "resultados", `${p.id}.json`);
    if (p.status === "cancelado") {
      const res = lerJson(arqRes, {});
      if (res.status !== "publicado") {
        apagar(arqFila); apagar(`midia/${p.id}`);
        gravarJson(arqRes, { ...res, status: "cancelado", motivo: "Cancelado no painel", atualizadoEm: new Date().toISOString() });
      }
      removidos.push({ id: p.id });
      console.log(`Cancelado no painel: ${p.id}`);
      continue;
    }
    try {
      const midias = [];
      for (const m of p.midias || []) {
        if (!new RegExp(`^midia/${p.id}/[A-Za-z0-9_.-]{1,60}$`).test(m.arquivo || "")) throw new Error("nome de arquivo inválido");
        const r = await chamar("arquivo", { id: p.id, arquivo: m.arquivo });
        const dados = Buffer.from(await r.arrayBuffer());
        fs.mkdirSync(path.join(RAIZ, "midia", p.id), { recursive: true });
        fs.writeFileSync(path.join(RAIZ, m.arquivo), dados);
        let arquivo = m.arquivo;
        // o TikTok só aceita foto em JPG/WEBP: converte as artes PNG do painel
        if (p.canal === "tiktok" && m.tipo !== "video" && /\.png$/i.test(arquivo)) {
          const jpg = arquivo.replace(/\.png$/i, ".jpg");
          execFileSync("ffmpeg", ["-y", "-v", "error", "-i", path.join(RAIZ, arquivo), "-q:v", "2", path.join(RAIZ, jpg)]);
          fs.rmSync(path.join(RAIZ, arquivo), { force: true });
          arquivo = jpg;
        }
        midias.push({ arquivo, tipo: m.tipo === "video" ? "video" : "foto" });
      }
      if (!midias.length) throw new Error("post sem arte");
      gravarJson(path.join(RAIZ, arqFila), {
        id: p.id, canal: p.canal, formato: p.formato, data: p.data, hora: p.hora,
        legendaFinal: p.legendaFinal || "", midias, liberado: true, recebidoEm: new Date().toISOString(),
      });
      // liberado de novo depois de uma falha ou cancelamento: volta para a fila do zero
      const res = lerJson(arqRes, null);
      if (!res || res.status !== "publicado") gravarJson(arqRes, { status: "agendado", tentativas: 0, atualizadoEm: new Date().toISOString() });
      recebidos.push({ id: p.id, versao: p.versao });
      console.log(`Recebido do painel: ${p.id} (${p.canal}, ${p.data} ${p.hora})`);
    } catch (e) {
      console.log(`Não consegui trazer ${p.id}: ${e.message}`);
    }
  }
  fs.writeFileSync(PENDENTE, JSON.stringify({ itens: recebidos, removidos }));
  console.log(`${recebidos.length} post(s) recebido(s), ${removidos.length} cancelado(s).`);
}

async function confirmar() {
  const p = lerJson(PENDENTE, null);
  if (!p || (!p.itens.length && !p.removidos.length)) return console.log("Nada para confirmar.");
  await chamar("recebidos", {}, p);
  fs.rmSync(PENDENTE, { force: true });
  console.log("Painel avisado.");
}

async function enviar() {
  const dir = path.join(RAIZ, "resultados");
  const limite = Date.now() - 40 * 864e5;
  const itens = [];
  for (const a of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const id = a.replace(/\.json$/, "");
    if (!ID_OK.test(id)) continue;
    const r = lerJson(path.join(dir, a));
    if (!r || !["publicado", "falhou", "agendado"].includes(r.status)) continue;
    if (Date.parse(r.atualizadoEm || r.publicadoEm || 0) < limite) continue;
    itens.push({ id, status: r.status, link: r.link || "", idRede: r.idRede || "", motivo: r.motivo || "", metricas: r.metricas || {}, publicadoEm: r.publicadoEm || null });
  }
  if (!itens.length) return console.log("Nada para devolver ao painel.");
  const j = await (await chamar("resultados", {}, { itens })).json();
  console.log(`Painel atualizado: ${j.atualizados || 0} mudança(s).`);
}

const acao = process.argv[2];
const fn = { baixar, confirmar, enviar }[acao];
if (!fn) { console.error("Use: baixar | confirmar | enviar"); process.exit(1); }
fn().catch(e => { console.error(e.message); process.exit(1); });
