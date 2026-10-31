import { LABEL_INFO, type Label } from '../../analysis/classify';
import { moveAccuracy, winPercentFromCp } from '../../analysis/winPercent';
import { LabelIcon } from '../../ui/LabelIcon';

const RULES: [Label, string][] = [
  ['book', 'Le coup figure dans le livre d’ouvertures (base ECO ouverte de Lichess, 3 865 lignes nommées).'],
  ['forced', 'C’était le seul coup légal.'],
  ['brilliant', 'Meilleur coup (ou presque) qui sacrifie réellement du matériel, alors que la position n’était pas déjà gagnée et ne devient pas perdante. Jamais une simple recapture.'],
  ['great', 'Seul bon coup : le 2e choix du moteur perdait au moins 10 points de chances de gain.'],
  ['best', 'Premier choix du moteur.'],
  ['miss', 'L’adversaire venait de se tromper, un coup gagnant (15 points ou plus) existait, et il n’a pas été joué.'],
  ['excellent', 'Perte de 2 points de chances de gain au plus.'],
  ['good', 'Perte de 5 points au plus.'],
  ['inaccuracy', 'Perte de 10 points au plus.'],
  ['mistake', 'Perte de 20 points au plus.'],
  ['blunder', 'Perte de plus de 20 points.'],
];

