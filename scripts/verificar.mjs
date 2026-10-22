// Teste da configuração: confere se a chave da Meta enxerga a Página e o Instagram certos.
// Não publica nada.
import { graph, exigirConfig, IG_ID, PAGE_ID, BASE_URL } from "./meta.mjs";

async function main() {
  exigirConfig();
  const pagina = await graph("GET", PAGE_ID, { fields: "name,instagram_business_account" });
  console.log(`✔ Página do Facebook: ${pagina.name}`);
  const ig = await graph("GET", IG_ID, { fields: "username,name" });
  console.log(`✔ Instagram: @${ig.username}`);
  if (pagina.instagram_business_account && pagina.instagram_business_account.id !== IG_ID)
    console.log(`⚠ O Instagram ligado a esta Página tem outro ID (${pagina.instagram_business_account.id}). Confira o IG_USER_ID.`);
  const lim = await graph("GET", `${IG_ID}/content_publishing_limit`, { fields: "quota_usage,config" }).catch(() => null);
  if (lim && lim.data && lim.data[0]) console.log(`✔ Publicações usadas nas últimas 24h: ${lim.data[0].quota_usage} de ${lim.data[0].config?.quota_total ?? "?"}`);
  const r = await fetch(BASE_URL + "/LEIA-ME.md", { method: "HEAD" }).catch(() => null);
  console.log(r && r.ok ? `✔ Endereço público das artes funcionando: ${BASE_URL}` : `⚠ O endereço público (${BASE_URL}) ainda não responde. Confira se o GitHub Pages está ligado.`);
  // Marcação de produtos do catálogo nos posts do Instagram
  const CAT = process.env.CATALOGO_ID || "8886435968042543";
  const perms = await graph("GET", "me/permissions").catch(e => ({ erro: e.message }));
  if (perms.data) {
    const ok = perms.data.filter(x => x.status === "granted").map(x => x.permission);
    console.log("Permissões da chave: " + ok.join(", "));
    for (const pp of ["instagram_shopping_tag_products", "catalog_management"]) console.log((ok.includes(pp) ? "✔ " : "⚠ falta ") + pp);
  } else console.log("Permissões da chave: não foi possível listar (" + (perms.erro || "?") + ")");
  const eleg = await graph("GET", IG_ID, { fields: "shopping_product_tag_eligibility" }).catch(e => ({ erro: e.message }));
  console.log("Instagram pode marcar produtos: " + (eleg.erro ? "erro: " + eleg.erro : String(eleg.shopping_product_tag_eligibility)));
  const cats = await graph("GET", `${IG_ID}/available_catalogs`, { fields: "catalog_id,catalog_name,shop_name" }).catch(e => ({ erro: e.message }));
  console.log("Catálogos disponíveis para marcar: " + (cats.erro ? "erro: " + cats.erro : JSON.stringify(cats.data || [])));
  const busca = await graph("GET", `${IG_ID}/catalog_product_search`, { catalog_id: CAT, q: "Coração Ponto de Luz" }).catch(e => ({ erro: e.message }));
  console.log("Busca no catálogo (Coração Ponto de Luz): " + (busca.erro ? "erro: " + busca.erro : JSON.stringify((busca.data || []).slice(0, 5))));
  const prods = await graph("GET", `${CAT}/products`, { fields: "id,retailer_id,name,url", limit: 3 }).catch(e => ({ erro: e.message }));
  console.log("Exemplo de produtos do catálogo: " + (prods.erro ? "erro: " + prods.erro : JSON.stringify(prods.data || [])));
  console.log("Tudo certo para publicar.");
}

main().catch(e => { console.error("✖ " + e.message); process.exit(1); });
