/**
 * Ouvertures de l'onglet Théorie : ligne principale, 2 à 4 variantes et coups clés commentés
 * (une phrase de 15 mots au plus). Les coups sont en SAN anglaise, affichés dans la notation choisie.
 * `match` repère les lignes de la base Lichess (data/*.tsv) qui appartiennent à l'ouverture.
 */

export interface TheoryLine {
  name: string;
  moves: string;
  /** Commentaires des coups clés, par demi-coup (1 = premier coup des blancs). */
  notes: Record<number, string>;
}

export interface TheoryOpening {
  id: string;
  name: string;
  /** Mots-clés de recherche : noms anglais, surnoms, codes ECO. */
  aliases: string[];
  eco: string;
  /** Camp qui choisit l'ouverture (celui qu'on entraîne). */
  side: 'w' | 'b';
  group: string;
  summary: string;
  match: RegExp;
  main: TheoryLine;
  variations: TheoryLine[];
}

export const GROUPS = ['Avec les blancs', 'Contre 1.e4', 'Contre 1.d4'];

export const OPENINGS: TheoryOpening[] = [
  {
    id: 'viennoise',
    name: 'Partie viennoise',
    aliases: ['Vienne', 'Vienna Game', 'Viennese', 'Gambit viennois', 'C25', 'C26', 'C27', 'C28', 'C29'],
    eco: 'C25–C29',
    side: 'w',
    group: 'Avec les blancs',
    summary: 'Les blancs préparent f4 avant de sortir le cavalier g1.',
    match: /^Vienna Game/,
    main: {
      name: 'Gambit viennois',
      moves: 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O Bd3',
      notes: {
        3: 'Le cavalier protège e4 et laisse le pion f libre d’avancer.',
        4: 'Les noirs attaquent e4 et préparent le petit roque.',
        5: 'Le gambit : les blancs attaquent e5 pour ouvrir la colonne f.',
        6: 'La réponse la plus solide : les noirs frappent au centre.',
        7: 'Les blancs gagnent de l’espace et chassent le cavalier f6.',
        8: 'Le cavalier s’installe en e4, très actif.',
        9: 'Développement qui protège e5 et prépare d4.',
        11: 'Les blancs prennent le centre et ouvrent la diagonale du fou c1.',
        13: 'Le fou vise e4 et le roque noir.',
      },
    },
    variations: [
      { name: 'Défense Max Lange (2…Cc6)', moves: 'e4 e5 Nc3 Nc6 Bc4 Nf6 d3 Bc5 f4 d6 Nf3', notes: { 4: 'Les noirs miroitent et gardent e5.', 5: 'Le fou vise f7, point faible du roque.' } },
      { name: 'Variante Frankenstein-Dracula', moves: 'e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5 Nd6 Bb3 Nc6 Nb5 g6 Qf3 f5 Qd5 Qe7', notes: { 6: 'Les noirs prennent e4 : la position devient très tactique.', 7: 'La dame menace mat en f7.' } },
      { name: 'Variante Mieses (3.g3)', moves: 'e4 e5 Nc3 Nf6 g3 d5 exd5 Nxd5 Bg2 Nxc3 bxc3 Bd6', notes: { 5: 'Fianchetto : le fou pèsera sur la grande diagonale.' } },
    ],
  },
  {
    id: 'ecossaise',
    name: 'Partie écossaise',
    aliases: ['Écossaise', 'Scotch Game', 'Scotch', 'C44', 'C45'],
    eco: 'C44–C45',
    side: 'w',
    group: 'Avec les blancs',
    summary: 'Les blancs ouvrent le centre dès le 3e coup avec d4.',
    match: /^Scotch Game/,
    main: {
      name: 'Variante Mieses',
      moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4',
      notes: {
        5: 'Les blancs attaquent e5 tout de suite et ouvrent le jeu.',
        6: 'Les noirs prennent : ils ne peuvent pas tenir e5.',
        7: 'Le cavalier reprend et occupe le centre.',
        8: 'Les noirs attaquent e4 en se développant.',
        9: 'L’échange abîme la structure noire.',
        11: 'Le pion chasse le cavalier et gagne de l’espace.',
        15: 'Le pion c4 chasse le cavalier d5 de son poste.',
      },
    },
    variations: [
      { name: 'Variante classique (4…Fc5)', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4', notes: { 8: 'Le fou attaque le cavalier d4.', 10: 'La dame renforce la pression sur d4.' } },
      { name: 'Variante Potter (5.Cb3)', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nb3 Bb6 a4 a6', notes: { 9: 'Le cavalier recule en chassant le fou.' } },
      { name: 'Gambit écossais (4.Fc4)', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Bc4 Bc5 c3 Nf6 e5 d5', notes: { 7: 'Les blancs laissent un pion pour se développer vite.' } },
    ],
  },
  {
    id: 'italienne',
    name: 'Partie italienne',
    aliases: ['Italienne', 'Italian Game', 'Giuoco Piano', 'Giuoco Pianissimo', 'Gambit Evans', 'Deux cavaliers', 'C50', 'C51', 'C52', 'C53', 'C54', 'C55'],
    eco: 'C50–C59',
    side: 'w',
    group: 'Avec les blancs',
    summary: 'Le fou va en c4 viser f7 ; jeu calme ou très tactique.',
    match: /^Italian Game/,
    main: {
      name: 'Giuoco Pianissimo',
      moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6',
      notes: {
        3: 'Le cavalier attaque e5 et se développe vers le roque.',
        4: 'Les noirs défendent e5 en développant une pièce.',
        5: 'Le fou vise f7, le point le plus faible des noirs.',
        6: 'Les noirs copient : leur fou vise f2.',
        7: 'Le pion c3 prépare d4 pour prendre le centre.',
        9: 'Jeu calme : les blancs gardent e4 et préparent une longue manœuvre.',
        11: 'Le roi est à l’abri, la tour viendra en e1.',
        13: 'La tour soutient e4 et prépare Cbd2-f1-g3.',
      },
    },
    variations: [
      { name: 'Défense des deux cavaliers', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6', notes: { 6: 'Les noirs attaquent e4 au lieu de copier.', 7: 'Le cavalier attaque f7 avec le fou.', 10: 'Les noirs sacrifient un pion pour chasser le fou.' } },
      { name: 'Gambit Evans', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O', notes: { 7: 'Les blancs donnent un pion pour gagner du temps au centre.' } },
      { name: 'Giuoco Piano (5.d4)', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5', notes: { 9: 'Les blancs frappent au centre tout de suite.', 12: 'L’échec gêne le développement blanc.' } },
    ],
  },
  {
    id: 'espagnole',
    name: 'Partie espagnole',
    aliases: ['Espagnole', 'Ruy Lopez', 'Spanish', 'Berlinoise', 'Berlin', 'Marshall', 'C60', 'C65', 'C68', 'C78', 'C84', 'C88', 'C92'],
    eco: 'C60–C99',
    side: 'w',
    group: 'Avec les blancs',
    summary: 'Le fou b5 attaque le défenseur de e5 : pression lente et durable.',
    match: /^Ruy Lopez/,
    main: {
      name: 'Variante fermée',
      moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
      notes: {
        5: 'Le fou attaque le cavalier qui défend e5.',
        6: 'La question au fou : les noirs gagnent de l’espace à l’aile dame.',
        7: 'Le fou garde le clouage sur la diagonale.',
        9: 'Les blancs roquent : e4 est défendu par une tactique.',
        11: 'La tour protège e4 et menace Fxc6 puis Cxe5.',
        12: 'Les noirs chassent le fou pour soulager e5.',
        15: 'Le pion c3 prépare d4 et une retraite pour le fou.',
        17: 'h3 empêche Fg4, qui clouerait le cavalier f3.',
      },
    },
    variations: [
      { name: 'Défense berlinoise', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8', notes: { 6: 'La Berlinoise : solide, elle mène souvent à une finale.', 8: 'Les noirs prennent e4, ils le rendront plus tard.' } },
      { name: 'Variante d’échange', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4', notes: { 7: 'Les blancs abîment les pions noirs pour jouer la finale.' } },
      { name: 'Attaque Marshall', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5', notes: { 16: 'Le gambit Marshall : un pion contre une attaque sur le roi.' } },
    ],
  },
  {
    id: 'londres',
    name: 'Système de Londres',
    aliases: ['Londres', 'London System', 'London', 'D02', 'A46', 'A48'],
    eco: 'A46–A48, D02',
    side: 'w',
    group: 'Avec les blancs',
    summary: 'Un schéma fixe : d4, Ff4, e3, c3 ; solide contre presque tout.',
    match: /London System/,
    main: {
      name: 'Contre 1…d5',
      moves: 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3',
      notes: {
        3: 'Le fou sort avant e3 pour ne pas rester enfermé.',
        5: 'e3 soutient d4 et ouvre la voie au fou f1.',
        6: 'Les noirs attaquent d4, la réponse la plus active.',
        7: 'La chaîne c3-d4-e3 rend le centre très solide.',
        9: 'Le cavalier va en d2 pour garder c4 et e4.',
        13: 'Le fou recule pour éviter l’échange contre Fd6.',
        15: 'Le fou vise h7 : les blancs préparent Ce5 et l’attaque.',
      },
    },
    variations: [
      { name: 'Contre la structure est-indienne', moves: 'd4 Nf6 Nf3 g6 Bf4 Bg7 e3 d6 Be2 O-O h3 c5 c3', notes: { 11: 'h3 donne une case au fou f4 si les noirs jouent Ch5.' } },
      { name: 'Avec …Db6', moves: 'd4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qc2', notes: { 8: 'La dame attaque b2, faiblesse classique du Londres.', 9: 'Les blancs proposent l’échange des dames.' } },
      { name: 'Londres accéléré (2.Ff4)', moves: 'd4 Nf6 Bf4 d5 e3 c5 Nc3 Nc6 Nb5', notes: { 7: 'Le cavalier en c3 prépare Cb5 contre c7.' } },
    ],
  },
  {
    id: 'caro-kann',
    name: 'Défense Caro-Kann',
    aliases: ['Caro', 'Caro Kann', 'Caro-Kann Defense', 'B12', 'B13', 'B14', 'B18', 'B19'],
    eco: 'B10–B19',
    side: 'b',
    group: 'Contre 1.e4',
    summary: 'c6 puis d5 : une défense solide qui sort le fou c8 avant e6.',
    match: /^Caro-Kann Defense/,
    main: {
      name: 'Variante classique',
      moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3',
      notes: {
        2: 'c6 prépare d5 sans enfermer le fou c8.',
        4: 'Les noirs contestent e4 tout de suite.',
        6: 'Les noirs prennent pour sortir leur fou avec gain de temps.',
        8: 'Le fou sort avant e6 : c’est l’idée de la Caro-Kann.',
        9: 'Le cavalier chasse le fou avec gain de temps.',
        11: 'Les blancs menacent h5 pour enfermer le fou.',
        12: 'h6 donne une case de retraite au fou.',
        18: 'L’échange des fous allège la position noire.',
      },
    },
    variations: [
      { name: 'Variante d’avance', moves: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3', notes: { 5: 'Les blancs prennent de l’espace et bloquent le centre.', 6: 'Le fou sort avant e6, comme toujours.' } },
      { name: 'Variante d’échange', moves: 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3', notes: { 5: 'Structure symétrique : jeu calme, petite initiative blanche.' } },
      { name: 'Attaque Panov', moves: 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7', notes: { 7: 'Les blancs acceptent un pion isolé contre un jeu actif.' } },
    ],
  },
  {
    id: 'sicilienne',
    name: 'Défense sicilienne',
    aliases: ['Sicilienne', 'Sicilian Defense', 'Sicilian', 'Najdorf', 'Dragon', 'Alapin', 'B20', 'B22', 'B70', 'B90'],
    eco: 'B20–B99',
    side: 'b',
    group: 'Contre 1.e4',
    summary: 'c5 : une défense de combat, déséquilibrée dès le départ.',
    match: /^Sicilian Defense/,
    main: {
      name: 'Variante Najdorf',
      moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O',
      notes: {
        2: 'c5 contrôle d4 sans pion central symétrique.',
        5: 'Les blancs ouvrent le jeu pour leur avance de développement.',
        6: 'Les noirs échangent un pion de côté contre un pion central.',
        8: 'Le cavalier attaque e4 et force Cc3.',
        10: 'La Najdorf : a6 empêche Cb5 et Fb5.',
        11: 'L’attaque anglaise : Fe3, f3, Dd2 puis grand roque.',
        12: 'Les noirs chassent le cavalier et prennent leur part du centre.',
        15: 'f3 protège e4 et prépare g4.',
      },
    },
    variations: [
      { name: 'Variante du dragon', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4', notes: { 10: 'Le dragon : le fou g7 crachera du feu sur la grande diagonale.', 13: 'L’attaque yougoslave : roques opposés et course aux mats.' } },
      { name: 'Variante Alapin (2.c3)', moves: 'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6 Be2', notes: { 3: 'c3 prépare d4 pour garder un vrai centre.', 4: 'Les noirs répondent au centre avant d4.' } },
      { name: 'Najdorf, 6.Fg5', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7', notes: { 11: 'Le fou cloue le cavalier f6 avant f4.' } },
    ],
  },
  {
    id: 'francaise',
    name: 'Défense française',
    aliases: ['Française', 'French Defense', 'French', 'Winawer', 'Tarrasch', 'C00', 'C02', 'C11', 'C15'],
    eco: 'C00–C19',
    side: 'b',
    group: 'Contre 1.e4',
    summary: 'e6 puis d5 : une chaîne de pions solide, contre-jeu par c5.',
    match: /^French Defense/,
    main: {
      name: 'Variante classique',
      moves: 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5',
      notes: {
        2: 'e6 prépare d5 en soutenant le pion.',
        4: 'Les noirs contestent e4 tout de suite.',
        6: 'Le cavalier attaque encore e4.',
        7: 'Le fou cloue le cavalier défenseur.',
        9: 'Les blancs ferment le centre et gagnent de l’espace.',
        13: 'f4 soutient e5, pilier de la position blanche.',
        16: 'c5 attaque la base de la chaîne blanche, l’idée clé.',
      },
    },
    variations: [
      { name: 'Variante d’avance', moves: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3', notes: { 6: 'Les noirs attaquent tout de suite la chaîne en d4.', 10: 'La dame pèse sur d4 et b2.' } },
      { name: 'Variante Winawer', moves: 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7', notes: { 6: 'Le fou cloue le cavalier qui défend e4.', 10: 'Les noirs abîment les pions blancs.' } },
      { name: 'Variante Tarrasch', moves: 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2', notes: { 5: 'Le cavalier en d2 évite le clouage Fb4.' } },
      { name: 'Variante d’échange', moves: 'e4 e6 d4 d5 exd5 exd5 Bd3 Nc6 c3 Bd6', notes: { 5: 'Structure symétrique : la partie s’annonce calme.' } },
    ],
  },
  {
    id: 'scandinave',
    name: 'Défense scandinave',
    aliases: ['Scandinave', 'Scandinavian Defense', 'Scandinavian', 'Centre-Counter', 'B01'],
    eco: 'B01',
    side: 'b',
    group: 'Contre 1.e4',
    summary: 'd5 attaque e4 tout de suite ; la dame noire sort tôt.',
    match: /^Scandinavian Defense/,
    main: {
      name: 'Variante principale (3…Da5)',
      moves: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6',
      notes: {
        2: 'Les noirs attaquent e4 dès le premier coup.',
        4: 'La dame reprend, au prix d’un temps.',
        5: 'Le cavalier chasse la dame avec gain de temps.',
        6: 'En a5, la dame cloue c3 et reste à l’abri.',
        10: 'c6 donne une retraite à la dame et solidifie d5.',
        12: 'Le fou sort avant e6, comme dans la Caro-Kann.',
        13: 'Le fou d2 menace Cd5, qui découvre une attaque sur la dame.',
      },
    },
    variations: [
      { name: 'Variante 3…Dd6', moves: 'e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 g3 Bg4', notes: { 6: 'En d6, la dame contrôle b4 et e5.' } },
      { name: 'Variante moderne (2…Cf6)', moves: 'e4 d5 exd5 Nf6 d4 Nxd5 c4 Nb6 Nf3 g6', notes: { 4: 'Les noirs reprennent avec le cavalier, pas la dame.' } },
      { name: 'Variante 3…Dd8', moves: 'e4 d5 exd5 Qxd5 Nc3 Qd8 d4 Nf6 Nf3 c6', notes: { 6: 'Retraite prudente : la dame ne sera plus chassée.' } },
    ],
  },
  {
    id: 'pirc',
    name: 'Défense Pirc',
    aliases: ['Pirc', 'Pirc Defense', 'B07', 'B08', 'B09'],
    eco: 'B07–B09',
    side: 'b',
    group: 'Contre 1.e4',
    summary: 'Les noirs laissent le centre aux blancs pour l’attaquer ensuite.',
    match: /^Pirc Defense/,
    main: {
      name: 'Variante classique',
      moves: 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4 Nbd7',
      notes: {
        2: 'd6 contrôle e5 et laisse les blancs bâtir leur centre.',
        4: 'Le cavalier attaque e4 et force Cc3.',
        6: 'Fianchetto : le fou g7 visera le centre blanc.',
        8: 'Le fou est en place, le roque suit.',
        9: 'Développement calme : les blancs gardent leur centre.',
        12: 'c6 prépare b5 et une case pour la dame.',
        13: 'a4 empêche b5 et l’expansion noire.',
      },
    },
    variations: [
      { name: 'Attaque autrichienne', moves: 'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Na6', notes: { 7: 'Trois pions au centre : les blancs veulent écraser.' } },
      { name: 'Attaque 150 (Fe3, Dd2)', moves: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5', notes: { 7: 'Fe3 et Dd2 préparent Fh6 pour échanger le fou g7.' } },
    ],
  },
  {
    id: 'gda',
    name: 'Gambit dame accepté',
    aliases: ['GDA', 'Queen’s Gambit Accepted', "Queen's Gambit Accepted", 'QGA', 'D20', 'D24', 'D27'],
    eco: 'D20–D29',
    side: 'b',
    group: 'Contre 1.d4',
    summary: 'Les noirs prennent c4 puis le rendent en échange d’un jeu libre.',
    match: /^Queen's Gambit Accepted/,
    main: {
      name: 'Variante classique',
      moves: 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 a4 Nc6',
      notes: {
        3: 'Le gambit dame : les blancs proposent un pion de côté.',
        4: 'Les noirs acceptent, sans chercher à garder le pion.',
        5: 'Le cavalier empêche e5 et se développe.',
        7: 'e3 ouvre la diagonale pour reprendre c4.',
        9: 'Les blancs récupèrent le pion avec un beau centre.',
        10: 'c5 attaque d4 : le contre-jeu noir habituel.',
        12: 'a6 prépare b5 pour chasser le fou.',
        13: 'a4 empêche b5 et fige l’aile dame.',
      },
    },
    variations: [
      { name: 'Attaque centrale (3.e4)', moves: 'd4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4 Nc6 O-O', notes: { 5: 'Les blancs occupent tout le centre tout de suite.', 6: 'Les noirs frappent le centre à leur tour.' } },
      { name: 'Variante 3.e4 Cf6', moves: 'd4 d5 c4 dxc4 e4 Nf6 e5 Nd5 Bxc4 Nb6 Bb3', notes: { 7: 'Le pion chasse le cavalier et gagne de l’espace.' } },
      { name: 'Variante 3.Cf3 a6', moves: 'd4 d5 c4 dxc4 Nf3 a6 e3 b5 a4 Bb7', notes: { 6: 'Les noirs veulent garder le pion avec b5.' } },
    ],
  },
  {
    id: 'gdr',
    name: 'Gambit dame refusé',
    aliases: ['GDR', 'Queen’s Gambit Declined', "Queen's Gambit Declined", 'QGD', 'Tartakover', 'D30', 'D35', 'D37', 'D58'],
    eco: 'D30–D69',
    side: 'b',
    group: 'Contre 1.d4',
    summary: 'e6 garde d5 : la défense la plus classique contre le gambit dame.',
    match: /^Queen's Gambit Declined/,
    main: {
      name: 'Variante Tartakover',
      moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5',
      notes: {
        3: 'Les blancs attaquent d5 avec un pion de côté.',
        4: 'e6 soutient d5 : les noirs refusent le pion.',
        7: 'Le fou cloue le cavalier qui défend d5.',
        8: 'Le fou se place pour défaire le clouage.',
        12: 'h6 pose la question au fou g5.',
        14: 'La Tartakover : le fou ira en b7 sur la grande diagonale.',
        16: 'Le cavalier reprend et propose des échanges libérateurs.',
      },
    },
    variations: [
      { name: 'Variante d’échange', moves: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3', notes: { 7: 'L’échange fixe la structure : attaque de minorité possible.' } },
      { name: 'Défense Ragozine', moves: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Bb4 Bg5 h6 Bxf6 Qxf6', notes: { 8: 'Le fou cloue c3 et augmente la pression sur e4.' } },
      { name: 'Défense Tarrasch', moves: 'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2', notes: { 6: 'Les noirs acceptent un pion isolé contre un jeu libre.' } },
    ],
  },
  {
    id: 'slave',
    name: 'Défense slave',
    aliases: ['Slave', 'Slav Defense', 'Slav', 'Semi-slave', 'Semi-Slav', 'Meran', 'D10', 'D11', 'D15', 'D17', 'D43', 'D45'],
    eco: 'D10–D19, D43–D49',
    side: 'b',
    group: 'Contre 1.d4',
    summary: 'c6 garde d5 sans enfermer le fou c8.',
    match: /^(Slav Defense|Semi-Slav Defense)/,
    main: {
      name: 'Variante principale',
      moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O',
      notes: {
        4: 'c6 soutient d5 et laisse la diagonale du fou c8 ouverte.',
        8: 'Les noirs prennent c4 maintenant que b5 peut le garder.',
        9: 'a4 empêche b5 : les blancs récupéreront le pion.',
        10: 'Le fou sort avant e6, l’atout de la Slave.',
        13: 'Les blancs reprennent le pion avec un bon développement.',
        14: 'Le fou cloue c3 et contrôle e4.',
      },
    },
    variations: [
      { name: 'Variante d’échange', moves: 'd4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 Bf5', notes: { 5: 'Position symétrique : les blancs gardent un léger avantage.' } },
      { name: 'Semi-slave, Meran', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 Bb7', notes: { 8: 'e6 : la semi-slave, plus solide mais fou c8 enfermé.', 14: 'b5 chasse le fou et prépare Fb7.' } },
      { name: 'Variante Chebanenko (4…a6)', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 a6 e3 b5 b3 Bg4', notes: { 8: 'a6 prépare b5 pour gagner de l’espace à l’aile dame.' } },
    ],
  },
  {
    id: 'est-indienne',
    name: 'Défense est-indienne',
    aliases: ['Est-indienne', 'King’s Indian Defense', "King's Indian Defense", 'KID', 'Mar del Plata', 'Sämisch', 'E60', 'E70', 'E80', 'E92', 'E97'],
    eco: 'E60–E99',
    side: 'b',
    group: 'Contre 1.d4',
    summary: 'Les noirs laissent le centre puis l’attaquent par e5 et f5.',
    match: /^King's Indian Defense/,
    main: {
      name: 'Variante Mar del Plata',
      moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7',
      notes: {
        4: 'Fianchetto : le fou g7 visera le centre blanc.',
        7: 'Les blancs prennent tout le centre.',
        8: 'd6 prépare e5, le coup clé des noirs.',
        12: 'e5 frappe le centre blanc.',
        15: 'Les blancs ferment le centre : chacun attaque sur son aile.',
        16: 'Le cavalier prépare f5 et l’attaque sur le roi.',
      },
    },
    variations: [
      { name: 'Variante Sämisch', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5', notes: { 9: 'f3 renforce e4 et prépare g4 contre le roque noir.' } },
      { name: 'Attaque des quatre pions', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5 d5 e6', notes: { 9: 'Quatre pions au centre : ambitieux mais exposé.', 12: 'c5 attaque aussitôt ce grand centre.' } },
      { name: 'Variante du fianchetto', moves: 'd4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O Nbd7 Nc3 e5', notes: { 7: 'Les blancs opposent leur propre fianchetto.' } },
    ],
  },
  {
    id: 'nimzo',
    name: 'Défense nimzo-indienne',
    aliases: ['Nimzo', 'Nimzo-indienne', 'Nimzo-Indian Defense', 'Nimzo-Indian', 'Rubinstein', 'E20', 'E32', 'E40', 'E46'],
    eco: 'E20–E59',
    side: 'b',
    group: 'Contre 1.d4',
    summary: 'Fb4 cloue le cavalier c3 pour empêcher e4.',
    match: /^Nimzo-Indian Defense/,
    main: {
      name: 'Variante Rubinstein',
      moves: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3',
      notes: {
        6: 'Le fou cloue le cavalier qui prépare e4.',
        7: 'e3 : les blancs se développent sans se compliquer.',
        8: 'Les noirs roquent avant de choisir leur structure.',
        10: 'd5 empêche e4 pour de bon.',
        12: 'c5 attaque d4, le contre-jeu typique.',
        15: 'a3 demande au fou de s’échanger contre le cavalier.',
        17: 'Les blancs gardent la paire de fous, contre des pions doublés.',
      },
    },
    variations: [
      { name: 'Variante classique (4.Dc2)', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7', notes: { 7: 'La dame reprendra en c3 sans abîmer les pions.' } },
      { name: 'Variante Sämisch', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3 c5 e3 Nc6', notes: { 7: 'Les blancs forcent l’échange tout de suite.' } },
      { name: 'Variante Léningrad (4.Fg5)', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 Bg5 h6 Bh4 c5 d5', notes: { 7: 'Le fou cloue à son tour le cavalier f6.' } },
    ],
  },
  {
    id: 'hollandaise',
    name: 'Défense hollandaise',
    aliases: ['Hollandaise', 'Dutch Defense', 'Dutch', 'Leningrad', 'Stonewall', 'A80', 'A81', 'A87', 'A90'],
    eco: 'A80–A99',
    side: 'b',
    group: 'Contre 1.d4',
    summary: 'f5 contrôle e4 et prépare une attaque sur l’aile roi.',
    match: /^Dutch Defense/,
    main: {
      name: 'Variante Léningrad',
      moves: 'd4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8 d5 a5',
      notes: {
        2: 'f5 contrôle e4 et annonce un jeu sur l’aile roi.',
        3: 'Le fianchetto blanc vise la case e4 et la grande diagonale.',
        6: 'La Léningrad : les noirs installent aussi leur fou en g7.',
        12: 'd6 prépare e5 pour frapper le centre.',
        14: 'La dame va en e8 pour soutenir e5 ou passer en f7.',
        15: 'd5 gagne de l’espace et freine e5.',
      },
    },
    variations: [
      { name: 'Stonewall', moves: 'd4 f5 c4 Nf6 g3 e6 Bg2 d5 Nf3 c6 O-O Bd6', notes: { 8: 'Le Stonewall : pions c6-d5-e6-f5, case e4 tenue.' } },
      { name: 'Variante classique', moves: 'd4 f5 c4 Nf6 g3 e6 Bg2 Be7 Nf3 O-O O-O d6 Nc3 Qe8', notes: { 12: 'd6 prépare e5 avec un centre souple.' } },
      { name: 'Gambit Staunton (2.e4)', moves: 'd4 f5 e4 fxe4 Nc3 Nf6 Bg5 Nc6 d5', notes: { 3: 'Les blancs donnent un pion pour ouvrir le jeu tout de suite.' } },
    ],
  },
];

/** Recherche sans accents ni casse, dans le nom, les surnoms et les codes ECO. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

export function searchOpenings(query: string, list = OPENINGS): TheoryOpening[] {
  const q = normalize(query);
  if (!q) return list;
  const eco = /^[a-e]\d{2}$/.test(q) ? q.toUpperCase() : null;
  return list.filter((o) => {
    if (eco && inEco(o, eco)) return true;
    return [o.name, ...o.aliases, o.main.name, ...o.variations.map((v) => v.name)].some((t) => normalize(t).includes(q));
  });
}

/** Le code ECO appartient-il aux plages de l'ouverture (« C25–C29, D02 ») ? */
export function inEco(o: Pick<TheoryOpening, 'eco' | 'aliases'>, code: string): boolean {
  if (o.aliases.includes(code)) return true;
  return o.eco.split(/,\s*/).some((part) => {
    const [a, b = a] = part.split('–');
    return code[0] === a[0] && code >= a && code <= b;
  });
}

export const lineMoves = (l: TheoryLine) => l.moves.split(' ');

/** Une partie appartient-elle à l'ouverture (code ECO ou nom de la base) ? */
export function gameInOpening(g: { eco?: string; opening?: string }, o: TheoryOpening): boolean {
  return (!!g.eco && inEco(o, g.eco)) || (!!g.opening && o.match.test(g.opening));
}
