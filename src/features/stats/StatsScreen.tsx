import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import type { GameAnalysis } from '../../analysis/analyzeGame';
import { formatAccuracy } from '../../analysis/accuracy';
import { LABEL_INFO, type Label } from '../../analysis/classify';
import { parseGame, SPEED_LABEL } from '../../pgn/parser';
import { db, type StoredGame } from '../../storage/db';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan } from '../../ui/notation';
import { useReview } from '../review/store';
import { useSettings } from '../settings/settings';
import { badges, monthLabel, monthReport, months } from '../progress/achievements';
import { Icon } from '../../ui/Icon';
import { gameStats, groupAccuracy, inferMe, labelRates, mean, repertoire, weaknesses, type GameStat, type RepertoireNode } from './stats';

const PHASE_NAME = { opening: 'Ouverture', middlegame: 'Milieu de partie', endgame: 'Finale' } as const;
const TREND_LABELS: Label[] = ['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`);

export function StatsScreen() {
  const usernames = useSettings((s) => s.usernames);
  const data = useLiveQuery(async () => {
    const [games, analyses, puzzles, profile, daily] = await Promise.all([db.games.toArray(), db.analyses.toArray(), db.puzzles.toArray(), db.kv.get('puzzleProfile'), db.kv.get('daily')]);
    return { games, analyses, puzzles, profile: profile?.value as { rating: number; streak: number } | undefined, dailyDone: (daily?.value as { count: number } | undefined)?.count ?? 0 };
  }, []);
  const [repColor, setRepColor] = useState<'w' | 'b'>('w');
  const [month, setMonth] = useState<string | null>(null);

  const computed = useMemo(() => {
    if (!data) return null;
    const me = usernames.length ? usernames : inferMe(data.games);
    const byGame = new Map<string, GameAnalysis>();
    for (const a of data.analyses) if (a.analysis.complete) byGame.set(a.gameId, a.analysis);
    const stats = gameStats(data.games, byGame, me);
    // Coups joués trop vite (moins de 3 s) qui ont coûté une erreur ou une gaffe.
    for (const s of stats) {
      if (!s.analysis) continue;
      const g = data.games.find((x) => x.id === s.id);
      if (!g) continue;
      try {
        const parsed = parseGame(g.source);
        parsed.moves.forEach((m, i) => {
          if (m.color !== s.color) return;
          const label = s.analysis!.moves[i]?.label;
          if (label !== 'mistake' && label !== 'blunder') return;
          const prev = i >= 2 ? parsed.moves[i - 2].clock : undefined;
          if (m.clock !== undefined && prev !== undefined && prev - m.clock < 3) s.hastyErrors++;
        });
      } catch {
        /* partie illisible : ignorée */
      }
    }
    return { me, stats };
  }, [data, usernames]);

  if (!data || !computed) return null;
  const { me, stats } = computed;
  if (!me.length || !stats.length) {
    return (
      <div className="settings screen">
        <h1>Progrès</h1>
        <section className="settings-card">
          <p>Indique ton pseudo dans les Réglages (ou importe au moins deux de tes parties) pour voir tes statistiques.</p>
        </section>
      </div>
    );
  }

  const analyzed = stats.filter((s) => s.accuracy !== undefined);
  const last30 = analyzed.slice(-30);
  const prev30 = analyzed.slice(-60, -30);
  const rates = labelRates(last30);
  const prevRates = labelRates(prev30);
  const speeds = groupAccuracy(stats, (s) => s.speed).sort((a, b) => b.games - a.games);
  const colors = groupAccuracy(stats, (s) => s.color);
  const phases = (['opening', 'middlegame', 'endgame'] as const).map((p) => ({ p, acc: mean(analyzed.map((s) => s.phases?.[p]).filter((x): x is number => x !== undefined)) }));
  const losses = stats.filter((s) => s.score === 0);
  const timeLoss = losses.length ? losses.filter((s) => s.lostOnTime).length / losses.length : null;
  const hasty = analyzed.reduce((a, s) => a + s.hastyErrors, 0);
  const weak = weaknesses(data.puzzles);

  return (
    <div className="stats screen">
      <header className="screen-head">
        <h1>Progrès</h1>
        <p className="muted small" data-testid="analyzed-basis">
          Précision basée sur {analyzed.length} partie{analyzed.length > 1 ? 's' : ''} analysée{analyzed.length > 1 ? 's' : ''} sur {stats.length}
        </p>
      </header>
      <div className="puzzle-stats">
        <div>
          <span className="stat-big">{stats.length}</span>
          <span className="muted small">parties de {me.join(', ')}</span>
        </div>
        <div>
          <span className="stat-big">{formatAccuracy(mean(analyzed.map((s) => s.accuracy!)))}</span>
          <span className="muted small">précision moyenne</span>
        </div>
        <div>
          <span className="stat-big">{pct(mean(stats.map((s) => s.score).filter((x): x is number => x !== null)))}</span>
          <span className="muted small">de points marqués</span>
        </div>
        <div>
          <span className="stat-big">{data.profile?.rating ?? '–'}</span>
          <span className="muted small">classement puzzles</span>
        </div>
      </div>

      <section className="settings-card">
        <h2>Précision dans le temps</h2>
        {analyzed.length >= 2 ? <AccuracyChart stats={analyzed.slice(-60)} /> : <p className="muted">Analyse au moins deux parties pour voir la courbe.</p>}
      </section>

      <div className="stats-grid">
        <section className="settings-card">
          <h2>Par cadence</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Cadence</th>
                <th scope="col">Parties</th>
                <th scope="col">Score</th>
                <th scope="col">Précision</th>
              </tr>
            </thead>
            <tbody>
              {speeds.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{SPEED_LABEL[r.key]}</th>
                  <td>{r.games}</td>
                  <td>{pct(r.score)}</td>
                  <td>{formatAccuracy(r.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="settings-card">
          <h2>Par couleur et par phase</h2>
          <table className="data-table">
            <tbody>
              {colors.map((r) => (
                <tr key={r.key}>
                  <th scope="row">Avec les {r.key === 'w' ? 'blancs' : 'noirs'}</th>
                  <td>{r.games} parties</td>
                  <td>{pct(r.score)}</td>
                  <td>{formatAccuracy(r.accuracy)}</td>
                </tr>
              ))}
              {phases.map(({ p, acc }) => (
                <tr key={p}>
                  <th scope="row">{PHASE_NAME[p]}</th>
                  <td colSpan={2} />
                  <td>{formatAccuracy(acc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="stats-grid">
        <section className="settings-card">
          <h2>Étiquettes par partie</h2>
          <p className="muted small">Moyenne sur tes {last30.length} dernières parties analysées{prev30.length ? `, comparée aux ${prev30.length} précédentes` : ''}.</p>
          <div className="rate-list">
            {TREND_LABELS.map((l) => {
              const v = rates[l] ?? 0;
              const before = prevRates[l];
              const good = ['brilliant', 'great', 'best'].includes(l);
              const better = before !== undefined && (good ? v > before + 0.05 : v < before - 0.05);
              const worse = before !== undefined && (good ? v < before - 0.05 : v > before + 0.05);
              return (
                <div key={l} className="rate-row">
                  <LabelIcon label={l} size={18} />
                  <span className="rate-name">{LABEL_INFO[l].plural}</span>
                  <span className="rate-bar">
                    <span style={{ width: `${Math.min(100, v * 8)}%` }} />
                  </span>
                  <span className="rate-value">{v.toFixed(1).replace('.', ',')}</span>
                  <span className={`trend ${better ? 'up' : worse ? 'down' : ''}`} aria-label={better ? 'en progrès' : worse ? 'en recul' : 'stable'}>
                    {better ? '▲' : worse ? '▼' : '·'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="settings-card">
          <h2>Gestion du temps</h2>
          <p>
            <strong>{pct(timeLoss)}</strong> de tes défaites sont des pertes au temps.
          </p>
          <p>
            <strong>{hasty}</strong> erreur{hasty > 1 ? 's' : ''} ou gaffe{hasty > 1 ? 's' : ''} jouée{hasty > 1 ? 's' : ''} en moins de 3 secondes.
          </p>
          <h2 className="mt">Faiblesses tactiques</h2>
          {weak.length ? (
            <ul className="weak-list">
              {weak.slice(0, 6).map((w) => (
                <li key={w.theme}>
                  <span>
                    {w.theme} <span className="muted small">({w.count} manqué{w.count > 1 ? 's' : ''})</span>
                  </span>
                  <button type="button" className="link-btn" onClick={() => useReview.getState().setTab('training', w.theme)}>
                    S'entraîner
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Pas encore de puzzles : analyse quelques parties.</p>
          )}
        </section>
      </div>

      <MonthCard stats={stats} month={month ?? months(stats)[0]} onMonth={setMonth} games={data.games} />

      <BadgesCard list={badges({ stats, puzzles: data.puzzles, puzzleRating: data.profile?.rating ?? 1500, streak: data.profile?.streak ?? 0, dailyDone: data.dailyDone })} />

      <section className="settings-card">
        <div className="section-head">
          <h2>Répertoire d'ouvertures</h2>
          <div className="chips-row">
            <button type="button" className={`chip ${repColor === 'w' ? 'active' : ''}`} onClick={() => setRepColor('w')} aria-pressed={repColor === 'w'}>
              Avec les blancs
            </button>
            <button type="button" className={`chip ${repColor === 'b' ? 'active' : ''}`} onClick={() => setRepColor('b')} aria-pressed={repColor === 'b'}>
              Avec les noirs
            </button>
          </div>
        </div>
        <p className="muted small">Score et précision moyenne par ligne. En rouge : les lignes où tu marques moins de 40 % (3 parties au moins).</p>
        <RepertoireTree root={repertoire(stats, repColor)} />
      </section>
    </div>
  );
}

function AccuracyChart({ stats }: { stats: GameStat[] }) {
  const W = 640;
  const H = 180;
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const xs = (i: number) => pad.l + (i / Math.max(1, stats.length - 1)) * (W - pad.l - pad.r);
  const ys = (a: number) => pad.t + (1 - (a - 40) / 60) * (H - pad.t - pad.b);
  const accs = stats.map((s) => Math.max(40, s.accuracy!));
  // Moyenne glissante sur 5 parties.
  const smooth = accs.map((_, i) => mean(accs.slice(Math.max(0, i - 4), i + 1))!);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  const open = useReview.getState();
  return (
    <svg className="acc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Précision par partie, avec moyenne glissante sur 5 parties">
      {[40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={ys(v)} y2={ys(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={pad.l - 6} y={ys(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
            {v}
          </text>
        </g>
      ))}
      <path d={path(accs)} fill="none" stroke="var(--text-muted)" strokeWidth="1" opacity="0.5" />
      <path d={path(smooth)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {stats.map((s, i) => (
        <circle
          key={s.id}
          cx={xs(i)}
          cy={ys(accs[i])}
          r="3.5"
          fill={s.score === 1 ? '#3f8f22' : s.score === 0 ? '#c23a36' : '#7d838c'}
          style={{ cursor: 'pointer' }}
          onClick={async () => {
            const g = await db.games.get(s.id);
            if (g) await open.openGame(g);
          }}
        >
          <title>
            {new Date(s.date).toLocaleDateString('fr-FR')} contre {s.opponent} : {formatAccuracy(s.accuracy)}
          </title>
        </circle>
      ))}
      <text x={pad.l} y={H - 4} fontSize="11" fill="var(--text-muted)">
        {new Date(stats[0].date).toLocaleDateString('fr-FR')}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize="11" fill="var(--text-muted)" textAnchor="end">
        {new Date(stats[stats.length - 1].date).toLocaleDateString('fr-FR')}
      </text>
    </svg>
  );
}

function RepertoireTree({ root }: { root: RepertoireNode }) {
  const notation = useSettings((s) => s.notation);
  if (!root.children.length) return <p className="muted">Aucune partie avec cette couleur.</p>;
  const render = (n: RepertoireNode, ply: number, path: string): React.ReactNode => {
    const weak = n.games >= 3 && n.score < 0.4;
    const num = ply % 2 === 0 ? `${ply / 2 + 1}. ` : '';
    const label = (
      <span className={`rep-line ${weak ? 'weak' : ''}`}>
        <span className="rep-move">
          {num}
          {displaySan(n.san, notation)}
        </span>
        <span className="muted small">
          {n.games} partie{n.games > 1 ? 's' : ''} · {Math.round(n.score * 100)} % · {formatAccuracy(n.accuracy)}
        </span>
      </span>
    );
    if (!n.children.length) return <li key={path}>{label}</li>;
    return (
      <li key={path}>
        <details open={ply < 2}>
          <summary>{label}</summary>
          <ul>{n.children.slice(0, 6).map((c) => render(c, ply + 1, `${path} ${c.san}`))}</ul>
        </details>
      </li>
    );
  };
  return <ul className="rep-tree">{root.children.slice(0, 8).map((c) => render(c, 0, c.san))}</ul>;
}

function MonthCard({ stats, month, onMonth, games }: { stats: GameStat[]; month: string; onMonth: (m: string) => void; games: StoredGame[] }) {
  const r = monthReport(stats, month);
  const delta = r.accuracy !== null && r.previousAccuracy !== null ? r.accuracy - r.previousAccuracy : null;
  const notation = useSettings((s) => s.notation);
  const best = r.bestGame ? games.find((g) => g.id === r.bestGame!.id) : undefined;
  return (
    <section className="settings-card">
      <div className="section-head">
        <h2>
          <Icon name="calendar" /> Bilan du mois
        </h2>
        <select value={month} onChange={(e) => onMonth(e.target.value)} aria-label="Mois">
          {months(stats).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="puzzle-stats">
        <div>
          <span className="stat-big">{r.games}</span>
          <span className="muted small">
            parties · {r.wins} gagnées, {r.draws} nulles, {r.losses} perdues
          </span>
        </div>
        <div>
          <span className="stat-big">{formatAccuracy(r.accuracy)}</span>
          <span className="muted small">
            précision moyenne
            {delta !== null && ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} vs mois précédent)`}
          </span>
        </div>
        <div>
          <span className="stat-big">{r.blundersPerGame === null ? '–' : r.blundersPerGame.toFixed(1).replace('.', ',')}</span>
          <span className="muted small">gaffes par partie analysée</span>
        </div>
      </div>
      <ul className="month-notes">
        {best && r.bestGame && (
          <li>
            Meilleure partie : contre {r.bestGame.opponent} ({formatAccuracy(r.bestGame.accuracy ?? null)}).{' '}
            <button type="button" className="link-btn" onClick={() => void useReview.getState().openGame(best)}>
              La revoir
            </button>
          </li>
        )}
        {r.topOpening && (
          <li>
            Ouverture la plus jouée : {r.topOpening.moves.split(' ').map((x) => displaySan(x, notation)).join(' ')} ({r.topOpening.games} partie{r.topOpening.games > 1 ? 's' : ''}).
          </li>
        )}
        {delta !== null && <li>{delta >= 1 ? 'Tu progresses : continue comme ça.' : delta <= -1 ? 'Mois plus difficile : les puzzles de tes erreurs t’aideront à rebondir.' : 'Précision stable par rapport au mois précédent.'}</li>}
      </ul>
    </section>
  );
}

function BadgesCard({ list }: { list: ReturnType<typeof badges> }) {
  const earned = list.filter((b) => b.earned).length;
  return (
    <section className="settings-card">
      <h2>
        <Icon name="trophy" /> Badges <span className="muted small">{earned} / {list.length}</span>
      </h2>
      <ul className="badges">
        {list.map((b) => (
          <li key={b.id} className={b.earned ? 'earned' : ''}>
            <span className="badge-medal" aria-hidden="true">
              <Icon name="trophy" size={22} />
            </span>
            <span>
              <strong>{b.name}</strong>
              <span className="muted small">{b.description}</span>
              {!b.earned && (
                <span className="badge-progress" role="progressbar" aria-valuenow={Math.round(b.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Avancement ${b.name}`}>
                  <span style={{ width: `${b.progress * 100}%` }} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
