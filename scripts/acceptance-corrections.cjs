// Vérifications d’acceptation du prompt « corrections, entraînement et théorie » (Playwright).
// Lancer `npm run build && npx vite preview --port 4175` puis `node scripts/acceptance-corrections.cjs`.
// SIZES=1180x820,820x1180,390x844 et NAV=normal,xl pour restreindre ; SHOTS=dossier pour les captures.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:4175/';
const SIZES = (process.env.SIZES || '1180x820,820x1180,390x844').split(',');
const NAVS = (process.env.NAV || 'normal,xl').split(',');
const SHOTS = process.env.SHOTS;
const POINTS = (process.env.POINTS || '1,2,3').split(',');
const { Chess } = require('chess.js');
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

// Synthèse vocale simulée : chaque phrase dure DUR ms ; cancel() interrompt comme Safari et Chrome.
function fakeSpeech(dur) {
  window.__spoken = [];
  window.__cancels = 0;
  let cur = null;
  let timer = 0;
  class U {
    constructor(text) {
      this.text = text;
    }
  }
  window.SpeechSynthesisUtterance = U;
  const synth = {
    speaking: false,
    getVoices: () => [
      { name: 'Samantha', lang: 'en-US', voiceURI: 'en-sam', localService: true, default: false },
      { name: 'Amélie', lang: 'fr-CA', voiceURI: 'fr-amelie', localService: true, default: false },
      { name: 'Thomas', lang: 'fr-FR', voiceURI: 'fr-thomas', localService: true, default: true },
    ],
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      if (cur) return; // une seule phrase à la fois : l'app doit annuler avant
      cur = u;
      synth.speaking = true;
      window.__spoken.push(u.text);
      window.__last = { voice: u.voice?.voiceURI, rate: u.rate };
      timer = setTimeout(() => {
        cur = null;
        synth.speaking = false;
        u.onend?.({});
      }, dur);
    },
    cancel() {
      window.__cancels++;
      if (!cur) return;
      clearTimeout(timer);
      const u = cur;
      cur = null;
      synth.speaking = false;
      u.onerror?.({ error: 'interrupted' });
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
}

async function point3(browser, w, h, nav) {
  const tag = `${w}x${h}/${nav}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  await ctx.addInitScript((n) => localStorage.setItem('sharp-eye:settings', JSON.stringify({ navSize: n, graphSize: n, narration: true })), nav);
  await ctx.addInitScript(fakeSpeech, 400);
  const page = await ctx.newPage();
  const spoken = () => page.evaluate(() => window.__spoken.slice());
  await page.goto(URL);
  await page.getByRole('button', { name: 'Importer' }).first().click();
  await page.getByRole('button', { name: /Partie d’exemple/ }).click();
  await page.waitForSelector('.moves-view');
  // Analyse en cours : avancer d'un coup puis laisser l'analyse progresser.
  await page.getByRole('button', { name: 'Coup suivant' }).click();
  await page.waitForTimeout(2500);
  let s = await spoken();
  ok(s.length === 1, `${tag} P3 un coup lu une seule fois pendant que l’analyse progresse (${s.length} : ${s.join(' | ').slice(0, 120)})`);
  await page.waitForSelector('.overview, .moves-view .move-detail[class*="label-"]', { timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('.analysis-banner progress, .analysis-banner [role="progressbar"]'), null, { timeout: 180000 }).catch(() => {});
  if (await page.locator('.overview').count()) await page.getByRole('button', { name: /Coup par coup depuis/ }).click();
  await page.waitForTimeout(800);
  // Avancer vite de 5 coups : seule la dernière position est lue.
  let before = (await spoken()).length;
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(900);
  s = (await spoken()).slice(before);
  ok(s.length === 1, `${tag} P3 5 coups rapides : ${s.length} phrase(s) lue(s), attendu 1`);
  // Revenir sur un coup le relit une fois.
  before = (await spoken()).length;
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  s = (await spoken()).slice(before);
  ok(s.length === 2, `${tag} P3 revenir puis avancer : ${s.length} phrases, attendu 2`);
  // Lecture automatique depuis le début : une phrase par coup joué.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  before = (await spoken()).length;
  const plies = await page.evaluate(() => document.querySelectorAll('.deep-body .move-list [data-ply], .move-list button').length);
  await page.getByRole('button', { name: 'Lecture automatique' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Coup suivant"]')?.disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  s = (await spoken()).slice(before);
  const total = await page.evaluate(() => Number(document.querySelector('.rv-title-sub')?.textContent.match(/\d+/)?.[0] ?? 0));
  const n = await page.evaluate(async () => {
    const r = await new Promise((res) => {
      const req = indexedDB.open('sharp-eye');
      req.onsuccess = () => {
        const tx = req.result.transaction('games');
        const all = tx.objectStore('games').getAll();
        all.onsuccess = () => res(all.result[0]?.plies ?? 0);
      };
    });
    return r;
  });
  ok(s.length === n, `${tag} P3 lecture automatique : ${s.length} phrases pour ${n} coups`);
  // Couper la narration, puis quitter : la voix s'arrête.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const c0 = await page.evaluate(() => window.__cancels);
  await page.getByRole('button', { name: /Retour : Parties/ }).click();
  await page.waitForTimeout(100);
  const st = await page.evaluate(() => ({ c: window.__cancels, speaking: window.speechSynthesis.speaking }));
  ok(st.c > c0 && !st.speaking, `${tag} P3 quitter la revue arrête la voix`);
  await ctx.close();
}

async function points456(browser, w, h, nav) {
  const tag = `${w}x${h}/${nav}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  await ctx.addInitScript((n) => {
    if (!localStorage.getItem('sharp-eye:settings')) localStorage.setItem('sharp-eye:settings', JSON.stringify({ navSize: n, graphSize: n, narration: true }));
  }, nav);
  await ctx.addInitScript(fakeSpeech, 50);
  const page = await ctx.newPage();
  const spoken = () => page.evaluate(() => window.__spoken.slice());
  await openSample(page);
  // Point 4 et 5 : première imprécision ou pire.
  await page.getByRole('button', { name: 'Erreur suivante' }).click();
  await page.waitForTimeout(700);
  let s = await spoken();
  const said = s[s.length - 1] ?? '';
  ok(!/(^|\s)\d+\s*\./.test(said) && !/coup numéro/i.test(said), `${tag} P4 phrase lue sans numéro : « ${said} »`);
  ok(/^[^.]+\. (Imprécision|Erreur|Gaffe|Occasion manquée)\. (.+)\.$/.test(said), `${tag} P4 format « coup. classement. raison »`);
  const text = await page.locator('.move-detail .explanation').textContent();
  ok(/Mieux valait|Il fallait jouer/.test(text) && text.split(/(?<=\.)\s+/).length <= 2, `${tag} P5 explication concrète à l’écran : « ${text} »`);
  const reason = said.split('. ').slice(2).join('. ');
  ok(reason.split(/\s+/).length <= 15, `${tag} P5 raison lue de ${reason.split(/\s+/).length} mots (≤ 15)`);
  // Réglage « Lire aussi le coup joué » désactivé.
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('sharp-eye:settings'));
    localStorage.setItem('sharp-eye:settings', JSON.stringify({ ...st, sayMove: false }));
  });
  await page.reload();
  await page.locator('.game-card').first().click();
  await page.waitForSelector('.overview');
  await page.getByRole('button', { name: /Coup par coup depuis/ }).click();
  await page.getByRole('button', { name: 'Erreur suivante' }).click();
  await page.waitForTimeout(700);
  s = await spoken();
  ok(/^(Imprécision|Erreur|Gaffe|Occasion manquée)\. /.test(s[s.length - 1] ?? ''), `${tag} P4 sans le coup joué : « ${s[s.length - 1]} »`);
  await page.getByRole('button', { name: /Retour : Parties/ }).click();
  // Point 6 : choix de la voix.
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: /Réglages/ }).click();
  await page.waitForSelector('.voice-list');
  const names = await page.locator('.voice-list > .voice-option .voice-name').allTextContents();
  ok(names.join(',') === 'Thomas,Amélie', `${tag} P6 voix françaises d’abord, France puis Canada (${names.join(', ')})`);
  ok(!(await page.locator('.voice-list details').evaluate((d) => d.open)), `${tag} P6 « Autres langues » replié`);
  await page.locator('.voice-option', { hasText: 'Amélie' }).click();
  await page.locator('.rate-row input').fill('1.2');
  await page.getByRole('button', { name: /Écouter/ }).click();
  await page.waitForTimeout(100);
  const last = await page.evaluate(() => ({ ...window.__last, text: window.__spoken[window.__spoken.length - 1] }));
  ok(last.voice === 'fr-amelie' && Math.abs(last.rate - 1.2) < 0.001 && /Cavalier f3/.test(last.text), `${tag} P6 « Écouter » avec la voix et la vitesse choisies (${JSON.stringify(last)})`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p6-${tag.replace('/', '-')}.png`, fullPage: false });
  await page.reload();
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: /Réglages/ }).click();
  ok(await page.locator('.voice-option.active', { hasText: 'Amélie' }).count() === 1, `${tag} P6 voix retrouvée après rechargement`);
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('sharp-eye:settings'));
    localStorage.setItem('sharp-eye:settings', JSON.stringify({ ...st, voiceURI: 'voix-disparue' }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: /Réglages/ }).click();
  ok((await page.getByText(/n’est plus sur cet appareil/).count()) === 1 && (await page.locator('.voice-option.active', { hasText: 'Thomas' }).count()) === 1, `${tag} P6 voix disparue : première voix française, et message`);
  await ctx.close();
}


// ---------- Points 7 et 8 : entraînement et défis ----------

const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;

/** Ancien puzzle (format à un coup) d'une partie, déjà tenté : sert au thème faible et à la migration. */
async function seedOldPuzzle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('sharp-eye');
        req.onsuccess = () => {
          const tx = req.result.transaction('puzzles', 'readwrite');
          tx.objectStore('puzzles').put({
            id: 'g-old|4', gameId: 'g-old', moveIndex: 4, fen: 'r3k3/8/8/3N4/8/8/PP6/4K3 w - - 0 1',
            solution: ['d5c7', 'e8d7', 'c7a8', 'd7c8'], played: 'e1d2', label: 'blunder', theme: 'Fourchettes',
            rating: 1100, due: 0, stage: 1, attempts: 4, successes: 1, createdAt: 1,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

const readPuzzle = (page, id) =>
  page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open('sharp-eye');
        req.onsuccess = () => {
          const g = req.result.transaction('puzzles').objectStore('puzzles').get(id);
          g.onsuccess = () => resolve(g.result);
        };
      }),
    id,
  );

async function leaveReview(page) {
  for (let i = 0; i < 3 && (await page.getByRole('button', { name: 'Progrès', exact: true }).count()) === 0; i++) {
    await page.locator('.back-btn').first().click();
    await page.waitForTimeout(200);
  }
}

const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function point7(browser, w, h, nav) {
  const tag = `${w}x${h}/${nav}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  await ctx.addInitScript((n) => localStorage.getItem('sharp-eye:settings') || localStorage.setItem('sharp-eye:settings', JSON.stringify({ navSize: n, graphSize: n })), nav);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ok(false, `${tag} erreur de page : ${e.message}`));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Entraînement', exact: true }).click();
  await page.waitForSelector('[data-testid="themes"] .theme-tile');
  const home = await page.evaluate(() =>
    ['today', 'themes', 'games', 'progress'].map((id) => {
      const s = document.querySelector(`[data-testid="${id}"]`);
      const r = s?.getBoundingClientRect();
      return { id, title: s?.querySelector('h2')?.textContent ?? '', line: s?.querySelector('h2 + p')?.textContent ?? '', left: r?.left, top: r?.top, right: r?.right };
    }),
  );
  ok(home.every((s) => s.title && words(s.title) <= 3 && s.line), `${tag} P7 quatre sections, titres ≤ 3 mots et une ligne d’explication (${home.map((s) => s.title).join(' / ')})`);
  ok((await page.locator('.theme-tile').count()) >= 4, `${tag} P7 tuiles de thèmes sans partie analysée`);
  ok((await page.getByRole('button', { name: 'Analyser une partie' }).count()) === 1, `${tag} P7 bouton « Analyser une partie » sans partie analysée`);
  const today = home[0], prog = home[3];
  const wide = w >= 1000 && w > h;
  ok(wide ? Math.abs(today.top - prog.top) < 2 && prog.left > today.right - 1 : Math.abs(today.left - prog.left) < 2, `${tag} P7 ${wide ? '2 colonnes' : '1 colonne'}`);
  ok((await overflowX(page)) <= 0, `${tag} P7 pas de défilement horizontal`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p7-accueil-${tag.replace('/', '-')}.png`, fullPage: true });

  // 2 touches au plus : depuis Parties, Entraînement puis une tuile.
  await page.getByRole('button', { name: 'Parties', exact: true }).click();
  await page.getByRole('button', { name: 'Entraînement', exact: true }).click();
  await page.locator('.theme-tile').first().click();
  ok(await page.locator('[data-testid="challenge"]').isVisible(), `${tag} P7 un défi par thème démarre en 2 touches`);
  await page.getByRole('button', { name: '← Entraînement' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  ok((await page.locator('[data-testid="challenge"] .chip', { hasText: 'Défi du jour' }).count()) === 1, `${tag} P7 « Commencer » ouvre le défi du jour`);
  await page.getByRole('button', { name: '← Entraînement' }).click();

  // Ancien puzzle : converti sans perte, et lien du thème faible depuis Progrès.
  await seedOldPuzzle(page);
  await page.reload();
  await page.getByRole('button', { name: 'Entraînement', exact: true }).click();
  await page.waitForSelector('[data-testid="themes"] .theme-tile');
  await page.waitForTimeout(300);
  const migrated = await readPuzzle(page, 'g-old|4');
  ok(migrated?.version === 2 && migrated.attempts === 4 && migrated.successes === 1 && migrated.stage === 1 && migrated.line?.length === 3, `${tag} P7 ancien puzzle converti, historique gardé`);
  ok((await page.getByRole('button', { name: /Thème faible : Fourchettes/ }).count()) === 1, `${tag} P7 thème faible affiché`);
  // Une partie analysée (pseudo de Morphy) : Progrès affiche ses faiblesses, « Sur mes parties » ses exercices.
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('sharp-eye:settings') || '{}');
    localStorage.setItem('sharp-eye:settings', JSON.stringify({ ...st, usernames: ['Paul Morphy'] }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Importer' }).first().click();
  await page.getByRole('button', { name: /Partie d’exemple/ }).click();
  await page.waitForSelector('.overview', { timeout: 180000 });
  await leaveReview(page);
  await page.getByRole('button', { name: 'Entraînement', exact: true }).click();
  await page.locator('.theme-tile', { hasText: 'Devine le coup' }).click();
  await page.waitForTimeout(300);
  ok((await page.getByText(/que joues-tu/).count()) === 1, `${tag} P7 « Devine le coup » sur la dernière partie en 2 touches`);
  await leaveReview(page);
  await page.getByRole('button', { name: 'Progrès', exact: true }).click();
  await page.waitForSelector('.weak-list li', { timeout: 10000 }).catch(() => {});
  const link = page.locator('.weak-list li', { hasText: 'Fourchettes' }).getByRole('button');
  if ((await link.count()) === 1) {
    await link.click();
    await page.waitForSelector('[data-testid="challenge"]', { timeout: 5000 }).catch(() => {});
    ok((await page.locator('.session-title').textContent().catch(() => '')) === 'Fourchettes', `${tag} P7 le thème faible de Progrès ouvre ses défis`);
  } else ok(false, `${tag} P7 lien du thème faible dans Progrès`);
  await ctx.close();
}

/** Touche une case de l'échiquier du défi. */
async function tapSquare(page, sq, flipped) {
  const box = await page.locator('.challenge-layout .board').boundingBox();
  const f = 'abcdefgh'.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  const x = flipped ? 7 - f : f;
  const y = flipped ? r : 7 - r;
  await page.mouse.click(box.x + ((x + 0.5) * box.width) / 8, box.y + ((y + 0.5) * box.height) / 8);
}

async function playUci(page, uci, flipped) {
  await tapSquare(page, uci.slice(0, 2), flipped);
  await tapSquare(page, uci.slice(2, 4), flipped);
}

const challengeState = (page) =>
  page.locator('[data-testid="challenge"]').evaluate((el) => ({ fen: el.dataset.fen, line: el.dataset.line.split(' '), step: Number(el.dataset.step), phase: el.dataset.phase }));

async function waitPhase(page, phases, timeout = 30000) {
  await page.waitForFunction((ps) => ps.includes(document.querySelector('[data-testid="challenge"]')?.dataset.phase), phases, { timeout });
}

/** Résout le défi affiché ; `wrongFirst` joue d'abord un coup perdant. */
async function solve(page, tag, { wrongFirst = false, hints = 0 } = {}) {
  await waitPhase(page, ['play']);
  let st = await challengeState(page);
  const flipped = st.fen.split(' ')[1] === 'b';
  if (wrongFirst) {
    const c = new Chess(st.fen);
    const bad = c.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ? 'q' : '')).find((u) => u.slice(0, 4) !== st.line[0].slice(0, 4) && !/[+#]/.test(new Chess(st.fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san));
    await playUci(page, bad, flipped);
    await waitPhase(page, ['refuted', 'play', 'done']);
    const after = await challengeState(page);
    if (after.phase === 'refuted') {
      const reason = await page.locator('.note-wrong').last().textContent();
      ok(words(reason) <= 15, `${tag} P8 erreur expliquée en une phrase ≤ 15 mots (« ${reason} »)`);
      ok((await page.locator('.challenge-layout .board .arrow').count()) >= 1, `${tag} P8 réfutation jouée avec une flèche`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/p8-refutation-${tag.replace('/', '-')}.png` });
      await page.getByRole('button', { name: 'Réessayer' }).click();
      await waitPhase(page, ['play']);
      ok((await challengeState(page)).step === 0, `${tag} P8 « Réessayer » revient à la position du défi`);
    } else ok(false, `${tag} P8 coup perdant ${bad} accepté à tort`);
  }
  for (let i = 0; i < hints; i++) await page.getByRole('button', { name: /^Indice/ }).click();
  if (hints) ok((await page.locator('.hint-text').textContent()).startsWith(`Indice ${hints}/3`), `${tag} P8 indice ${hints}/3 affiché`);
  st = await challengeState(page);
  let goodNotes = 0;
  while (st.phase !== 'done') {
    await playUci(page, st.line[st.step], flipped);
    await waitPhase(page, ['play', 'done']);
    goodNotes++;
    st = await challengeState(page);
  }
  const notes = await page.locator('.note-good, .note-alt').allTextContents();
  ok(notes.length === goodNotes && notes.every((n) => n.length > 2 && words(n) <= 15), `${tag} P8 une phrase courte après chaque bon coup (${notes.join(' | ')})`);
  return st;
}

