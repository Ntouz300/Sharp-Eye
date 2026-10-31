# Sharp Eye

Revue de parties d'échecs pensée pour l'iPad : importe une partie (PGN chess.com ou Lichess, liste de coups, FEN), et obtiens en moins d'une minute la précision de chaque joueur, l'étiquette de chaque coup, les moments décisifs et le meilleur coup à chaque erreur. Tout est calculé sur l'appareil par Stockfish 18 (WebAssembly) ; les parties restent dans le navigateur (IndexedDB).

## Installation et lancement

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests unitaires (PGN, Win %, précision, classification, thèmes, Stockfish)
npm run build      # construit dist/ (PWA hors ligne)
npm run preview    # sert dist/ en local
```

## Déploiement

`dist/` est un site statique : GitHub Pages, Netlify ou Cloudflare Pages. Les chemins sont relatifs, l'app fonctionne aussi dans un sous-dossier.

## Installer sur iPad en 3 étapes

1. Ouvre l'adresse de l'app dans **Safari**.
2. Touche le bouton **Partager** (carré avec une flèche vers le haut).
3. Choisis **Sur l'écran d'accueil**, puis **Ajouter**. L'app s'ouvre en plein écran et fonctionne hors ligne après la première visite.

## Organisation du code

- `src/pgn/` : analyseur PGN (variantes, commentaires, NAG, `%clk`, `%eval`, `%csl`, `%cal`, notation française, Latin-1)
- `src/engine/` : Stockfish dans un Web Worker, protocole UCI
- `src/analysis/` : Win %, précision, classification (seuils dans `config.ts`), livre d'ouvertures, phases
- `src/board/` : échiquier SVG
- `src/themes/` : thèmes (variables CSS)
- `src/features/` : bibliothèque, revue, réglages, aide
- `src/storage/` : IndexedDB (Dexie), schéma versionné

Les choix et écarts par rapport au cahier des charges sont dans [DECISIONS.md](DECISIONS.md).
