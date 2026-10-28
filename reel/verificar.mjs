// Checagem rápida (sem instalar nada): há Reel para fazer agora? Responde ao GitHub Actions em "fazer".
import fs from 'node:fs';
import {ponte, decidir} from './base.mjs';

const dados = await ponte('reel-dados');
const d = decidir(dados, 'auto');
const fazer = !!d;
console.log(fazer ? `Há Reel para fazer (${d.origem}).` : 'Nada a fazer agora.');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `fazer=${fazer}\n`);
