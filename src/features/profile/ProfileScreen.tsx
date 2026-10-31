import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../storage/db';
import { Icon } from '../../ui/Icon';
import { AccountNotFound, fetchProfile, linkAccount, unlinkAccount, useSync, type ChessComAccount, type ChessComProfile } from '../account/chesscom';
import { Help } from '../help/Help';
import { timeAgo } from '../library/GamesScreen';
import { SettingsScreen } from '../settings/SettingsScreen';

type Page = 'home' | 'settings' | 'help';

/** Profil : compte chess.com relié, réglages et aide. */
export function ProfileScreen() {
  const [page, setPage] = useState<Page>('home');
  if (page !== 'home')
    return (
      <div className="screen profile-screen">
        <header className="screen-head">
          <button type="button" className="back-btn" onClick={() => setPage('home')}>
            <Icon name="back" /> <span>Profil</span>
          </button>
          <h1>{page === 'settings' ? 'Réglages' : 'Aide'}</h1>
        </header>
        {page === 'settings' ? <SettingsScreen /> : <Help />}
      </div>
    );
  return (
    <div className="screen profile-screen">
      <header className="screen-head">
        <h1>Profil</h1>
      </header>
      <AccountCard />
      <ul className="nav-list">
        <li>
          <button type="button" className="option-row" onClick={() => setPage('settings')}>
            <Icon name="settings" />
            <span>
              <strong>Réglages</strong>
              <span className="muted small">Thème, niveau de revue, notation, pseudos, sauvegarde</span>
            </span>
            <Icon name="chevron" />
          </button>
        </li>
        <li>
          <button type="button" className="option-row" onClick={() => setPage('help')}>
            <Icon name="help" />
            <span>
              <strong>Aide</strong>
              <span className="muted small">Calcul de la revue, étiquettes, écarts avec chess.com</span>
            </span>
            <Icon name="chevron" />
          </button>
        </li>
      </ul>
    </div>
  );
}

const RATING_NAMES: [keyof ChessComProfile['ratings'], string][] = [
  ['rapid', 'Rapide'],
  ['blitz', 'Blitz'],
  ['bullet', 'Bullet'],
  ['daily', 'Correspondance'],
];

function Avatar({ src, name, size = 56 }: { src?: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img className="avatar-img" src={src} width={size} height={size} alt="" onError={() => setBroken(true)} />;
  return (
    <span className="avatar-md big" style={{ width: size, height: size }} aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Ratings({ p }: { p: ChessComProfile }) {
  const list = RATING_NAMES.filter(([k]) => p.ratings[k]);
  if (!list.length) return null;
  return (
    <dl className="ratings">
      {list.map(([k, label]) => (
        <div key={k}>
          <dt>{label}</dt>
          <dd>{p.ratings[k]}</dd>
        </div>
      ))}
    </dl>
  );
}

function AccountCard() {
  const account = useLiveQuery(() => db.kv.get('chesscom'), [], null)?.value as ChessComAccount | undefined;
  const imported = useLiveQuery(() => db.games.filter((g) => g.origin === 'chesscom').count(), [], 0);
  const { running, progress, message, sync } = useSync();
  const [name, setName] = useState('');
  const [found, setFound] = useState<ChessComProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [alsoDelete, setAlsoDelete] = useState(false);

  if (account)
    return (
      <section className="card account-card">
        <div className="account-head">
          <Avatar src={account.avatar} name={account.username} />
          <div>
            <h2>{account.name ?? account.username}</h2>
            <p className="muted small">
              chess.com · {account.username}
              {account.country ? ` · ${account.country}` : ''}
            </p>
          </div>
        </div>
        <Ratings p={account} />
        <p className="small" role="status">
          {running
            ? progress
              ? `Synchronisation : mois ${progress.monthIndex + 1} sur ${progress.months} · ${progress.added} nouvelle${progress.added > 1 ? 's' : ''}`
              : 'Synchronisation…'
            : `${imported} partie${imported > 1 ? 's' : ''} importée${imported > 1 ? 's' : ''} · dernière synchro ${account.lastSync ? timeAgo(account.lastSync) : 'jamais'}`}
        </p>
        {message && !running && <p className="muted small">{message}</p>}
        <div className="row-actions">
          <button type="button" className="primary" onClick={() => void sync()} disabled={running}>
            <Icon name="sync" /> Synchroniser maintenant
          </button>
          <button type="button" className="ghost" onClick={() => setUnlinking(!unlinking)}>
            Déconnecter
          </button>
        </div>
        {unlinking && (
          <div className="confirm-box">
            <label className="toggle">
              <input type="checkbox" checked={alsoDelete} onChange={(e) => setAlsoDelete(e.target.checked)} />
              Supprimer aussi ces {imported} parties
            </label>
            <button
              type="button"
              className="ghost danger"
              onClick={async () => {
                await unlinkAccount(alsoDelete);
                setUnlinking(false);
              }}
            >
              Confirmer la déconnexion
            </button>
          </div>
        )}
        <p className="muted small">La synchronisation a lieu quand l’app est ouverte : l’iPad ne permet pas aux apps web de travailler en arrière-plan.</p>
      </section>
    );

  return (
    <section className="card account-card">
      <h2>Relier un compte chess.com</h2>
      <p className="muted small">Indique ton pseudo : tes parties arriveront seules dans la bibliothèque. Aucun mot de passe n’est demandé.</p>
      <form
        className="link-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setChecking(true);
          setError(null);
          setFound(null);
          try {
            setFound(await fetchProfile(name));
          } catch (err) {
            setError(err instanceof AccountNotFound ? 'Compte introuvable. Vérifie l’orthographe du pseudo.' : (err as Error).message);
          } finally {
            setChecking(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="cc-user">
          Pseudo chess.com
        </label>
        <input id="cc-user" className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo chess.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button type="submit" className="primary" disabled={!name.trim() || checking}>
          {checking ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}
      {found && (
        <div className="found-box">
          <div className="account-head">
            <Avatar src={found.avatar} name={found.username} />
            <div>
              <h3>{found.name ?? found.username}</h3>
              <p className="muted small">{found.username}</p>
            </div>
          </div>
          <Ratings p={found} />
          <button
            type="button"
            className="primary big"
            onClick={async () => {
              await linkAccount(found);
              setFound(null);
              void useSync.getState().sync();
            }}
          >
            C’est mon compte : relier et synchroniser
          </button>
        </div>
      )}
    </section>
  );
}
