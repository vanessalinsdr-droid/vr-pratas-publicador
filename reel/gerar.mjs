// Robô de Reels VR Pratas
// Escolhe as peças, gera o vídeo (Remotion) com trilha própria (Tone.js), envia para o Storage
// e cria o post como RASCUNHO na Central de Conteúdo (Marketing › Posts). Nada vai ao ar sem aprovação.
//
// Quando roda:
//   - manual (GitHub › Actions › "Gerar Reel" › Run workflow): pode informar SKUs, quantidade e título;
//   - pedido feito no sistema (mk_config "reel_pedido" ainda não feito);
//   - semanal: uma vez por semana, se estiver ligado (mk_config "reels": { semanal, diaSemanal, horaSemanal, quantidade }).
//
// Uso local de teste (sem enviar nada): node gerar.mjs --teste dados-teste.json
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {gerarTrilha} from './audio/trilha.mjs';
import {PONTE, ponte, semanaISO, proximoHorario, decidir} from './base.mjs';
import {brl, nomeCurto, material, precoTexto, legendas, hashtags} from './textos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const TESTE = process.argv.includes('--teste');
const FPS = 30;
const INTRO = 60, CENA = 105, OUTRO = 96, TRANS = 15; // iguais aos de src/Reel.tsx
const FOTOS = path.join(AQUI, 'public', 'fotos');
// ---------- escolha das peças ----------
function escolher(dados, pedidos, qtd) {
  const todos = dados.produtos || [];
  if (pedidos.length) {
    const achados = pedidos.map((x) => todos.find((p) => p.id === x || String(p.sku) === x || 'b' + p.sid === x)).filter(Boolean);
    const faltam = pedidos.filter((x) => !todos.some((p) => p.id === x || String(p.sku) === x || 'b' + p.sid === x));
    if (faltam.length) console.log('Peças não encontradas (sem estoque, sem preço no site ou sem foto): ' + faltam.join(', '));
    if (achados.length) return achados.slice(0, 6);
  }
  const usados = new Set(dados.usados || []);
  const nota = (p) => (p.fila ? 1000 : 0) + (p.lancamento ? 500 : 0) + (p.promocao ? 200 : 0) + p.sid / 1e6;
  const frescos = todos.filter((p) => !usados.has(p.id)).sort((a, b) => nota(b) - nota(a));
  const resto = todos.filter((p) => usados.has(p.id)).sort((a, b) => nota(b) - nota(a));
  // não repetir o mesmo modelo (nomes quase iguais em contas diferentes do Bling)
  const vistos = new Set(), out = [];
  for (const p of frescos.concat(resto)) {
    const k = nomeCurto(p).toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k); out.push(p);
    if (out.length >= qtd) break;
  }
  return out;
}

// ---------- vídeo ----------
async function baixarFoto(url, i) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`foto indisponível (${r.status}): ${url}`);
  const tipo = r.headers.get('content-type') || '';
  const ext = /png/.test(tipo) ? 'png' : /webp/.test(tipo) ? 'webp' : 'jpg';
  const nome = `${i + 1}.${ext}`;
  fs.writeFileSync(path.join(FOTOS, nome), Buffer.from(await r.arrayBuffer()));
  return 'fotos/' + nome;
}

