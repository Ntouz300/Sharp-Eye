import { useState } from 'react';
import { chessComGames, lichessGames, type OnlineGame, type Site } from './online';

export function networkMessage(e: unknown): string {
  const err = e as Error;
  if (err.name === 'TypeError') return 'Impossible de joindre le site. Vérifie ta connexion (dans l’aperçu claude.ai, les sites externes sont bloqués : utilise la version installée).';
  return err.message;
}

/** Liste les parties récentes d'un pseudo chess.com ou Lichess et les importe d'un toucher. */
export function OnlineImport({ onImport, importedIds }: { onImport: (pgn: string, id: string) => Promise<void>; importedIds: Set<string> }) {
  const [site, setSite] = useState<Site>('chesscom');
  const [user, setUser] = useState('');
  const [games, setGames] = useState<OnlineGame[] | null>(null);
  const [month, setMonth] = useState<{ label: string; index: number; hasOlder: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (monthIndex = 0) => {
    if (!user.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (site === 'chesscom') {
        const r = await chessComGames(user, monthIndex);
        setGames(r.games);
        setMonth({ label: r.month, index: monthIndex, hasOlder: r.hasOlder });
      } else {
        setGames(await lichessGames(user));
        setMonth(null);
      }
    } catch (e) {
      setError(networkMessage(e));
      setGames(null);
    } finally {
      setLoading(false);
    }
  };

  const me = user.trim().toLowerCase();
  return (
    <div className="online-import">
      <h3>Depuis un site</h3>
      <form
        className="online-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0);
        }}
      >
        <select id="online-site" value={site} onChange={(e) => setSite(e.target.value as Site)} aria-label="Site">
          <option value="chesscom">chess.com</option>
          <option value="lichess">Lichess</option>
        </select>
        <input id="online-user" type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Pseudo" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Pseudo" />
        <button type="submit" className="ghost" disabled={loading || !user.trim()}>
          {loading ? 'Chargement…' : 'Voir les parties'}
        </button>
      </form>
      {error && <p className="error-box small">{error}</p>}
      {games && (
        <div className="online-list">
          {month && <p className="muted small">Parties de {month.label} ({games.length})</p>}
          {!games.length && <p className="muted small">Aucune partie trouvée.</p>}
          {games.map((g) => {
            const meWhite = g.white.toLowerCase() === me;
            const opponent = meWhite ? g.black : g.white;
            const rating = meWhite ? g.blackRating : g.whiteRating;
            const outcome = g.result === '1/2-1/2' ? 'Nulle' : (g.result === '1-0') === meWhite ? 'Gain' : g.result === '*' ? 'En cours' : 'Perte';
            const done = importedIds.has(g.id);
            return (
              <button type="button" key={g.id} className="online-row" disabled={done} onClick={() => onImport(g.pgn, g.id)}>
                <span className={`outcome outcome-${outcome === 'Gain' ? 'win' : outcome === 'Perte' ? 'loss' : 'draw'}`}>{outcome}</span>
                <span className="online-main">
                  <span className="online-opp">
                    {meWhite ? '♙' : '♟'} contre {opponent} {rating && <span className="muted">({rating})</span>}
                  </span>
                  <span className="muted small">
                    {g.speed} · {g.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className="small">{done ? 'Importée' : 'Importer'}</span>
              </button>
            );
          })}
          {month?.hasOlder && (
            <button type="button" className="link-btn" onClick={() => load(month.index + 1)} disabled={loading}>
              Mois précédent
            </button>
          )}
        </div>
      )}
    </div>
  );
}
