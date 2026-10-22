// Diz em quantos segundos o robô deve rodar de novo, quando há post esperando na fila.
// O agendamento do GitHub ("a cada 15 min") atrasa horas; com isso o robô se chama sozinho
// enquanto houver trabalho. Sem nada pendente, não imprime nada e a rodada termina.
import fs from "node:fs";
import path from "node:path";
import { lerJson, quando, RAIZ } from "./meta.mjs";

const MIN = 60, MAX = 15 * 60, HORIZONTE_H = 6;
const agora = Date.now();
let proximo = Infinity;
for (const a of fs.readdirSync(path.join(RAIZ, "fila")).filter(x => x.endsWith(".json"))) {
  const post = lerJson(path.join(RAIZ, "fila", a));
  if (!post || !post.liberado) continue;
  const res = lerJson(path.join(RAIZ, "resultados", a), { status: "agendado" });
  if (res.status !== "agendado") continue;
  let t = quando(post).getTime();
  if (post.recebidoEm) t = Math.max(t, Date.parse(post.recebidoEm) + 10 * 60e3 + 30e3);
  if (t <= agora) t = agora + 5 * 60e3; // atrasado ou tentando de novo depois de uma falha
  if (t - agora <= HORIZONTE_H * 36e5) proximo = Math.min(proximo, t);
}
if (proximo !== Infinity) console.log(Math.round(Math.min(MAX, Math.max(MIN, (proximo - agora) / 1000))));
