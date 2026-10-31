// Vérifications d’acceptation du prompt « corrections, entraînement et théorie » (Playwright).
// Lancer `npm run build && npx vite preview --port 4175` puis `node scripts/acceptance-corrections.cjs`.
// SIZES=1180x820,820x1180,390x844 et NAV=normal,xl pour restreindre ; SHOTS=dossier pour les captures.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:4175/';
const SIZES = (process.env.SIZES || '1180x820,820x1180,390x844').split(',');
const NAVS = (process.env.NAV || 'normal,xl').split(',');
const SHOTS = process.env.SHOTS;
const POINTS = (process.env.POINTS || '1,2,3').split(',');
const fail = [];
const ok = (c, m) => {
  console.log((c ? 'OK    ' : 'ÉCHEC ') + m);
  if (!c) fail.push(m);
};

async function openSample(page) {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Importer' }).first().click();
  await page.getByRole('button', { name: /Partie d’exemple/ }).click();
  await page.waitForSelector('.overview', { timeout: 180000 });
  await page.getByRole('button', { name: /Coup par coup depuis/ }).click();
  await page.waitForSelector('.moves-view');
}

async function menu(page, label) {
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.locator('.menu-item', { hasText: label }).first().click();
  await page.waitForTimeout(150);
}

const state = (page) =>
  page.evaluate(() => {
    const tab = document.querySelector('.tabbar');
    const board = document.querySelector('.board-zone .board')?.getBoundingClientRect();
    return {
      presenting: !!document.querySelector('.moves-view.presenting'),
      bodyClass: document.body.classList.contains('presenting'),
      tabbarHidden: tab ? getComputedStyle(tab).display === 'none' : true,
      panelItems: [...document.querySelectorAll('.move-panel > *')].filter((e) => getComputedStyle(e).display !== 'none').length,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.scrollingElement.scrollHeight - innerHeight,
      board: board ? { w: board.width, top: board.top, bottom: board.bottom, left: board.left, right: board.right } : null,
      min: Math.min(innerWidth, innerHeight),
      W: innerWidth,
      H: innerHeight,
      exit: document.querySelector('.present-exit')?.getBoundingClientRect().toJSON?.() ?? null,
    };
  });

