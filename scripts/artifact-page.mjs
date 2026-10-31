// Prépare dist/ pour une publication en page hébergée (aperçu claude.ai) :
// la page y est enveloppée automatiquement, on n'en garde donc que le contenu de <head> et <body>.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1];
const cleaned = head
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<link rel="manifest"[^>]*>\s*/i, '');
writeFileSync('dist/page.html', `${cleaned.trim()}\n${body.trim()}\n`);
console.log('dist/page.html prêt');
