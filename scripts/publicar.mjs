// Publica no Instagram e no Facebook os posts liberados cujo horário já chegou.
// Roda a cada 15 minutos pelo GitHub Actions. Cada post publicado gera um arquivo em resultados/.
import fs from "node:fs";
import path from "node:path";
import { graph, tokenPagina, esperar, exigirConfig, lerJson, gravarJson, urlPublica, quando, RAIZ, IG_ID, PAGE_ID } from "./meta.mjs";
import { publicarTikTok } from "./tiktok.mjs";

const MAX_TENTATIVAS = 3;
const JANELA_ATRASO_H = 48; // posts atrasados mais que isso não são publicados sozinhos

async function esperarContainer(id) {
  for (let i = 0; i < 40; i++) {
    const s = await graph("GET", id, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram recusou o arquivo: " + (s.status || s.status_code));
    await esperar(15000);
  }
  throw new Error("Instagram demorou demais para processar o vídeo");
}

// Procura a peça no catálogo da loja do Instagram (pelo código SKU e, se não achar, pelo nome).
const CATALOGO = process.env.CATALOGO_ID || "8886435968042543";
async function produtoDoCatalogo(produto) {
  if (!produto) return { id: null };
  const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const slug = u => { const m = String(u || "").match(/\/produtos\/([^/?#]+)/); return m ? m[1] : ""; };
  const alvoSlug = slug(produto.url), alvoNome = norm(produto.nome);
  try {
    const r = await graph("GET", `${IG_ID}/catalog_product_search`, { catalog_id: CATALOGO, q: produto.nome });
    const lista = (r.data || []).filter(x => !x.review_status || x.review_status === "approved");
    // 1) pelo endereço da peça no site (o mais seguro)
    if (alvoSlug) for (const x of lista.slice(0, 8)) {
      const d = await graph("GET", String(x.product_id), { fields: "url" }).catch(() => ({}));
      if (slug(d.url) === alvoSlug) return { id: x.product_id };
    }
    // 2) pelo nome idêntico
    const igual = lista.find(x => norm(x.product_name) === alvoNome);
    if (igual) return { id: igual.product_id };
    return { id: null, aviso: "Peça não encontrada no catálogo do Instagram; publicado sem marcar o produto." };
  } catch (e) {
    return { id: null, aviso: "Publicado sem marcar o produto (" + e.message + ")." };
  }
}

async function publicarInstagram(post) {
  // "storyArte": versão em pé (9:16) da arte, feita pelo sistema só para os Stories; não entra no post do feed
  const m = (post.midias || []).filter(x => !x.storyArte), artesStory = (post.midias || []).find(x => x.storyArte);
  const legenda = post.legendaFinal || "";
  let criacao, aviso = "";
  if (post.formato === "story") {
    const v = m[0];
    criacao = (await graph("POST", `${IG_ID}/media`, v.tipo === "video"
      ? { media_type: "STORIES", video_url: urlPublica(v.arquivo) }
      : { media_type: "STORIES", image_url: urlPublica(v.arquivo) })).id;
  } else if (post.formato === "reels" || post.formato === "video") {
    const v = m.find(x => x.tipo === "video");
    if (!v) throw new Error("Post de vídeo sem vídeo");
    const capa = m.find(x => x.tipo === "foto");
    criacao = (await graph("POST", `${IG_ID}/media`, { media_type: "REELS", video_url: urlPublica(v.arquivo), caption: legenda, cover_url: capa ? urlPublica(capa.arquivo) : undefined, share_to_feed: true })).id;
  } else if (post.formato === "carrossel" && m.length > 1) {
    const filhos = [];
    for (const f of m.slice(0, 10)) {
      const p = f.tipo === "video" ? { media_type: "VIDEO", video_url: urlPublica(f.arquivo), is_carousel_item: true } : { image_url: urlPublica(f.arquivo), is_carousel_item: true };
      const id = (await graph("POST", `${IG_ID}/media`, p)).id;
      if (f.tipo === "video") await esperarContainer(id);
      filhos.push(id);
    }
    criacao = (await graph("POST", `${IG_ID}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda })).id;
  } else {
    const f = m.find(x => x.tipo === "foto") || m[0];
    const prod = await produtoDoCatalogo(post.produto);
    aviso = prod.aviso || "";
    const base = { image_url: urlPublica(f.arquivo), caption: legenda };
    if (prod.id) {
      try { criacao = (await graph("POST", `${IG_ID}/media`, { ...base, product_tags: JSON.stringify([{ product_id: prod.id, x: 0.5, y: 0.62 }]) })).id; }
      catch (e) { aviso = "Publicado sem marcar o produto (" + e.message + ")."; }
    }
    if (!criacao) criacao = (await graph("POST", `${IG_ID}/media`, base)).id;
  }
  await esperarContainer(criacao);
  const pub = await graph("POST", `${IG_ID}/media_publish`, { creation_id: criacao });
  const info = await graph("GET", pub.id, { fields: "permalink" }).catch(() => ({}));
  // também nos Stories: mesma arte, logo depois do post (se falhar, o post do feed continua valendo)
  if (post.story && post.formato !== "story" && post.formato !== "reels" && post.formato !== "video") {
    try {
      const f = artesStory || m.find(x => x.tipo === "foto") || m[0];
      const st = (await graph("POST", `${IG_ID}/media`, { media_type: "STORIES", image_url: urlPublica(f.arquivo) })).id;
      await esperarContainer(st);
      await graph("POST", `${IG_ID}/media_publish`, { creation_id: st });
    } catch (e) { aviso = (aviso ? aviso + " " : "") + "Não saiu nos Stories (" + e.message + ")."; }
  }
  return { idRede: pub.id, link: info.permalink || "", aviso };
}

async function publicarFacebook(post) {
  const tk = await tokenPagina();
  const fb = (metodo, caminho, params) => graph(metodo, caminho, params, tk);
  const m = (post.midias || []).filter(x => !x.storyArte);
  const legenda = post.legendaFinal || "";
  let id;
  if (post.formato === "reels" || post.formato === "video") {
    const v = m.find(x => x.tipo === "video");
    if (!v) throw new Error("Post de vídeo sem vídeo");
    id = (await fb("POST", `${PAGE_ID}/videos`, { file_url: urlPublica(v.arquivo), description: legenda })).id;
  } else if (post.formato === "carrossel" && m.length > 1) {
    const fotos = [];
    for (const f of m.filter(x => x.tipo === "foto").slice(0, 10)) fotos.push((await fb("POST", `${PAGE_ID}/photos`, { url: urlPublica(f.arquivo), published: false })).id);
    const anexos = {}; fotos.forEach((fid, i) => { anexos[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fid }); });
    id = (await fb("POST", `${PAGE_ID}/feed`, { message: legenda, ...anexos })).id;
  } else {
    const f = m.find(x => x.tipo === "foto") || m[0];
    const r = await fb("POST", `${PAGE_ID}/photos`, { url: urlPublica(f.arquivo), caption: legenda, published: true });
    id = r.post_id || r.id;
  }
  const info = await fb("GET", id, { fields: "permalink_url" }).catch(() => ({}));
  return { idRede: id, link: info.permalink_url || "" };
}

async function artesNoAr(post) {
  for (let i = 0; i < 24; i++) {
    let ok = true;
    for (const m of post.midias || []) {
      const r = await fetch(urlPublica(m.arquivo), { method: "HEAD", cache: "no-store" }).catch(() => null);
      if (!r || !r.ok) { ok = false; break; }
    }
    if (ok) return true;
    await esperar(10000);
  }
  return false;
}

async function main() {
  exigirConfig();
  const agora = new Date();
  const dirFila = path.join(RAIZ, "fila");
  const arquivos = fs.readdirSync(dirFila).filter(a => a.endsWith(".json")).sort();
  let publicados = 0;
  for (const a of arquivos) {
    const post = lerJson(path.join(dirFila, a));
    if (!post || !post.liberado) continue;
    if (!["instagram", "facebook", "tiktok"].includes(post.canal)) continue;
    const arqRes = path.join(RAIZ, "resultados", a);
    const res = lerJson(arqRes, { status: "agendado", tentativas: 0 });
    if (["publicado", "falhou", "cancelado"].includes(res.status)) continue;
    const hora = quando(post);
    if (hora > agora) continue;
    // artes recém-chegadas: espera o endereço público (GitHub Pages) ficar no ar (até 4 min)
    if (!(await artesNoAr(post))) { console.log(`Artes de ${post.id} ainda não estão no ar; fica para a próxima rodada`); continue; }
    if ((agora - hora) / 36e5 > JANELA_ATRASO_H) {
      gravarJson(arqRes, { ...res, status: "falhou", motivo: "Horário passou há mais de 48h sem publicar; reagende no painel.", atualizadoEm: agora.toISOString() });
      continue;
    }
    try {
      console.log(`Publicando ${post.id} no ${post.canal} (${post.formato})`);
      const r = post.canal === "instagram" ? await publicarInstagram(post) : post.canal === "tiktok" ? await publicarTikTok(post) : await publicarFacebook(post);
      gravarJson(arqRes, { status: "publicado", publicadoEm: new Date().toISOString(), idRede: r.idRede, link: r.link, motivo: r.aviso || "", tentativas: (res.tentativas || 0) + 1, metricas: {}, atualizadoEm: new Date().toISOString() });
      publicados++;
    } catch (e) {
      const t = e.semConexao ? MAX_TENTATIVAS : (res.tentativas || 0) + 1; // TikTok sem conexão: não adianta tentar de novo
      console.log(`Falhou ${post.id}: ${e.message}`);
      gravarJson(arqRes, { ...res, status: t >= MAX_TENTATIVAS ? "falhou" : "agendado", tentativas: t, motivo: e.message, atualizadoEm: new Date().toISOString() });
    }
  }
  console.log(`Concluído: ${publicados} publicado(s).`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
