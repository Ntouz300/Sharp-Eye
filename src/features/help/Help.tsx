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
      <section className="settings-card">
        <h2>Raccourcis clavier</h2>
        <p>← → : coup précédent / suivant · ↑ ↓ : début / fin · F : retourner l’échiquier · Espace : lecture automatique.</p>
        <p>Sur l’échiquier ou la liste des coups, glisse le doigt horizontalement pour avancer ou reculer.</p>
      </section>
      <section className="settings-card">
        <h2>À propos</h2>
        <p className="small muted">
          Échiquier Lucide est un logiciel libre (GPL 3). Moteur : Stockfish 18 (GPL 3) via stockfish.js. Pièces : jeu « cburnett » de Colin M. L. Burnett
          (GPL 2+ / CC BY-SA 3.0 / BSD). Ouvertures : lichess-org/chess-openings (CC0). Toutes tes parties restent sur ton appareil.
        </p>
      </section>
    </div>
  );
}
