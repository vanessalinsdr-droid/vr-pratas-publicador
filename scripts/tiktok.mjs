// Publicação e métricas no TikTok pela API oficial (Content Posting API e Display API).
// A chave de acesso vem da ponte com o painel, que a renova sozinha.
import fs from "node:fs";
import path from "node:path";
import { esperar, urlPublica, RAIZ } from "./meta.mjs";

const API = "https://open.tiktokapis.com/v2/";
const PONTE = process.env.MARKETING_URL || "https://fecizzdgsggdsfaothnc.supabase.co/functions/v1/publicador";
let chave = null;

async function tokenGitHub() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tk = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tk) throw new Error("Robô sem permissão de identidade (id-token: write)");
  const j = await (await fetch(url + "&audience=vr-marketing", { headers: { Authorization: "Bearer " + tk } })).json();
  return j.value;
}

export async function tokenTikTok() {
  if (chave) return chave;
  const r = await fetch(PONTE + "?acao=tiktok-token", { headers: { Authorization: "Bearer " + (await tokenGitHub()) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { const e = new Error(j.erro || "TikTok indisponível"); e.semConexao = true; throw e; }
  return (chave = j.access_token);
}

async function chamar(caminho, corpo, metodo = "POST") {
  const tk = await tokenTikTok();
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json; charset=UTF-8" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (j.error && j.error.code && j.error.code !== "ok") { const e = new Error(`TikTok: ${j.error.message || j.error.code}`); e.codigoTikTok = j.error.code; throw e; }
  if (!r.ok) throw new Error(`TikTok respondeu ${r.status}`);
  return j.data || {};
}

// Aplicativo ainda não aprovado pelo TikTok só publica direto em conta privada.
// Nesse caso o post vai como rascunho para a caixa de entrada do app do TikTok da loja.
const SO_PRIVADA = ["unaudited_client_can_only_post_to_private_accounts", "privacy_level_option_mismatch"];

export async function publicarTikTok(post) {
  try {
    return await publicarDireto(post);
  } catch (e) {
    if (!SO_PRIVADA.includes(e.codigoTikTok) && !/integration guidelines/i.test(e.message)) throw e;
    console.log("  TikTok ainda não aprovou o aplicativo: enviando como rascunho para o app");
    return await enviarRascunho(post);
  }
}

async function enviarRascunho(post) {
  const legenda = post.legendaFinal || "";
  const ehVideo = post.formato === "reels" || post.formato === "video";
  let publishId;
  if (ehVideo) {
    const v = post.midias.find(m => m.tipo === "video");
    const dados = fs.readFileSync(path.join(RAIZ, v.arquivo));
    const ini = await chamar("post/publish/inbox/video/init/", { source_info: { source: "FILE_UPLOAD", video_size: dados.length, chunk_size: dados.length, total_chunk_count: 1 } });
    const up = await fetch(ini.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes 0-${dados.length - 1}/${dados.length}`, "Content-Length": String(dados.length) }, body: dados });
    if (!up.ok) throw new Error(`TikTok recusou o envio do vídeo (${up.status})`);
    publishId = ini.publish_id;
  } else {
    const fotos = post.midias.filter(m => m.tipo === "foto").slice(0, 35);
    const titulo = (legenda.split("\n").find(l => l.trim()) || "VR Pratas").slice(0, 90);
    const ini = await chamar("post/publish/content/init/", {
      post_info: { title: titulo, description: legenda.slice(0, 4000) },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: fotos.map(f => urlPublica(f.arquivo)) },
      post_mode: "MEDIA_UPLOAD", media_type: "PHOTO",
    });
    publishId = ini.publish_id;
  }
  for (let i = 0; i < 32; i++) {
    await esperar(15000);
    const s = await chamar("post/publish/status/fetch/", { publish_id: publishId });
    if (s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE")
      return { idRede: publishId, link: "", aviso: "Enviado como rascunho para o app do TikTok da loja (o TikTok ainda não aprovou a publicação direta). Abra o TikTok no celular, veja as notificações da caixa de entrada e toque em publicar." };
    if (s.status === "FAILED") throw new Error("TikTok não recebeu o rascunho: " + (s.fail_reason || "motivo não informado"));
  }
  throw new Error("O TikTok demorou demais para receber o rascunho; confira as notificações do app antes de tentar de novo");
}

async function publicarDireto(post) {
  const info = await chamar("post/publish/creator_info/query/", {});
  const ops = info.privacy_level_options || [];
  const privacidade = ops.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : ops[0];
  if (!privacidade) throw new Error("O TikTok não liberou nenhuma opção de privacidade para esta conta");
  const legenda = post.legendaFinal || "";
  const base = { privacy_level: privacidade, disable_comment: !!info.comment_disabled, disable_duet: !!info.duet_disabled, disable_stitch: !!info.stitch_disabled };
  const ehVideo = post.formato === "reels" || post.formato === "video";
  let publishId, tipo;

  if (ehVideo) {
    const v = post.midias.find(m => m.tipo === "video");
    if (!v) throw new Error("Post de vídeo sem vídeo");
    const dados = fs.readFileSync(path.join(RAIZ, v.arquivo));
    const dur = info.max_video_post_duration_sec;
    const ini = await chamar("post/publish/video/init/", {
      post_info: { ...base, title: legenda.slice(0, 2200) },
      source_info: { source: "FILE_UPLOAD", video_size: dados.length, chunk_size: dados.length, total_chunk_count: 1 },
    });
    const up = await fetch(ini.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes 0-${dados.length - 1}/${dados.length}`, "Content-Length": String(dados.length) }, body: dados });
    if (!up.ok) throw new Error(`TikTok recusou o envio do vídeo (${up.status})${dur ? "; limite de " + dur + "s" : ""}`);
    publishId = ini.publish_id; tipo = "video";
  } else {
    const fotos = post.midias.filter(m => m.tipo === "foto").slice(0, 35);
    if (!fotos.length) throw new Error("Post sem foto");
    const titulo = (legenda.split("\n").find(l => l.trim()) || "VR Pratas").slice(0, 90);
    const ini = await chamar("post/publish/content/init/", {
      post_info: { ...base, title: titulo, description: legenda.slice(0, 4000), auto_add_music: true },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: fotos.map(f => urlPublica(f.arquivo)) },
      post_mode: "DIRECT_POST", media_type: "PHOTO",
    });
    publishId = ini.publish_id; tipo = "photo";
  }

  // acompanha até o TikTok terminar de processar (até ~8 minutos)
  for (let i = 0; i < 32; i++) {
    await esperar(15000);
    const s = await chamar("post/publish/status/fetch/", { publish_id: publishId });
    if (s.status === "PUBLISH_COMPLETE") {
      const id = (s.publicaly_available_post_id || [])[0];
      const usuario = info.creator_username || "";
      const link = id && usuario ? `https://www.tiktok.com/@${usuario}/${tipo}/${id}` : "";
      const aviso = privacidade !== "PUBLIC_TO_EVERYONE" ? "Publicado só para a própria conta: o TikTok ainda não aprovou o aplicativo da loja." : "";
      return { idRede: id ? String(id) : publishId, link, aviso };
    }
    if (s.status === "FAILED") throw new Error("TikTok não publicou: " + (s.fail_reason || "motivo não informado"));
  }
  throw new Error("O TikTok demorou demais para processar; confira no perfil antes de tentar de novo");
}

export async function metricasTikTok(ids) {
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const d = await chamar("video/query/?fields=id,view_count,like_count,comment_count,share_count", { filters: { video_ids: ids.slice(i, i + 20) } });
    for (const v of d.videos || []) out[v.id] = { visualizacoes: v.view_count, curtidas: v.like_count, comentarios: v.comment_count, compartilhamentos: v.share_count, alcance: v.view_count };
  }
  return out;
}
