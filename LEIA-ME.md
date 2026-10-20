# Publicador VR Pratas

Publica automaticamente no Instagram e no Facebook os posts aprovados e liberados na Central de Conteúdo VR Pratas, usando a API oficial da Meta. Sem custo.

## Como funciona
- `fila/` — um arquivo por post liberado no painel (legenda, canal, formato, data e horário de Brasília).
- `midia/` — as artes e vídeos de cada post. Ficam públicos pelo GitHub Pages, porque o Instagram precisa de um endereço público para buscar o arquivo.
- `resultados/` — o que aconteceu com cada post: publicado (com link) ou falhou (com motivo), e as métricas.

## Ligação com a Central de Conteúdo
Os posts liberados no painel chegam por `scripts/sincronizar.mjs`: o robô busca o texto e as artes, guarda em `fila/` e `midia/`, e no fim devolve ao painel o resultado (publicado com link, ou falhou com motivo) e as métricas. A identidade do robô é provada pelo próprio GitHub (token OIDC); não existe senha para essa ligação.

## Robôs (GitHub Actions)
- **Publicar posts** — a cada 15 minutos publica o que já chegou no horário.
- **Buscar métricas** — toda noite lê alcance, curtidas, comentários e compartilhamentos dos últimos 30 dias.
- **Testar configuração** — confere a chave da Meta sem publicar nada.

## Segurança
Nenhuma senha ou chave fica nos arquivos. A chave da Meta fica em *Settings → Secrets and variables → Actions*:
`META_TOKEN`, `IG_USER_ID`, `FB_PAGE_ID`.
