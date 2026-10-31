// Vérifications d’acceptation de la refonte P0 (Playwright). Lancer `npm run build && npx vite preview --port 4175` puis `node scripts/acceptance-p0.cjs`.
const { chromium } = require('playwright');
const fail = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC ') + m); if (!c) fail.push(m); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4175/');
  await page.getByRole('button', { name: 'Importer' }).first().click();
  await page.getByRole('button', { name: /Partie d’exemple/ }).click();
  await page.waitForSelector('.overview', { timeout: 180000 });
  ok(await page.locator('.eval-graph, svg.graph, .overview svg').count() > 0, 'Aperçu : graphique présent');
  ok(await page.getByText(/Précision|précision/).count() > 0, 'Aperçu : précisions affichées');
  const key = page.getByRole('button', { name: /Revoir les moments clés|Revoir la partie/ });
  const keyTxt = await key.textContent();
  await key.click();
  await page.waitForTimeout(500);
  const lbl = await page.locator('.move-detail').getAttribute('class');
  if (/moments/.test(keyTxt)) ok(/label-(mistake|blunder|miss)/.test(lbl || ''), 'Moments clés → première erreur ou pire (' + lbl + ')');
  else console.log('     (partie sans erreur : « Revoir la partie »)');
  const bw = await page.locator('.board-zone .board').first().boundingBox();
  ok(bw.width >= 0.6 * 1180 * 0.95 || bw.width / 1180 >= 0.6, `Plateau ${Math.round(bw.width)} px = ${(bw.width / 1180 * 100).toFixed(0)} % de la largeur`);
  const n = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.rv button, .rv select, .rv input, .rv a, .rv [role=button], .rv summary')];
    return els.filter(e => !e.closest('.board-zone') && e.offsetParent !== null).map(e => e.getAttribute('aria-label') || e.textContent.trim());
  });
  ok(n.length <= 7, `Contrôles hors plateau : ${n.length} (${n.join(' | ')})`);
  await page.getByRole('button', { name: /Approfondir/ }).click();
  await page.waitForTimeout(800);
  ok(await page.getByTestId('engine-facts').count() > 0, 'Approfondir : profondeur, temps, lignes affichés');
  ok(await page.getByRole('button', { name: /profondeur 24/ }).count() > 0, 'Bouton « Analyser plus profondément » (24)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Retour : Parties/ }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.rv').count() === 0, 'Retour : la revue se ferme');
  await page.locator('.game-card').first().click();
  await page.waitForTimeout(800);
  ok(await page.locator('.overview').count() === 1, 'Réouverture : analyse reprise du cache (aperçu direct)');
  await page.getByRole('button', { name: /Retour : Parties/ }).click();
  for (const t of ['Entraînement', 'Progrès', 'Profil', 'Parties']) {
    await page.getByRole('button', { name: t, exact: true }).click();
    await page.waitForTimeout(200);
    ok(await page.locator(`.tab-btn.active[aria-label="${t}"]`).count() === 1, 'Onglet ' + t);
  }
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByText('Aide').first().click();
  await page.waitForTimeout(300);
  ok(await page.locator('#ecarts-chesscom').count() === 1, 'Aide : section écart avec chess.com (2 touches)');
  await browser.close();
  console.log(fail.length ? fail.length + ' échec(s)' : 'Tout passe');
  process.exit(fail.length ? 1 : 0);
})();
