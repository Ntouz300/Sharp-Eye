/** Noms des variantes de la base Lichess (en anglais) rendus en français pour l'onglet Théorie. */
const FAMILIES: [RegExp, string][] = [
  [/^Vienna Game/, 'Partie viennoise'],
  [/^Vienna Gambit/, 'Gambit viennois'],
  [/^Scotch Game/, 'Partie écossaise'],
  [/^Italian Game/, 'Partie italienne'],
  [/^Ruy Lopez/, 'Partie espagnole'],
  [/^Queen's Pawn Game: London System|^Indian Defense: (Accelerated )?London System|^London System/, 'Système de Londres'],
  [/^Caro-Kann Defense/, 'Caro-Kann'],
  [/^Sicilian Defense/, 'Sicilienne'],
  [/^French Defense/, 'Française'],
  [/^Scandinavian Defense/, 'Scandinave'],
  [/^Pirc Defense/, 'Pirc'],
  [/^Queen's Gambit Accepted/, 'Gambit dame accepté'],
  [/^Queen's Gambit Declined/, 'Gambit dame refusé'],
  [/^Semi-Slav Defense/, 'Semi-slave'],
  [/^Slav Defense/, 'Slave'],
  [/^King's Indian Defense/, 'Est-indienne'],
  [/^Nimzo-Indian Defense/, 'Nimzo-indienne'],
  [/^Dutch Defense/, 'Hollandaise'],
];

// « Falkbeer Variation » → « variante Falkbeer » : en français, le nom suit le mot.
const SUFFIXES: [RegExp, string][] = [
  [/^(.+) Variation$/, 'variante $1'],
  [/^(.+) Defense$/, 'défense $1'],
  [/^(.+) Attack$/, 'attaque $1'],
  [/^(.+) Gambit$/, 'gambit $1'],
  [/^(.+) Countergambit$/, 'contre-gambit $1'],
  [/^(.+) System$/, 'système $1'],
  [/^(.+) Line$/, 'ligne $1'],
];

const WORDS: [RegExp, string][] = [
  [/\bEnglish Attack\b/g, 'attaque anglaise'],
  [/\bBerlin Defense\b/g, 'défense berlinoise'],
  [/\bClosed Variations\b/g, 'variantes fermées'],
  [/\bOpen Variations\b/g, 'variantes ouvertes'],
  [/\bPositional Variation\b/g, 'variante positionnelle'],
  [/\bYugoslav Attack\b/g, 'attaque yougoslave'],
  [/\bAustrian Attack\b/g, 'attaque autrichienne'],
  [/\bFour Pawns Attack\b/g, 'attaque des quatre pions'],
  [/\bFianchetto Variation\b/g, 'variante du fianchetto'],
  [/\bMain Line\b/g, 'ligne principale'],
  [/\bExchange Variation\b/g, 'variante d’échange'],
  [/\bAdvance Variation\b/g, 'variante d’avance'],
  [/\bClassical Variation\b/g, 'variante classique'],
  [/\bModern Variation\b/g, 'variante moderne'],
  [/\bClosed Variation\b/g, 'variante fermée'],
  [/\bOpen Variation\b/g, 'variante ouverte'],
  [/\bAccepted\b/g, 'accepté'],
  [/\bDeclined\b/g, 'refusé'],
  [/\bDefense\b/g, 'défense'],
  [/\bAttack\b/g, 'attaque'],
  [/\bVariation\b/g, 'variante'],
  [/\bSystem\b/g, 'système'],
  [/\bGambit\b/g, 'gambit'],
];

export function frenchName(name: string): string {
  const fam: [RegExp, string] | undefined = FAMILIES.find(([re]) => re.test(name)) ?? (name.includes(':') ? ([/./, name.slice(0, name.indexOf(':'))] as [RegExp, string]) : undefined);
  if (!fam) {
    // Famille sans traduction : « Philidor Defense » → « Défense Philidor ».
    const suffix = SUFFIXES.find(([re]) => re.test(name));
    const out = suffix ? name.replace(suffix[0], suffix[1]) : name;
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  const sep = name.includes(':') ? name.indexOf(':') : fam[0].test(name) && name.includes(', ') ? name.indexOf(',') : -1;
  const rest = sep >= 0 ? name.slice(sep + 1).trim() : '';
  const sub = rest
    .split(', ')
    .map((part) => {
      for (const [re, fr] of WORDS) if (re.source.includes(' ') && re.test(part)) return part.replace(re, fr);
      if (part.startsWith('with ')) return `avec ${frenchName(`X: ${part.slice(5)}`).replace(/^X : /, '')}`;
      const suffix = SUFFIXES.find(([re]) => re.test(part));
      let out = suffix ? part.replace(suffix[0], suffix[1]) : part;
      for (const [re, fr] of WORDS) out = out.replace(re, fr);
      return out;
    })
    .join(', ');
  return sub ? `${fam[1]} : ${sub}` : fam[1];
}
