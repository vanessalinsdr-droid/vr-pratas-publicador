// Publica no Instagram e no Facebook os posts liberados cujo horário já chegou.
// Roda a cada 15 minutos pelo GitHub Actions. Cada post publicado gera um arquivo em resultados/.
import fs from "node:fs";
import path from "node:path";
import { graph, esperar, exigirConfig, lerJson, gravarJson, urlPublica, quando, RAIZ, IG_ID, PAGE_ID } from "./meta.mjs";
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

async function publicarInstagram(post) {
  const m = post.midias;
  const legenda = post.legendaFinal || "";
  let criacao;
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
    criacao = (await graph("POST", `${IG_ID}/media`, { image_url: urlPublica(f.arquivo), caption: legenda })).id;
  }
  await esperarContainer(criacao);
  const pub = await graph("POST", `${IG_ID}/media_publish`, { creation_id: criacao });
  const info = await graph("GET", pub.id, { fields: "permalink" }).catch(() => ({}));
  return { idRede: pub.id, link: info.permalink || "" };
}

async function publicarFacebook(post) {
  const m = post.midias;
  const legenda = post.legendaFinal || "";
  let id;
  if (post.formato === "reels" || post.formato === "video") {
    const v = m.find(x => x.tipo === "video");
    if (!v) throw new Error("Post de vídeo sem vídeo");
    id = (await graph("POST", `${PAGE_ID}/videos`, { file_url: urlPublica(v.arquivo), description: legenda })).id;
  } else if (post.formato === "carrossel" && m.length > 1) {
    const fotos = [];
    for (const f of m.filter(x => x.tipo === "foto").slice(0, 10)) fotos.push((await graph("POST", `${PAGE_ID}/photos`, { url: urlPublica(f.arquivo), published: false })).id);
    const anexos = {}; fotos.forEach((fid, i) => { anexos[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fid }); });
    id = (await graph("POST", `${PAGE_ID}/feed`, { message: legenda, ...anexos })).id;
  } else {
    const f = m.find(x => x.tipo === "foto") || m[0];
    const r = await graph("POST", `${PAGE_ID}/photos`, { url: urlPublica(f.arquivo), caption: legenda, published: true });
    id = r.post_id || r.id;
  }
  const info = await graph("GET", id, { fields: "permalink_url" }).catch(() => ({}));
  return { idRede: id, link: info.permalink_url || "" };
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
    // artes recém-chegadas: espera o endereço público (GitHub Pages) ficar no ar
    if (post.recebidoEm && agora - Date.parse(post.recebidoEm) < 10 * 60e3) { console.log(`Aguardando as artes de ${post.id} ficarem públicas`); continue; }
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
