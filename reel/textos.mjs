// Textos do Reel: nome curto da peça, material, preço (sempre o do site) e legendas.
export const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'a', 'o', 'para', 'por', 'na', 'no']);
export function titulo(s) {
  return s.toLowerCase().split(' ').map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase()))).join(' ')
    .replace(/\b(\d+)k\b/gi, '$1K').replace(/\b(\d+(?:[.,]\d+)?)\s*mm\b/gi, '$1mm').replace(/\b(\d+)\s*cm\b/gi, '$1cm');
}
export function nomeCurto(p) {
  if (p.nomeArte) return p.nomeArte;
  let n = String(p.nome || '').replace(/\s+/g, ' ').trim();
  n = n.replace(/\bRef\..*$/i, '').replace(/\b(jóias?|joias?) de alta qualidade\b.*$/i, '').replace(/\bcom garantia\b.*$/i, '')
    .replace(/\bamazon\b/ig, '').replace(/\bfecho\b.*$/i, '').replace(/\boriginal\b.*$/i, '');
  n = n.replace(/\s[PMG]?\s*[-–]\s*\d+\s*$/, '').replace(/\s[PMG]\s+\d+\s*$/, '').replace(/[.]\s*$/, '');
  n = n.replace(/\s[–—-]\s/g, ' ');
  n = n.replace(/\s*\b(?:de|em|na|no)?\s*(?:banhad[oa]s? (?:a |em )?ouro 18\s*k|prata 925 (?:leg[ií]tima?|legitma|de lei|italiana)?|ouro 18\s*k)\b/ig, ' ');
  n = n.replace(/\b(feminin[oa]|masculin[oa]|delicad[oa]|elegante|antial[eé]rgico|polido)\b/ig, '').replace(/\s{2,}/g, ' ').replace(/[\s,.;:–-]+$/, '').replace(/^[\s,.;:–-]+/, '').trim();
  if (n === n.toUpperCase() || n === n.toLowerCase()) n = titulo(n);
  n = n.replace(/\bzirconia\b/gi, (w) => (w[0] === 'Z' ? 'Zircônia' : 'zircônia')).replace(/\s(\d+)\s*MM\b/g, ' $1mm');
  if (n.length > 46) { n = n.slice(0, 46); n = n.slice(0, n.lastIndexOf(' ')).replace(/\s+(de|da|do|com|e|em|para)$/i, ''); }
  return n || String(p.nome).slice(0, 46);
}
export function material(nome, descricao = '') {
  const m = (n) => {
    if (/banhad[oa]|folhead/i.test(n)) return 'Banhado a ouro 18K';
    if (/ouro\s*18\s*k/i.test(n) && /maci[çc]/i.test(n)) return 'Ouro 18K maciço';
    if (/ouro\s*18\s*k/i.test(n)) return 'Ouro 18K';
    if (/prata\s*925/i.test(n)) return 'Prata 925 legítima';
    if (/\ba[çc]o inox/i.test(n)) return 'Aço inoxidável';
    return '';
  };
  return m(String(nome || '')) || m(String(descricao || ''));
}
export function precoTexto(p) { return p.promo != null && p.promo < p.preco ? `de ${brl(p.preco)} por ${brl(p.promo)}` : brl(p.preco); }

export function legendas(pecas, cfg) {
  const lista = pecas.map((p) => `• ${nomeCurto(p)}: ${precoTexto(p)}`).join('\n');
  const fim = 'Garanta a sua pelo site ou chame a gente no direct.';
  const abre = `${cfg.titulo} ${cfg.subtitulo} ✨`.replace(/\s+/g, ' ');
  return {
    curta: `${abre}\n${pecas.length} peças separadas para você.\n${fim}`,
    media: `${abre}\n\n${lista}\n\n${fim}`,
    longa: `${abre}\n\n${lista}\n\nTodas com certificado de garantia, nota fiscal e embalagem para presente.\n\n${fim}`,
  };
}
export function hashtags(pecas) {
  const t = new Set(['#vrpratas', '#joias', '#reels']);
  for (const p of pecas) {
    const m = material(p.nome, p.descricao);
    if (/Prata/.test(m)) t.add('#prata925');
    if (/Banhado/.test(m)) t.add('#folheados');
    if (/Ouro 18K/.test(m)) t.add('#ouro18k');
  }
  return [...t].join(' ');
}

