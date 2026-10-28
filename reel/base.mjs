// Ponte com a Central de Conteúdo, datas e regras de quando o robô de Reels age (sem dependências).
export const PONTE = process.env.MARKETING_URL || 'https://fecizzdgsggdsfaothnc.supabase.co/functions/v1/publicador';

// ---------- ponte com a Central (identidade provada pelo token OIDC do GitHub) ----------
let tokenCache = '';
async function tokenGitHub() {
  if (tokenCache) return tokenCache;
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tk = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tk) throw new Error('Sem permissão de identidade (id-token: write) neste robô');
  const j = await (await fetch(url + '&audience=vr-marketing', {headers: {Authorization: 'Bearer ' + tk}})).json();
  if (!j.value) throw new Error('GitHub não entregou o token de identidade');
  return (tokenCache = j.value);
}
export async function ponte(acao, corpo) {
  const u = new URL(PONTE);
  u.searchParams.set('acao', acao);
  const r = await fetch(u, {
    method: corpo ? 'POST' : 'GET',
    headers: {Authorization: 'Bearer ' + (await tokenGitHub()), ...(corpo ? {'Content-Type': 'application/json'} : {})},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Central respondeu ${r.status} em ${acao}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

// ---------- datas (horário de Brasília, UTC-3) ----------
export const diaISO = (data) => { const d = new Date(data + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; }; // 1=seg ... 7=dom
export const somaDias = (data, n) => new Date(Date.parse(data + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const minutos = (data, hora) => Date.parse(`${data}T${hora}:00-03:00`) / 6e4;
export function semanaISO(data) {
  const d = new Date(data + 'T12:00:00Z');
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const ano = d.getUTCFullYear();
  const sem = Math.ceil(((d - Date.UTC(ano, 0, 1)) / 864e5 + 1) / 7);
  return `${ano}-S${String(sem).padStart(2, '0')}`;
}

// Próximo horário de Reels do calendário da Central, com pelo menos 3 horas para aprovar, sem bater com outro post.
export function proximoHorario(dados) {
  const hs = ((dados.calendario || {}).horarios || []).filter((h) => h.canal === 'instagram' && h.formato === 'reels');
  const slots = hs.length ? hs : [{dia: 3, hora: '20:00'}, {dia: 7, hora: '20:00'}];
  const agora = minutos(dados.agora.data, dados.agora.hora);
  const ocupado = new Set((dados.ocupados || []).filter((o) => o.canal === 'instagram').map((o) => o.data + ' ' + o.hora));
  for (let k = 0; k < 28; k++) {
    const data = somaDias(dados.agora.data, k);
    for (const s of slots.filter((s) => Number(s.dia) === diaISO(data)).sort((a, b) => a.hora.localeCompare(b.hora))) {
      if (minutos(data, s.hora) < agora + 180) continue;
      if (ocupado.has(data + ' ' + s.hora)) continue;
      return {data, hora: s.hora};
    }
  }
  return {data: somaDias(dados.agora.data, 1), hora: '20:00'};
}


// O que fazer agora: manual (Run workflow), pedido feito no sistema, Reel da semana, ou nada.
export function decidir(dados, modo, env = {}) {
  const cfg = dados.reels || {};
  const lista = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  let qtd = Number(cfg.quantidade) || 3;
  if (modo === 'manual')
    return {origem: 'manual', pedidos: lista(env.PRODUTOS), qtd: Number(env.QUANTIDADE) || qtd, txt: {titulo: env.TITULO, subtitulo: env.SUBTITULO}};
  if (dados.pedido && dados.pedido.id && !dados.pedido.feito)
    return {origem: 'pedido', pedidos: (dados.pedido.produtos || []).map(String), qtd: Number(dados.pedido.quantidade) || qtd, txt: {titulo: dados.pedido.titulo, subtitulo: dados.pedido.subtitulo}};
  const ligado = cfg.semanal !== false;
  const dia = Number(cfg.diaSemanal) || 1, horaMin = cfg.horaSemanal || '08:00';
  if (ligado && diaISO(dados.agora.data) >= dia && dados.agora.hora >= horaMin && (dados.estado || {}).ultimaSemanal !== semanaISO(dados.agora.data))
    return {origem: 'semanal', pedidos: [], qtd, txt: {}};
  return null;
}
