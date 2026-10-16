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
  console.log("Tudo certo para publicar.");
}

main().catch(e => { console.error("✖ " + e.message); process.exit(1); });