async function gerarVideo(props) {
  const browserExecutable = process.env.CHROME_PATH || null;
  const serveUrl = await bundle({entryPoint: path.join(AQUI, 'src', 'Root.tsx'), publicDir: path.join(AQUI, 'public')});
  const composition = await selectComposition({serveUrl, id: 'Reel', inputProps: props, browserExecutable});
  const n = props.produtos.length;
  const semSom = path.join(SAIDA, 'sem-som.mp4');
  await renderMedia({composition, serveUrl, codec: 'h264', outputLocation: semSom, inputProps: props, browserExecutable,
    crf: 18, x264Preset: 'veryfast', pixelFormat: 'yuv420p', muted: true});
  // capa: a primeira peça já parada na tela
  const capa = path.join(SAIDA, 'capa.jpg');
  await renderStill({composition, serveUrl, frame: INTRO - TRANS + 45, output: capa, imageFormat: 'jpeg', jpegQuality: 92, inputProps: props, browserExecutable});

  const cortes = Array.from({length: n}, (_, i) => (INTRO - TRANS + i * (CENA - TRANS)) / FPS);
  const final = (INTRO - TRANS + n * (CENA - TRANS)) / FPS;
  const wav = path.join(SAIDA, 'trilha.wav');
  await gerarTrilha(wav, {duracao: composition.durationInFrames / FPS, cortes, final});

  const tmp = path.join(SAIDA, 'reel.tmp.mp4'), video = path.join(SAIDA, 'reel.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', semSom, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-af', 'loudnorm=I=-14:TP=-1:LRA=7', '-ar', '44100', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, video);
  return {video, capa};
}

async function enviar(arquivo, ext, tipo) {
  const {caminho, url} = await ponte('reel-upload', {ext});
  const r = await fetch(url, {method: 'PUT', headers: {'Content-Type': tipo, 'x-upsert': 'false'}, body: fs.readFileSync(arquivo)});
  if (!r.ok) throw new Error(`Storage recusou o arquivo (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return caminho;
}

// ---------- principal ----------
async function main() {
  fs.mkdirSync(SAIDA, {recursive: true});
  fs.rmSync(FOTOS, {recursive: true, force: true});
  fs.mkdirSync(FOTOS, {recursive: true});

  const dados = TESTE ? JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--teste') + 1] || 'dados-teste.json', 'utf8')) : await ponte('reel-dados');
  const cfgReels = dados.reels || {};
  const modo = process.env.MODO || (TESTE ? 'manual' : 'auto');
  const d = decidir(dados, modo, process.env);
  if (!d) { console.log('Nada a fazer agora (sem pedido no sistema e o Reel da semana já foi feito ou está desligado).'); return; }
  const {origem, pedidos, txt} = d;
  let qtd = d.qtd;
  qtd = Math.min(6, Math.max(1, qtd));
  console.log(`Gerando Reel (${origem}).`);

  try {
    const pecas = escolher(dados, pedidos, qtd);
    if (!pecas.length) throw new Error('Nenhuma peça com estoque, preço no site e foto para o Reel.');
    const cfg = {
      titulo: (txt.titulo || cfgReels.titulo || 'Novidades').trim().slice(0, 28),
      subtitulo: (txt.subtitulo || cfgReels.subtitulo || 'da semana').trim().slice(0, 32),
    };
    const produtos = [];
    for (let i = 0; i < pecas.length; i++) {
      const p = pecas[i];
      const promo = p.promo != null && p.promo < p.preco;
      produtos.push({nome: nomeCurto(p), detalhe: material(p.nome, p.descricao), preco: brl(promo ? p.promo : p.preco), precoDe: promo ? brl(p.preco) : undefined,
        imagem: TESTE && p.fotoLocal ? p.fotoLocal : await baixarFoto(p.fotos[0], i)});
      console.log(`  ${i + 1}. ${produtos[i].nome} · ${precoTexto(p)}`);
    }
    const props = {
      marca: cfgReels.marca || 'V Pratas & Folheados', titulo: cfg.titulo, subtitulo: cfg.subtitulo, produtos,
      beneficios: ['Certificado de garantia', 'Nota fiscal', 'Embalagem para presente'], chamada: cfgReels.chamada || 'Compre pelo link da bio',
    };
    const {video, capa} = await gerarVideo(props);
    console.log('Vídeo pronto: ' + (fs.statSync(video).size / 1e6).toFixed(1) + ' MB');

    const quando = proximoHorario(dados);
    const L = legendas(pecas, cfg);
    if (TESTE) {
      fs.writeFileSync(path.join(SAIDA, 'post.json'), JSON.stringify({quando, legendas: L, hashtags: hashtags(pecas), produtos: pecas.map((p) => p.id)}, null, 2));
      console.log('Teste: nada foi enviado. Veja a pasta saida/. Horário sugerido: ' + quando.data + ' ' + quando.hora);
      return;
    }
    const caminhoVideo = await enviar(video, 'mp4', 'video/mp4');
    const caminhoCapa = await enviar(capa, 'jpg', 'image/jpeg');
    const r = await ponte('reel-criar', {
      titulo: `Reel · ${cfg.titulo} ${cfg.subtitulo} (${pecas.length} peças)`.replace(/\s+/g, ' '),
      legendas: L, hashtags: hashtags(pecas), data: quando.data, hora: quando.hora, produtos: pecas.map((p) => p.id),
      midias: [{caminho: caminhoVideo, tipo: 'video'}, {caminho: caminhoCapa, tipo: 'foto', capa: true}],
      canais: ['instagram'], pedidoId: origem === 'pedido' ? dados.pedido.id : undefined,
      semanal: origem === 'semanal', semana: semanaISO(dados.agora.data),
    });
    console.log(`Rascunho criado na Central (Marketing › Posts): ${r.ids.join(', ')} · sugerido para ${quando.data} às ${quando.hora}.`);
  } catch (e) {
    if (origem === 'pedido' && !TESTE) await ponte('reel-falhou', {pedidoId: dados.pedido.id, motivo: e.message}).catch(() => {});
    throw e;
  }
}

main().catch((e) => { console.error('Robô de Reels: ' + e.message); process.exit(1); });
