// =====================================================================
//  CONFIGURAÇÕES DO CINELIN TEAM  —  mexa aqui à vontade
//  (salve o arquivo e recarregue a página com F5)
// =====================================================================
window.CONFIG = {
  titulo: "Cinelin Team",
  subtitulo: "Draft Fut7 · CineLin TV",

  // Logo que aparece no topo (imagens ficam em imagens.js)
  logo: IMG.logo,

  // Nomes que já aparecem preenchidos na tela inicial
  jogadores: [
    { nome: "Jogador 1", time: "Cinelin A", cor: "#f5c518" },
    { nome: "Jogador 2", time: "Cinelin B", cor: "#3fd0ff" },
  ],

  // Cores que aparecem para escolher na tela inicial
  paletaCores: ["#f5c518", "#3fd0ff", "#ff4d6d", "#7cff6b", "#b388ff", "#ff9f1c", "#ffffff"],

  // Formações do fut7: [defensores, meias, atacantes] (+ 1 goleiro sempre)
  formacoes: {
    "2-3-1": [2, 3, 1],
    "3-2-1": [3, 2, 1],
    "2-2-2": [2, 2, 2],
    "3-1-2": [3, 1, 2],
    "1-3-2": [1, 3, 2],
    "2-1-3": [2, 1, 3],
  },
  formacaoPadrao: "2-3-1",

  // Personagens da CineLin TV que podem ser escolhidos como presidente.
  // "foto": imagem de imagens.js (ex.: IMG.kaique) ou um link de imagem.
  presidentes: [
    { nome: "Kaique Duarte", foto: IMG.kaique,  c1: "#f5c518", c2: "#7a5c00" },
    { nome: "Linduxo",       foto: IMG.linduxo, c1: "#3fd0ff", c2: "#0b3d5c" },
    { nome: "João Puello",   foto: IMG.joao,    c1: "#ff4d6d", c2: "#5c0b1e" },
    { nome: "Lin",           foto: IMG.lin,     c1: "#b388ff", c2: "#2e0b5c" },
  ],

  // Time da CineLin TV que entra no mercado junto com os outros.
  // posicao: "goleiro" | "defensor" | "meia" | "atacante" · ovr: nota de 50 a 99 · estrela: true = selo ⭐ ESTRELA
  timeCineLin: {
    nome: "CineLin TV", sigla: "CLT", c1: "#f5c518", c2: "#111111", logo: IMG.logo,
    jogadores: [
      { nome: "Linduxo",       posicao: "atacante", numero: "10", ovr: 99, foto: IMG.linduxo, estrela: true },
      { nome: "Kaique Duarte", posicao: "meia",     numero: "8",  ovr: 99, foto: IMG.kaique, estrela: true },
      { nome: "Lin",           posicao: "goleiro",  numero: "1",  ovr: 99, foto: IMG.lin, estrela: true },
      { nome: "João Puello",   posicao: "defensor", numero: "4",  ovr: 99, foto: IMG.joao, estrela: true },
    ],
  },

  reservas: 5,             // vagas no banco
  escolherPresidente: true, // presidente entra no draft (conta como 1 escolha)

  // "livre" = cada um monta quando quiser, sem esperar a vez
  // "alternado" = 1-2-1-2 ... | "cobrinha" = 1-2-2-1-1-2 ...
  modoPadrao: "livre",

  // Segundos por escolha (0 = sem cronômetro). Se acabar o tempo, escolhe sozinho.
  tempoPorEscolha: 0,

  // false = qualquer jogador em qualquer vaga (até goleiro na linha)
  // true  = vaga de GOL só aceita goleiro, DEF só defensor, MEI só meia, ATA só atacante
  respeitarPosicao: false,
};