async function point8(browser, w, h, nav) {
  const tag = `${w}x${h}/${nav}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  await ctx.addInitScript(fakeSpeech, 50);
  await ctx.addInitScript((n) => localStorage.getItem('sharp-eye:settings') || localStorage.setItem('sharp-eye:settings', JSON.stringify({ navSize: n, graphSize: n, narration: true })), nav);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ok(false, `${tag} erreur de page : ${e.message}`));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Entraînement', exact: true }).click();
  const levelText = async () => (await page.locator('.training-screen .screen-head .muted').textContent()) ?? '';
  await page.waitForSelector('.theme-tile');
  const level0 = await levelText();
  await page.locator('.theme-tile', { hasText: 'Pièces en prise' }).click();
  await waitPhase(page, ['play']);
  const instr = (await page.getByTestId('instruction').textContent()).trim();
  ok(/^Les (blancs|noirs) jouent et (matent|gagnent .+|prennent un avantage décisif) en [2-5] coups\.$/.test(instr), `${tag} P8 consigne « ${instr} »`);
  const st0 = await challengeState(page);
  const n = Math.ceil(st0.line.length / 2);
  ok(n >= 2 && n <= 5, `${tag} P8 combinaison de ${n} coups du joueur`);
  const spoken = await page.evaluate(() => window.__spoken);
  ok(spoken.some((s) => s === instr), `${tag} P8 la narration lit la consigne`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p8-defi-${tag.replace('/', '-')}.png` });

  await solve(page, tag, { wrongFirst: true, hints: 2 });
  const result = await page.getByTestId('challenge-result').textContent();
  ok(/après une erreur/.test(result), `${tag} P8 réussite après une erreur notée comme ratée (${result})`);
  await page.waitForSelector('[data-testid="line-card"]:nth-child(2)', { timeout: 30000 });
  const cards = await page.locator('[data-testid="line-card"]').evaluateAll((els) =>
    els.map((e) => ({ title: e.querySelector('h3').textContent, phrase: e.querySelector('h3 + p').textContent, arrows: e.querySelectorAll('.arrow').length })),
  );
  ok(cards.length >= 2 && cards.every((c) => c.phrase && c.phrase.split(/\s+/).length <= 15 && c.arrows >= 1), `${tag} P8 « Pourquoi c’est le meilleur » : ${cards.length} lignes avec flèche et phrase (${cards.map((c) => `${c.title} : ${c.phrase}`).join(' | ')})`);
  const card = page.locator('[data-testid="line-card"]').nth(1);
  await card.getByRole('button', { name: 'Coup suivant' }).click();
  ok((await card.locator('.line-nav .muted').textContent()).startsWith('1/'), `${tag} P8 ligne rejouable pas à pas`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p8-pourquoi-${tag.replace('/', '-')}.png`, fullPage: true });
  ok((await overflowX(page)) <= 0, `${tag} P8 pas de défilement horizontal`);

  if (w === 1180) {
    // Trois réussites de suite font monter le niveau.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Défi suivant|Terminer/ }).click();
      await solve(page, tag);
      const r = await page.getByTestId('challenge-result').textContent();
      if (i === 0) ok(/Réussi · 3 points sur 3/.test(r), `${tag} P8 réussite sans aide : 3 points (${r})`);
    }
    await page.getByRole('button', { name: '← Entraînement' }).click();
    const level1 = await levelText();
    ok(level0 !== level1 && Number(level1.replace(/\D/g, '')) === Number(level0.replace(/\D/g, '')) + 150, `${tag} P8 niveau adaptatif : ${level0} → ${level1}`);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const p of ['7', '8'].filter((p) => POINTS.includes(p)))
    for (const nav of NAVS)
      for (const sz of SIZES) {
        const [w, h] = sz.split('x').map(Number);
        await (p === '7' ? point7 : point8)(browser, w, h, nav);
      }
  if (POINTS.includes('3'))
    for (const sz of SIZES.slice(0, 1)) {
      const [w, h] = sz.split('x').map(Number);
      await point3(browser, w, h, NAVS[0]);
    }
  if (POINTS.some((p) => ['4', '5', '6'].includes(p)))
    for (const sz of SIZES) {
      const [w, h] = sz.split('x').map(Number);
      await points456(browser, w, h, NAVS[NAVS.length - 1]);
    }
  if (POINTS.some((p) => ['1', '2'].includes(p)))
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