async function point1(page, tag) {
  const before = await state(page);
  for (let i = 0; i < 10; i++) {
    await menu(page, 'Mode présentation');
    const s = await state(page);
    if (i === 0) {
      ok(s.presenting && s.bodyClass, `${tag} P1 entrée en présentation`);
      ok(s.board && s.board.w >= 0.85 * s.min, `${tag} P1 échiquier ${Math.round(s.board?.w)} px ≥ 85 % de ${s.min}`);
      ok(s.board && s.board.top >= 0 && s.board.bottom <= s.H + 0.5 && s.board.right <= s.W + 0.5 && s.overflowX <= 0, `${tag} P1 échiquier sans débordement`);
      ok(s.exit && s.exit.width >= 44 && s.exit.height >= 44 && s.exit.top >= 0, `${tag} P1 bouton de sortie ≥ 44 px visible`);
      const ex = s.exit, b = s.board;
      ok(ex && b && (ex.bottom <= b.top || ex.left >= b.right || ex.right <= b.left || ex.top >= b.bottom), `${tag} P1 bouton de sortie ne couvre pas l’échiquier`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/p1-${tag.replace("/", "-")}.png` });
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
      const ply1 = await page.evaluate(() => document.querySelector('.move-detail')?.textContent ?? '');
      ok(/1\. ?e4/.test(ply1), `${tag} P1 flèche → avance en présentation (${ply1.slice(0, 20)})`);
      await page.keyboard.press('ArrowLeft');
    }
    // Sortie : alterne bouton ×, Échap et sortie système (fullscreenchange).
    const how = i % 3;
    if (how === 0) await page.locator('.present-exit').click();
    else if (how === 1) await page.keyboard.press('Escape');
    else
      await page.evaluate(async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
        else document.dispatchEvent(new Event('fullscreenchange'));
      });
    await page.waitForTimeout(200);
    const after = await state(page);
    const same = !after.presenting && !after.bodyClass && after.panelItems === before.panelItems && after.overflowX <= 0 && after.overflowY <= 0;
    if (!same || i === 9) ok(same, `${tag} P1 sortie n°${i + 1} (${['bouton ×', 'Échap', 'geste système'][how]}) : état d’origine ${JSON.stringify({ p: after.presenting, b: after.bodyClass, panel: `${after.panelItems}/${before.panelItems}`, oy: after.overflowY })}`);
    if (!same) break;
  }
}

async function point2(page, tag) {
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p2-${tag.replace('/', '-')}.png` });
  const m = await page.evaluate(() => {
    const sheet = document.querySelector('.menu-sheet').getBoundingClientRect();
    const more = document.querySelector('[aria-label="Plus d’actions"]').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.menu-item')].map((b) => {
      const r = b.getBoundingClientRect();
      const ic = b.querySelector('.menu-icon')?.getBoundingClientRect();
      const lb = b.querySelector('.menu-label').getBoundingClientRect();
      const en = b.querySelector('.menu-end')?.getBoundingClientRect();
      return { h: r.height, icon: ic?.left, label: lb.left, labelRight: lb.right, end: en?.right, endLeft: en?.left, text: b.textContent };
    });
    const groups = [...document.querySelectorAll('.menu-group')].map((g) => g.getBoundingClientRect());
    const gaps = groups.slice(1).map((g, i) => Math.round(g.top - groups[i].bottom));
    const body = document.querySelector('.menu-sheet .sheet-body');
    body.scrollTop = body.scrollHeight;
    const last = [...document.querySelectorAll('.menu-item')].pop().getBoundingClientRect();
    return { sheet: sheet.toJSON(), more: more.toJSON(), rows, gaps, lastBottom: last.bottom, W: innerWidth, H: innerHeight };
  });
  const same = (k) => new Set(m.rows.map((r) => Math.round(r[k]))).size === 1;
  ok(same('icon') && same('label') && same('end'), `${tag} P2 icônes, libellés et valeurs alignés en 3 colonnes`);
  ok(m.rows.every((r) => r.labelRight <= r.endLeft + 0.5 && r.end <= m.W), `${tag} P2 libellés longs sans pousser la valeur hors de l’écran`);
  ok(m.rows.every((r) => r.h >= 48), `${tag} P2 lignes ≥ 48 px (min ${Math.round(Math.min(...m.rows.map((r) => r.h)))})`);
  ok(m.gaps.every((g) => g >= 12 && g <= 16), `${tag} P2 espace entre groupes 12 à 16 px (${m.gaps.join(', ')})`);
  ok(m.sheet.height <= 0.85 * m.H + 1 && m.lastBottom <= m.sheet.bottom + 1 && m.sheet.bottom <= m.H, `${tag} P2 feuille ≤ 85 % de la hauteur, dernière ligne visible`);
  if (m.W >= 1000 && m.W > m.H) {
    ok(m.sheet.width >= 320 && m.sheet.width <= 380, `${tag} P2 panneau ancré de ${Math.round(m.sheet.width)} px`);
    ok(Math.abs(m.sheet.right - m.more.right) <= 24 && m.sheet.top >= m.more.bottom && m.sheet.top - m.more.bottom <= 24, `${tag} P2 panneau ancré sous le bouton « … »`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch();
  for (const nav of NAVS)
    for (const sz of SIZES) {
      const [w, h] = sz.split('x').map(Number);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
      await ctx.addInitScript((n) => localStorage.setItem('sharp-eye:settings', JSON.stringify({ navSize: n, graphSize: n })), nav);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => ok(false, `${sz} erreur de page : ${e.message}`));
      await openSample(page);
      const tag = `${sz}/${nav}`;
      if (POINTS.includes('1')) await point1(page, tag);
      if (POINTS.includes('2')) await point2(page, tag);
      await ctx.close();
    }
  await browser.close();
  console.log(fail.length ? `${fail.length} échec(s)` : 'Tout passe');
  process.exit(fail.length ? 1 : 0);
})();
