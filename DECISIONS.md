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
