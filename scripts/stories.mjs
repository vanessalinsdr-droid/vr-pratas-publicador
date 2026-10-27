// Stories com adesivo de link, postados pelo celular (a API do Instagram não coloca adesivos).
// O sistema marca o post como "Já postei"; aqui o robô procura esse Story na conta, liga ao post
// e busca as métricas enquanto ele está no ar (o Instagram só entrega números de Story por 24 horas).
// Roda junto com a publicação (a cada 15 minutos). Sem nada pendente, termina em segundos.
import { graph, exigirConfig, IG_ID } from "./meta.mjs";

const PONTE = process.env.MARKETING_URL || "https://fecizzdgsggdsfaothnc.supabase.co/functions/v1/publicador";
const ANTES_H = 12, DEPOIS_MIN = 15; // o Story precisa ter saído até 12h antes (ou 15 min depois) do "Já postei"

async function tokenGitHub() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tk = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tk) throw new Error("Sem permissão de identidade (id-token: write) neste robô");
  const j = await (await fetch(url + "&audience=vr-marketing", { headers: { Authorization: "Bearer " + tk } })).json();
  if (!j.value) throw new Error("GitHub não entregou o token de identidade");
  return j.value;
}
async function chamar(acao, corpo) {
  const u = new URL(PONTE); u.searchParams.set("acao", acao);
  const r = await fetch(u, { method: "POST", headers: { Authorization: "Bearer " + (await tokenGitHub()), "Content-Type": "application/json" }, body: JSON.stringify(corpo || {}) });
  if (!r.ok) throw new Error(`Painel respondeu ${r.status} em ${acao}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Uma métrica por vez: se o Instagram recusar uma, as outras continuam vindo.
const METRICAS = { reach: "alcance", views: "visualizacoes", replies: "respostas", shares: "compartilhamentos", total_interactions: "interacoes" };
async function metricasStory(id) {
  const out = {};
  for (const [nome, chave] of Object.entries(METRICAS)) {
    try {
      const r = await graph("GET", `${id}/insights`, { metric: nome });
      const m = (r.data || [])[0]; const v = m && (m.values ? m.values[0]?.value : m.total_value?.value);
      if (typeof v === "number") out[chave] = v;
    } catch (e) { /* métrica indisponível para este Story */ }
  }
  return out;
}

async function main() {
  exigirConfig();
  const { posts = [] } = await chamar("manuais");
  if (!posts.length) return console.log("Nenhum Story postado pelo celular nas últimas 30 horas.");
  const r = await graph("GET", `${IG_ID}/stories`, { fields: "id,timestamp,permalink,media_type" });
  const stories = (r.data || []).map(s => ({ ...s, t: Date.parse(s.timestamp) })).filter(s => s.t);
  const usados = new Set(posts.map(p => p.igId).filter(Boolean));
  const itens = [];
  // os mais antigos primeiro, para cada "Já postei" pegar o Story certo quando há vários no dia
  for (const p of posts.slice().sort((a, b) => String(a.publicadoEm).localeCompare(String(b.publicadoEm)))) {
    let igId = p.igId, link = "";
    if (!igId) {
      const marca = Date.parse(p.publicadoEm);
      const cand = stories.filter(s => !usados.has(s.id) && s.t <= marca + DEPOIS_MIN * 6e4 && s.t >= marca - ANTES_H * 36e5)
        .sort((a, b) => Math.abs(marca - a.t) - Math.abs(marca - b.t))[0];
      if (!cand) { console.log(`Story de ${p.id}: ainda não encontrado na conta`); continue; }
      igId = cand.id; link = cand.permalink || ""; usados.add(igId);
      console.log(`Story de ${p.id} ligado ao ${igId}`);
    }
    if (!stories.some(s => s.id === igId)) { console.log(`Story de ${p.id} já saiu do ar; mantém as últimas métricas`); continue; }
    const metricas = await metricasStory(igId);
    itens.push({ id: p.id, igId, link, metricas });
  }
  if (!itens.length) return;
  const j = await chamar("manuais_resultado", { itens });
  console.log(`Stories pelo celular: ${j.atualizados || 0} atualizado(s).`);
}

main().catch(e => { console.error("Stories pelo celular: " + e.message); process.exit(0); }); // não derruba a publicação
