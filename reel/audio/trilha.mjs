// Renderiza a trilha (Tone.js) num Chromium sem tela e devolve um WAV.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

export async function gerarTrilha(saida, {duracao, cortes, final}) {
  const nav = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const pg = await nav.newPage();
    await pg.setContent('<html><body></body></html>');
    await pg.addScriptTag({path: path.join(AQUI, '..', 'node_modules', 'tone', 'build', 'Tone.js')});
    await pg.addScriptTag({path: path.join(AQUI, 'trilha.js')});
    const b64 = await pg.evaluate((cfg) => window.renderTrilha(cfg), {duracao, cortes, final});
    fs.writeFileSync(saida, Buffer.from(b64, 'base64'));
  } finally {
    await nav.close();
  }
}
