import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Reel, ReelProps, duracao} from './Reel';

const exemplo: ReelProps = {
  marca: 'V Pratas & Folheados',
  titulo: 'Novidades',
  subtitulo: 'da semana',
  produtos: [{nome: 'Peça de exemplo', detalhe: 'Prata 925 legítima', preco: 'R$ 0,00', imagem: 'fotos/exemplo.jpg'}],
  beneficios: ['Certificado de garantia', 'Nota fiscal', 'Embalagem para presente'],
  chamada: 'Compre pelo link da bio',
};

const Root: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={duracao(exemplo.produtos.length)}
    defaultProps={exemplo}
    calculateMetadata={({props}) => ({durationInFrames: duracao(props.produtos.length)})}
  />
);

registerRoot(Root);