export function Help() {
  const w0 = winPercentFromCp(120);
  const w1 = winPercentFromCp(-80);
  const acc = moveAccuracy(w0, w1);
  return (
    <div className="help">
      <section className="settings-card">
        <h2>Comment la revue est calculée</h2>
        <p>
          Chaque position est évaluée par Stockfish 18 à profondeur fixe. L’évaluation en centipions (cp), bornée entre −1000 et +1000, est convertie en
          chances de gain (Win %) pour le joueur au trait :
        </p>
        <pre className="formula">W = 50 + 50 × (2 / (1 + e^(−0,00368208 × cp)) − 1)</pre>
        <p>Un mat forcé vaut 100 %. La précision d’un coup dépend de la perte de chances de gain ΔW = W avant − W après :</p>
        <pre className="formula">Précision = 103,1668 × e^(−0,04354 × ΔW) − 3,1669   (bornée entre 0 et 100)</pre>
        <p>
          <strong>Exemple chiffré.</strong> Avant ton coup, la position vaut +1,2 pour toi : W = {w0.toFixed(1).replace('.', ',')} %. Après ton coup, elle
          vaut −0,8 : W = {w1.toFixed(1).replace('.', ',')} %. Tu perds ΔW = {(w0 - w1).toFixed(1).replace('.', ',')} points, la précision du coup est de{' '}
          {acc.toFixed(1).replace('.', ',')} % et le coup est classé {(w0 - w1) > 20 ? 'Gaffe' : 'Erreur'}.
        </p>
        <p>
          La précision de la partie est la moyenne de deux valeurs : la moyenne des précisions des coups pondérée par la volatilité de la position (écart
          type du Win % sur une fenêtre glissante, borné entre 0,5 et 12), et leur moyenne harmonique, qui pénalise fortement les gaffes.
        </p>
        <p>La performance estimée est une approximation déduite de la précision et de la cadence ; ce n’est pas un classement officiel.</p>
      </section>
      <section className="settings-card">
        <h2>Étiquettes des coups</h2>
        <p className="muted">Les règles sont appliquées dans cet ordre : la première qui s’applique gagne.</p>
        <ul className="rules">
          {RULES.map(([label, text]) => (
            <li key={label}>
              <LabelIcon label={label} size={22} />
              <div>
                <strong>{LABEL_INFO[label].name}</strong> <span className="muted">({LABEL_INFO[label].symbol})</span>
                <br />
                {text}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-card" id="ecarts-chesscom">
        <h2>Pourquoi mes résultats diffèrent de chess.com</h2>
        <p>C’est le même moteur, Stockfish, mais il ne travaille pas dans les mêmes conditions, et les étiquettes ne suivent pas les mêmes règles.</p>
        <ul className="month-notes">
          <li><strong>Moins de calcul.</strong> Sharp Eye calcule sur ton iPad, avec un seul cœur et une profondeur fixe (14, 16 ou 20 selon le niveau). chess.com calcule sur ses serveurs, plus longtemps. Une tactique en plusieurs coups peut donc nous échapper en Rapide ou en Standard.</li>
          <li><strong>Un réseau plus léger.</strong> La version de Stockfish qui tient dans une app web utilise un réseau neuronal réduit : l’évaluation est un peu moins fine dans les positions calmes.</li>
          <li><strong>Pas de tables de finales.</strong> Certaines finales simples peuvent être mal jugées.</li>
          <li><strong>Une autre formule de précision.</strong> Sharp Eye utilise une formule publique (celle de Lichess). chess.com a la sienne, non publiée : l’écart est de quelques points, dans un sens ou dans l’autre.</li>
          <li><strong>D’autres seuils d’étiquettes.</strong> Nos étiquettes dépendent de la perte de chances de gain (2, 5, 10 et 20 points). chess.com tient aussi compte du niveau des joueurs et a sa propre définition de « Brillant » : tu verras chez nous moins de coups brillants.</li>
        </ul>
        <p>Pour te rapprocher de chess.com, choisis le niveau Approfondie, ou touche « Analyser ce coup plus profondément » dans Approfondir : le coup est recalculé à profondeur 24. Le détail de chaque coup indique la profondeur, le temps et le nombre de lignes utilisés.</p>
      </section>
      <section className="settings-card">
        <h2>Synchronisation chess.com</h2>
        <p>Relie ton pseudo dans Profil. Les parties arrivent à l’ouverture de l’app et à chaque retour dans l’app : l’iPad ne laisse pas une app web travailler en arrière-plan. Aucune analyse ne démarre seule ; elle commence quand tu ouvres une partie, ou quand tu touches « Analyser toutes les parties ».</p>
      </section>
      <section className="settings-card">
        <h2>S’entraîner</h2>
        <ul className="month-notes">
          <li><strong>L’accueil</strong> : « À faire aujourd’hui » enchaîne le défi du jour et les défis à revoir ; « Défis par thème » propose des combinaisons à ton niveau ; « Sur mes parties » reprend tes erreurs et ta dernière partie ; « Ma progression » montre ta série, tes réussites de la semaine et ton thème le plus faible.</li>
          <li><strong>Défis en plusieurs coups</strong> : la consigne dit le but (« Les blancs jouent et gagnent une pièce en 3 coups »). Tu joues, le moteur défend au mieux et chaque bon coup est expliqué. Un coup qui gagne autant (0,3 pion près, ou le même mat) est accepté. Une erreur est réfutée sur l’échiquier, expliquée en une phrase, puis tu réessaies. À la fin, « Pourquoi c’est le meilleur » compare la combinaison, ton coup de la partie et la tentative la plus naturelle, à rejouer pas à pas.</li>
          <li><strong>Points et niveau</strong> : 3 points par défi, moins un par indice (thème, puis pièce, puis case) et par erreur. 3 réussites de suite font monter le niveau proposé, 2 échecs le font baisser. Réussi sans erreur, un défi revient après 1, 3, 7 puis 21 jours ; sinon il revient le lendemain.</li>
          <li><strong>D’où viennent les défis</strong> : de tes gaffes, erreurs et occasions manquées (seulement quand le premier coup est unique), et d’une banque intégrée classée par thème, qui marche hors ligne.</li>
          <li><strong>Devine le coup</strong> : depuis la revue, l’app cache la suite et note chacun de tes coups (3 points pour le meilleur coup du moteur).</li>
          <li><strong>Rejouer contre le moteur</strong> : reprends la position affichée face à Stockfish, de 800 à 2800 Elo.</li>
          <li><strong>Progrès</strong> : précision dans le temps, bilan du mois, répertoire d’ouvertures, faiblesses tactiques et badges.</li>
          <li><strong>Position depuis une image</strong> : dans la Bibliothèque, « Position (image ou éditeur) » lit une capture d’écran d’un échiquier en 2D, puis te laisse corriger chaque case avant d’analyser la position ou de la jouer contre le moteur.</li>
          <li><strong>Narration et présentation</strong> : la narration (menu « … ») lit chaque coup une fois, avec son classement et son explication ; en lecture automatique, le coup suivant attend la fin de la phrase. « Mode présentation » agrandit l’échiquier pour montrer une partie : les flèches et la lecture marchent toujours, et on en sort par la croix, la touche Échap ou le geste du système. L’échiquier en perspective 3D s’active dans les Réglages.</li>
        </ul>
      </section>
      <section className="settings-card" id="voix">
        <h2>Voix de la narration</h2>
        <p>La narration dit le coup, son classement et une raison courte : « Cavalier f3. Imprécision. Mieux valait d4, qui prend le centre. » Le numéro du coup n’est pas lu, et les bons coups ne sont pas commentés, sauf les coups brillants, clés ou excellents.</p>
        <p>Dans Profil › Réglages › Voix de la narration, choisis la voix (françaises d’abord, autres langues repliées), écoute-la et règle sa vitesse. Le menu « … » de la revue passe aussi d’une voix française à l’autre.</p>
        <p>Pour une voix plus naturelle sur iPad : Réglages de l’iPad › Accessibilité › Contenu énoncé › Voix › Français, puis télécharge une voix « améliorée » ou « premium ». Elle apparaît ensuite dans la liste de Sharp Eye.</p>
      </section>
      <section className="settings-card">
        <h2>Raccourcis clavier</h2>
        <p>← → : coup précédent / suivant · ↑ ↓ : début / fin · F : retourner l’échiquier · Espace : lecture automatique.</p>
        <p>Sur l’échiquier ou la liste des coups, glisse le doigt horizontalement pour avancer ou reculer.</p>
      </section>
      <section className="settings-card">
        <h2>À propos</h2>
        <p className="small muted">
          Sharp Eye est un logiciel libre (GPL 3). Moteur : Stockfish 18 (GPL 3) via stockfish.js. Pièces : jeu « cburnett » de Colin M. L. Burnett
          (GPL 2+ / CC BY-SA 3.0 / BSD). Ouvertures : lichess-org/chess-openings (CC0). Banque de défis : positions générées par Sharp Eye avec Stockfish, à partir de ces ouvertures. Toutes tes parties restent sur ton appareil.
        </p>
      </section>
    </div>
  );
}
