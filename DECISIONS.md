# Décisions

Choix faits là où le cahier des charges laissait une marge, ou s'en écarte, avec la raison.

## Plateforme et hébergement
- **PWA statique** (React 18, Vite, TypeScript strict, Zustand, Dexie). Aucun serveur applicatif.
- **Chemins relatifs** (`base: './'`) : l'app fonctionne à la racine d'un domaine, dans un sous-dossier (GitHub Pages) et en page hébergée sur claude.ai (`npm run build && node scripts/artifact-page.mjs`, sans service worker : pas d'installation ni de hors-ligne dans ce mode).
- **Framer Motion non utilisé** au palier P0 : les animations (déplacement des pièces, icône de classification, barre d'évaluation) sont en CSS, plus légères. À réévaluer en P1.

## Moteur
- **Stockfish 18 « lite » monothread** (stockfish.js, GPL 3, ~7 Mo, NNUE intégré). La version complète pèse 113 Mo, trop lourde pour l'iPad et le cache hors ligne. La version multithread exige COOP/COEP, absents de GitHub Pages et de l'hébergement claude.ai ; elle sera ajoutée avec un hébergeur qui envoie ces en-têtes (Netlify, Cloudflare Pages).
- **Reproductibilité** : chaque position commence par `ucinewgame` (table de hachage vidée). Le résultat ne dépend que de la position et de la profondeur. Mesuré : garder la table entre positions était plus lent (51 s contre 38 s), donc aucun coût.
- **Profondeurs** : Rapide 14, **Standard 16** (au lieu de 18), Approfondie 20 (au lieu de 22). Mesures sur le moteur lite, MultiPV 2 : p14 ≈ 0,2 s, p16 ≈ 0,5 s, p18 ≈ 1 s, p22 ≈ 4,5 s par position. Avec p18, une partie de 40 coups prenait environ 90 s, au-delà de l'objectif de 60 s. Constantes dans `src/analysis/config.ts`.
- **Cache** des évaluations dans IndexedDB, clé = FEN (4 premiers champs) + profondeur + MultiPV.

## Formules et classification (`src/analysis/`)
- Formules de la section 3 appliquées telles quelles. Moyenne harmonique : une précision de coup est comptée au minimum à 1 pour éviter la division par zéro.
- **Brillant / « déjà gagné d'avance »** : si l'on prend W avant le coup lui-même, un sacrifice de dame qui mate est toujours « déjà gagné » (le moteur voit le mat, W = 100 %), ce qui contredit le critère d'acceptation. Les seuils W < 90 % et éval. < +5 sont donc mesurés **avant le coup adverse précédent**, c'est-à-dire avant que l'occasion n'apparaisse.
- **Sacrifice réel** : après le coup, meilleur échange (SEE simulé avec les coups légaux de chess.js) qu'a l'adversaire sur une pièce du joueur, moins ce que le coup a capturé. Sacrifice si la perte nette ≥ 2 pions. « Non perdant après le coup » = W après ≥ 45 %.
- **Occasion manquée** : coup adverse précédent = Erreur ou Gaffe, le joueur n'a pas joué le meilleur coup, il perd au moins 15 points par rapport à ce meilleur coup, et il ne finit pas plus de 5 points sous sa situation d'avant l'erreur adverse (« sans gaffer »).
- **Position totalement gagnée** (W > 97 % avant et après) : le coup est classé au pire Excellent.
- **Phases** : finale si ≤ 6 pièces (hors rois et pions) ; milieu de partie si ≤ 10 pièces ou si une rangée de fond compte moins de 4 pièces. Précision par phase = moyenne simple des coups.
- **Performance estimée** : table précision → Elo interpolée, corrigée selon la cadence (bullet +200 … classique −100). Approximation affichée comme telle.
- **Livre d'ouvertures** : lichess-org/chess-openings (CC0), 3 865 lignes, 7 982 positions, précompilées en clés de hachage (`npm run build` régénère `book.json`).

## Import
- Notation française détectée automatiquement (présence de D, T, F ou C comme pièce) ; chaque coup est aussi essayé dans l'autre notation.
- Encodage : UTF-8 strict, sinon Windows-1252 (sur-ensemble de Latin-1).
- **Chess960** : chess.js ne gère pas le roque 960. Les parties 960 sans roque s'importent ; un roque 960 est signalé comme coup illisible.
- **Tests sur PGN réels** : l'environnement de développement n'avait pas accès à chess.com ni à Lichess. Les tests utilisent des fixtures écrites au format exact de ces exports et 500 parties générées au format chess.com. À compléter avec 50 exports réels.

## Échiquier et pièces
- Échiquier maison en SVG. Pièces « cburnett » (Colin M. L. Burnett, GPL 2+ / CC BY-SA 3.0 / BSD), extraites de chessground (GPL 3). Licence de l'app : GPL 3 (imposée par Stockfish).

## Tests de bout en bout
- WebKit n'est pas installé dans l'environnement de développement : le parcours (import, revue, graphique, thème, PGN fautif, téléphone sans débordement) a été joué avec Chromium aux tailles iPad 1180 × 820, 820 × 1180 et 375 × 812.

## Palier P1
- **Nom** : l'app s'appelle Sharp Eye (choix d'Antoine). Nouvelle icône : un œil dont la pupille est un pion.
- **12 thèmes** : tokens CSS dans `src/themes/themes.css` ; contraste WCAG AA (texte, texte secondaire, bouton d'accent) vérifié par `tests/themes.test.ts`. Néon : pièces soulignées d'un halo cyan, sinon les pièces noires disparaissent sur les cases sombres imposées. Jeux de pièces pixelisés (Rétro) et sons par thème : reportés.
- **Explications** : règles déterministes (`src/analysis/explain.ts`) sur la position et les lignes du moteur, sans modèle de langue. Quand aucun motif n'est reconnu, une phrase générique est affichée.
- **Import par lien chess.com** : chess.com n'a pas d'API publique par identifiant de partie ; l'app propose l'import par pseudo ou le collage du PGN. Les liens Lichess sont récupérés directement.
- **Import par pseudo** : appels directs aux API publiques (CORS ouvert). Bloqués dans l'aperçu claude.ai (politique de sécurité du cadre), fonctionnels une fois l'app hébergée.
- **Export PGN annoté** : chaque commentaire porte `[%se …]` (lignes du moteur, 8 demi-coups au plus). Réimporté, le PGN redonne exactement la même revue sans moteur (test automatique). Les lignes sont aussi limitées à 8 demi-coups dans la revue elle-même pour garantir l'égalité.
- **Mode Explorer** : touche une pièce puis une case. La variante reste en mémoire le temps de l'exploration ; l'enregistrer dans l'arbre de la partie viendra avec le mode étude (P2).
- **Partage** : feuille de partage iPad (Web Share API) si disponible, sinon téléchargement. Les deux sont bloqués dans l'aperçu claude.ai.

## Palier P2

- **Puzzles personnels** : chaque gaffe, erreur et occasion manquée des camps de l'utilisateur (pseudos des Réglages, sinon les deux camps) devient un puzzle. La solution est la ligne principale du moteur gardée dans l'analyse. Révision espacée simple : 1, 3, 7 puis 21 jours après une réussite, lendemain après un échec. Classement Glicko-1 avec un RD fixe de 80 pour le puzzle ; difficulté estimée par la perte de % de gain (une gaffe énorme est souvent plus facile à voir).
- **Progrès** : précision par cadence et par phase, taux de chaque type de coup, répertoire en arbre (8 demi-coups) et faiblesses par thème tactique. Sans pseudo, l'app prend le nom le plus fréquent de la bibliothèque s'il apparaît au moins deux fois.
- **Devine le coup** : 3 points pour le meilleur coup du moteur, sinon le coup proposé est évalué à profondeur 12 (2 points si la perte est de 2 % ou moins, 1 point jusqu'à 5 %).
- **Rejouer contre le moteur** : `UCI_LimitStrength` / `UCI_Elo` à partir de 1320 Elo (minimum de Stockfish), `Skill Level` en dessous ; un second worker est utilisé pour ne pas bloquer la revue.
- **Sauvegarde JSON** : parties, analyses, puzzles, classement et réglages ; le cache des évaluations est exclu (il se recalcule). Restaurer fusionne au lieu d'effacer.
- **Reportés** : mode étude (chapitres annotés) et export PDF/GIF. L'export PGN annoté et l'image de la position couvrent le partage pour l'instant.

## Palier P3

- **Narration** : synthèse vocale du système (Web Speech API, voix française de l'iPad), sans service externe. Le coup est lu en toutes lettres (« Cavalier prend f7, échec »), puis l'étiquette et l'explication. Pendant la lecture automatique, le coup suivant attend la fin de la phrase.
- **Mode présentation** : plein écran quand le navigateur le permet (Safari iPad : seulement en partie), sinon la barre du haut est masquée. Seul le commentaire du coup reste à côté de l'échiquier agrandi.
- **Vue 3D** : perspective calculée dans le SVG (projection de chaque case, pièces debout avec ombre) plutôt qu'une rotation CSS 3D, qui rendait l'échiquier flou. Disponible dans la revue ; toucher une case fonctionne aussi en 3D. Les badges d'étiquette et l'animation des pièces restent propres à la vue 2D.
- **Défi du jour** : un puzzle choisi de façon stable pour la journée parmi la moitié la plus difficile des puzzles de l'utilisateur (au moins 10 candidats). Pas de serveur, donc pas de défi commun à tous les joueurs.
- **Badges** : 14 badges calculés à partir des données locales (aucun stockage dédié), avec barre d'avancement.
- **Bilan du mois** : parties, résultat, précision comparée au mois précédent, gaffes par partie, meilleure partie et ouverture la plus jouée.
- **Position depuis une image** : vision classique, sans modèle embarqué ni réseau. La grille est trouvée par les bords réguliers des 9 lignes, puis validée par l'alternance clair/foncé des cases (un cadre décalé d'une case est rejeté). Chaque case est séparée de son fond (couleur du pourtour), les coordonnées imprimées dans les coins sont écartées, la couleur est lue au centre de la pièce et le type par comparaison de silhouettes avec le jeu cburnett (celui de Lichess). Sur les captures de test (les 12 thèmes, plein écran ou échiquier seul, Retina, JPEG qualité 60), 30 positions sur 32 sont lues sans erreur ; les 2 échecs viennent du thème Néon, dont le halo déforme les silhouettes. Les jeux de pièces très différents (chess.com « neo ») et les photos d'un vrai échiquier ne sont pas fiables : l'éditeur signale les cases douteuses et permet de tout corriger. Trait au choix, roques déduits de la place des rois et des tours.
- **Reportés** : reconnaissance sur photo d'un vrai échiquier (demande un modèle de vision embarqué de plusieurs Mo) et empaquetage Capacitor pour l'App Store (demande Xcode et un compte Apple Developer). La PWA installée depuis Safari couvre l'usage hors ligne en attendant.

## Refonte, palier P0

- **Principe « un écran, une tâche »** : 4 onglets (Parties, Entraînement, Progrès, Profil). La revue s'ouvre en plein écran par-dessus la bibliothèque et se ferme avec « Parties ».
- **Revue en 3 étapes** : Aperçu (précisions, graphique, nombre de coups par étiquette, détails repliés), Coup par coup (échiquier et fiche du coup), puis la feuille Approfondir (lignes du moteur, Explorer, liste des coups, temps, chiffres). En paysage, la feuille s'ouvre sur le côté sans voile pour que l'échiquier reste utilisable.
- **Compte des contrôles** : la règle « 7 contrôles au plus hors de l'échiquier » compte ce qui est hors de la zone échiquier ; la barre d'évaluation et le petit graphique en font partie. Par défaut : Retour, « … », Approfondir, coup précédent, lecture, coup suivant, erreur suivante. La liste des coups est à 2 touches (Approfondir → Coups). Le chiffre de la barre d'évaluation, trop étroite à 12 px, est masqué : l'évaluation reste dans la fiche du coup.
- **Moments clés** : le bouton mène à la première erreur, gaffe ou occasion manquée de la partie ; sans aucune, il devient « Revoir la partie ».
- **Compte chess.com** : pseudo seul, vérifié sur `api.chess.com/pub/player/{u}`. Synchro complète du mois le plus récent au plus ancien, requêtes une par une avec reprise sur 429. Les mois passés déjà lus en entier ne sont plus relus. Doublons détectés par lien ou par la suite de coups, y compris avec les PGN collés à la main. La date d'import d'une partie synchronisée est sa date de fin chez chess.com, pour que la bibliothèque reste dans l'ordre des parties jouées. Aucun appel au moteur pendant la synchro (testé).
- **Analyse** : ouvrir une partie lance son analyse, la quitter la met en pause (l'analyse en lot aussi, puis elle reprend), la rouvrir repart du cache. « Analyser toutes les parties » propose 3 niveaux avec une durée estimée d'après la vitesse mesurée sur l'appareil.
- **Transparence** : chaque coup affiche profondeur, temps de calcul et nombre de lignes. « Analyser ce coup plus profondément » relance la position avant et après le coup à profondeur 24 avec 2 lignes au moins.
- **Vérifications** : `scripts/acceptance-p0.cjs` (plateau ≥ 60 % de la largeur à 1180×820, contrôles, moments clés, reprise du cache, onglets, aide à 2 touches) ; aucun défilement horizontal à 1180×820, 820×1180 et 375×812.

## Retours après P0

- **Tailles réglables** : Réglages → Revue propose « Taille des flèches de navigation » et « Taille du graphique d’évaluation » (Normale, Grande, Très grande : boutons de 44, 60 ou 76 px, graphique de 36, 72 ou 120 px). L’échiquier rétrécit d’autant : en paysage 1180×820 avec le graphique très grand, il occupe 53 % de la largeur au lieu de 60 %, un choix assumé par l’utilisateur.
- **Analyser les N dernières parties** : la feuille d’analyse groupée propose 10, 50, 100, 200, 300 dernières, toutes, ou un nombre exact. Les N parties les plus récentes de la liste (filtres appliqués) sont retenues, celles déjà analysées sont ignorées et comptées à part. La durée estimée est affichée pour chaque niveau et sur le bouton de lancement.

## Corrections, palier P0

- **Plein écran** : l’état « présentation » suit `fullscreenchange` (et `webkitfullscreenchange` pour Safari). Quand le navigateur n’offre pas de vrai plein écran (iPhone, app installée sur l’écran d’accueil), le mode reste « plein écran dans la page » : la vue passe en position fixe par-dessus tout. Les bandeaux joueurs et le petit graphique sont masqués pour que l’échiquier occupe au moins 85 % de la plus petite dimension ; le commentaire et les flèches restent, pour pouvoir avancer au toucher sans clavier.
- **Menu « … »** : grille à 3 colonnes fixes dans chaque ligne ; la taille des lignes et du texte suit le réglage « Taille des flèches ». Sur iPad en paysage, panneau ancré sous le bouton (position mesurée au toucher), voile léger ; ailleurs, feuille du bas limitée à 85 % de la hauteur.
- **Narration** : la phrase d’un coup est lue une fois par passage, avec l’analyse connue à ce moment-là (une analyse qui arrive après n’est pas relue). Une attente de 250 ms avant de parler évite de lire les positions traversées en avançant vite. En lecture automatique, c’est la fin de la phrase qui déclenche le coup suivant. Vérifié avec une synthèse vocale simulée dans `scripts/acceptance-corrections.cjs`.

## Corrections, palier P1 (la voix)

- **Narration sans numéro** : « [coup]. [classement]. [raison courte] ». Les coups à revoir et les coups brillants, clés ou excellents ont une raison ; les autres ne sont pas commentés à l’oral. Réglage « Lire aussi le coup joué ».
- **Explications** : une phrase sur ce que le coup concède (pièce en prise, fourchette, clouage, mat, matériel en mots simples, abri du roi, roi resté au centre, développement retardé, recul passif ; à défaut, l’ampleur : « l’avantage passe à l’adversaire », « la partie reste égale »), puis le meilleur coup avec ce qu’il fait. Le meilleur coup est écrit en notation française (R D T F C) dans le texte stocké, quelle que soit la notation choisie : l’explication est une phrase, pas un coup à afficher. Deux formes stockées : `explanation` (2 phrases) et `spokenExplanation` (15 mots au plus). `EXPLAIN_VERSION` : une revue enregistrée avec des règles plus anciennes est reconstruite à l’ouverture depuis ses évaluations, sans relancer le moteur.
- **Mesure** : sur les parties de `tests/fixtures` et 4 parties générées (profondeur 10), aucun coup à revoir ne retombe sur les deux anciennes phrases vagues, et tous nomment le meilleur coup.
- **Voix** : relue à chaque phrase (Safari charge ses voix en retard) ; liste mise à jour sur `voiceschanged`. Voix françaises triées France, Canada, Belgique, Suisse ; autres langues repliées. Voix disparue : première voix française et message dans les Réglages. Dans le menu « … », « Voix » passe d’une voix française à la suivante et la fait entendre.
- **Durée d’analyse** : la revue reconstruit l’analyse après chaque position ; les explications sont désormais mémorisées, donc seules celles du nouveau coup sont calculées. Mesure (Node, profondeur 12, même partie, moteur chaud) : 2,7 s contre 5,3 s avant ce palier ; la reconstruction complète d’une partie de 60 demi-coups passe de 484 ms à 144 ms.

## Corrections, palier P2 (entraînement)

- **Accueil** : quatre sections dans l’ordre du prompt (À faire aujourd’hui, Défis par thème, Sur mes parties, Ma progression). Sur iPad en paysage, « À faire » et « Ma progression » côte à côte, les deux autres en pleine largeur ; une colonne ailleurs. Chaque exercice démarre en 2 touches depuis la barre d’onglets (Entraînement, puis la tuile ou « Commencer »). Sans partie analysée, les défis de la banque restent proposés, avec « Analyser une partie ». Le lien « S’entraîner » de Progrès ouvre directement les défis du thème.
- **Défis en plusieurs coups** (`src/features/puzzles/challenge.ts`) : la combinaison compte 2 à 5 coups du joueur, finit toujours sur un coup du joueur, et s’arrête au mat ou dès que 2 pions de matériel au moins tiennent après la réponse adverse (à partir du 2e coup). Un coup différent est jugé par le moteur (profondeur 12) : accepté à 0,3 pion près ou s’il mate aussi vite, et la suite est alors recalculée ; sinon la meilleure réponse est jouée et `whyItFails` donne la raison en une phrase.
- **Premier coup unique** : une position est écartée si le 2e choix du moteur mate aussi, garde 65 % de chances de gain ou plus, ou reste à moins de 15 points du premier. Les anciens puzzles ambigus sont gardés (historique) mais plus proposés.
- **Anciens puzzles** : convertis à l’ouverture de l’onglet (`migratePuzzles`) en gardant échéance, étape, essais et réussites ; la combinaison est coupée dans la suite du moteur déjà stockée. Pas de changement de schéma Dexie : les champs ajoutés (`version`, `line`, `goal`, `gain`, `ambiguous`) ne sont pas indexés. Un ancien puzzle trop court est rallongé par le moteur au moment de le jouer.
- **Banque intégrée** : la base de puzzles de Lichess (CC0) n’est pas joignable depuis l’environnement de construction (réseau bloqué). La banque est donc générée par `scripts/build-puzzles.ts` : parties du moteur avec erreurs volontaires depuis les ouvertures de `data/*.tsv`, puis tri strict (premier coup unique, 2 à 5 coups, gain acquis). `scripts/assemble-bank.ts` vérifie chaque ligne, retire les doublons et écrit `bank.json`, chargé à part (hors ligne, mis en cache par le service worker). Remplaçable plus tard par un extrait de la base Lichess sans changer le format.
- **Défis de la banque** : enregistrés dans la table `puzzles` (étiquette `bank`) à la première tentative, pour partager la révision espacée et le classement. Ils sont exclus des « faiblesses tactiques » de Progrès, qui ne parlent que de tes parties.
- **Points et niveau** : 3 points moins un par indice et par erreur. Réussite = aucune erreur et solution non affichée (les indices coûtent des points, pas la réussite). Niveau adaptatif dans `kv.challengeLevel` : 3 réussites de suite = +150, 2 échecs de suite = −150 (600 à 2600). Journal des 500 derniers défis dans `kv.challengeLog` pour les réussites de la semaine.
- **« Pourquoi c’est le meilleur »** : la combinaison (but et idée clé), ton coup de la partie et la tentative naturelle (prise ou échec de préférence parmi les autres choix du moteur), chacune rejouable avec flèches et une phrase de 15 mots au plus. Calcul fait à la fin du défi, à profondeur 12.

## Corrections, palier P3 (théorie)

- **Contenu** : 16 ouvertures rédigées dans `src/features/theory/openings.ts` (ligne principale, 2 à 4 variantes, 6 coups clés commentés au moins, 15 mots au plus par phrase). Les lignes sont vérifiées par `tests/theory.test.ts` (coups légaux, nombre de variantes, longueur des phrases, recherche).
- **Suites possibles** : `scripts/build-theory.ts` lit `data/*.tsv` (base ouverte lichess-org/chess-openings, CC0) et garde, pour chaque position de ces 16 ouvertures, les 6 suites qui reviennent dans le plus de lignes répertoriées ; l’écran en montre 4. Faute d’accès à l’explorateur de Lichess (réseau bloqué, et l’app reste hors ligne), la « popularité » est ce nombre de lignes, pas un nombre de parties. Le coup de la ligne étudiée est toujours proposé, même s’il est rare. Noms des variantes traduits par `names.ts` (famille, puis « variante X », « défense X »…).
- **Poids** : `tree.json` fait 284 Ko (66 Ko compressé), chargé à part au premier affichage de l’onglet ; avec le contenu rédigé, moins de 320 Ko ajoutés.
- **Mes parties** : une partie appartient à une ouverture par son code ECO ou son nom (base Lichess). La bibliothèque reçoit un filtre « Ouverture » qu’un toucher sur « Tout afficher » ou un changement d’onglet retire.
- **Barre d’onglets** : 5 entrées ; sous 480 px, libellés à 10,5 px sur une ligne, vérifiés sans coupure à 390 px.

## Corrections, palier P4 (revue)

- **Ouverture en tête des commentaires** : `openingsByPly` donne, pour chaque demi-coup avant le 30e, la dernière ouverture nommée de la base Lichess (la plus précise : « Caro-Kann, attaque Hillbilly (B10) », « Gambit viennois »). Le détail du coup l’affiche en première ligne tant que la partie suit la théorie, puis « Sortie de la théorie : … » au premier coup hors livre. La narration la lit quand le nom change, pas à chaque coup.
- **Exploration évaluée** : chaque coup essayé est analysé à profondeur 14 (2 lignes), l’un après l’autre sur le moteur unique, et classé avec les mêmes règles que la partie (`judgeTried` → `classifyMove`). Le panneau montre l’éval avant → après, le meilleur coup, la suite du moteur et la comparaison avec le coup joué dans la partie.
- **Rien n’est écrit** : les essais et leurs évals restent en mémoire et disparaissent en revenant à la partie. Aucun appel à la base ; l’acceptation compare un instantané d’IndexedDB avant et après exploration et rechargement.

## Menu (P5)

- **Barre d'onglets** : sur iPad (plus de 640 px), barre flottante arrondie, centrée, avec ombre et flou d'arrière-plan ; l'onglet actif est une pastille pleine couleur d'accent (icône + libellé côte à côte), les autres restent discrets. Sur téléphone, la barre reste pleine largeur et l'onglet actif est marqué par une pastille teintée derrière l'icône.
- **Taille** : la barre suit le réglage « Taille des flèches » (Grande et Très grande : boutons de 60 px, libellés 17 px). Les couleurs viennent du thème (`--accent`, `--surface`) via `color-mix`, donc chaque thème garde sa barre.
