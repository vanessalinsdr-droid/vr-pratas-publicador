// Trilha original do Reel, renderizada offline com Tone.js.
// cfg = { duracao, cortes: [s...], final }
// cortes = instantes (em segundos) em que cada peça entra na tela; final = início do encerramento.
// Música original (sem direitos autorais de terceiros): um acorde por peça, sino na entrada de cada uma.
async function renderTrilha(cfg) {
  const {duracao, cortes, final} = cfg;
  const buffer = await Tone.Offline(({transport}) => {
    const master = new Tone.Gain(0.9).toDestination();
    const comp = new Tone.Compressor(-18, 3).connect(master);
    const reverb = new Tone.Reverb({decay: 5.5, wet: 0.38}).connect(comp);
    const delay = new Tone.FeedbackDelay({delayTime: 0.375, feedback: 0.28, wet: 0.18}).connect(reverb);

    // Pad suave
    const pad = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 1.5,
      oscillator: {type: 'sine'},
      envelope: {attack: 1.2, decay: 0.5, sustain: 0.8, release: 2.5},
      modulation: {type: 'triangle'},
      modulationEnvelope: {attack: 1.5, decay: 0, sustain: 1, release: 2},
      volume: -21,
    });
    const padFiltro = new Tone.Filter(1400, 'lowpass').connect(reverb);
    pad.connect(padFiltro);

    // Arpejo tipo piano/caixinha de música
    const arp = new Tone.PolySynth(Tone.Synth, {
      oscillator: {type: 'triangle'},
      envelope: {attack: 0.005, decay: 0.6, sustain: 0.05, release: 1.2},
      volume: -17,
    }).connect(delay);

    // Baixo macio
    const baixo = new Tone.MonoSynth({
      oscillator: {type: 'sine'},
      envelope: {attack: 0.05, decay: 0.8, sustain: 0.6, release: 1.5},
      filterEnvelope: {baseFrequency: 120, octaves: 1.5, attack: 0.02, decay: 0.4, sustain: 0.4},
      volume: -20,
    }).connect(comp);

    // Sino de brilho na entrada de cada peça
    const sino = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 12,
      oscillator: {type: 'sine'},
      envelope: {attack: 0.002, decay: 1.6, sustain: 0, release: 1.8},
      modulation: {type: 'sine'},
      modulationEnvelope: {attack: 0.002, decay: 0.5, sustain: 0, release: 0.4},
      volume: -24,
    }).connect(reverb);

    // Sopro (ruído filtrado) antes das transições
    const sopro = new Tone.NoiseSynth({noise: {type: 'pink'}, envelope: {attack: 0.45, decay: 0.15, sustain: 0, release: 0.25}, volume: -30});
    const soproFiltro = new Tone.AutoFilter({frequency: 2, baseFrequency: 600, octaves: 3}).connect(reverb).start();
    sopro.connect(soproFiltro);

    const acordes = [
      {pad: ['C4', 'E4', 'G4', 'B4', 'D5'], baixo: 'C2', arp: ['C5', 'G5', 'E5', 'B5', 'D6', 'B5', 'G5', 'E5']},
      {pad: ['A3', 'C4', 'E4', 'G4', 'B4'], baixo: 'A1', arp: ['A4', 'E5', 'C5', 'G5', 'B5', 'G5', 'E5', 'C5']},
      {pad: ['F3', 'A3', 'C4', 'E4', 'G4'], baixo: 'F1', arp: ['F4', 'C5', 'A4', 'E5', 'G5', 'E5', 'C5', 'A4']},
      {pad: ['G3', 'B3', 'D4', 'E4', 'A4'], baixo: 'G1', arp: ['G4', 'D5', 'B4', 'E5', 'A5', 'E5', 'D5', 'B4']},
    ];
    const brilhos = [['E6', 'B6'], ['G6', 'D7'], ['A6', 'E7'], ['B6', 'G7']];

    // Introdução: pad sozinho e um sino
    pad.triggerAttackRelease(acordes[0].pad, cortes[0] + 0.2, 0, 0.5);
    sino.triggerAttackRelease(['G6', 'C7'], 1.2, 0.15, 0.5);

    // Um acorde por produto (e o último segura no encerramento)
    const blocos = [...cortes, final];
    blocos.forEach((ini, i) => {
      const fim = i + 1 < blocos.length ? blocos[i + 1] : duracao;
      const a = acordes[i % acordes.length];
      const dur = fim - ini;
      const ultimo = i === blocos.length - 1;
      pad.triggerAttackRelease(a.pad, dur + 0.3, ini, 0.6);
      baixo.triggerAttackRelease(a.baixo, Math.min(dur, 2.8), ini, 0.8);
      const passo = 0.375;
      const notas = ultimo ? a.arp.slice(0, 5) : a.arp;
      notas.forEach((n, k) => {
        const t = ini + k * passo;
        if (t < fim - 0.05) arp.triggerAttackRelease(n, 0.3, t, k === 0 ? 0.8 : 0.55);
      });
      sino.triggerAttackRelease(brilhos[i % brilhos.length], 1.2, ini + 0.08, 0.6);
      if (!ultimo && i + 1 < blocos.length) sopro.triggerAttackRelease(0.5, blocos[i + 1] - 0.55, 0.7);
    });

    // Fade final
    master.gain.setValueAtTime(0.9, duracao - 1.4);
    master.gain.linearRampToValueAtTime(0, duracao - 0.05);
  }, duracao, 2, 44100);

  // Converte para WAV 16-bit
  const ch = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const n = ch[0].length;
  let pico = 0;
  for (const c of ch) for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(c[i]));
  const ganho = pico > 0 ? Math.min(1 / pico, 4) * 0.89 : 1; // normaliza em ~ -1 dBFS
  const dv = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, 44100, true); dv.setUint32(28, 44100 * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (const c of ch) { dv.setInt16(o, Math.max(-1, Math.min(1, c[i] * ganho)) * 32767, true); o += 2; }
  const bytes = new Uint8Array(dv.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
