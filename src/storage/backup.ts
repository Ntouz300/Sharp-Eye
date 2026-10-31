import { db } from './db';

const FORMAT = 'sharp-eye-backup';

/** Sauvegarde complète : parties, analyses, puzzles, classement et réglages (le cache moteur est exclu). */
export async function exportBackup(settings: unknown): Promise<Blob> {
  const [games, analyses, puzzles, kv] = await Promise.all([db.games.toArray(), db.analyses.toArray(), db.puzzles.toArray(), db.kv.toArray()]);
  const data = { format: FORMAT, version: 2, exportedAt: new Date().toISOString(), settings, games, analyses, puzzles, kv };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** Restaure une sauvegarde ; les éléments déjà présents sont remplacés, les autres conservés. */
export async function importBackup(text: string): Promise<{ games: number; analyses: number; puzzles: number; settings?: Record<string, unknown> }> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde Sharp Eye (JSON illisible).');
  }
  if (data.format !== FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde Sharp Eye.');
  const arr = <T>(k: string) => (Array.isArray(data[k]) ? (data[k] as T[]) : []);
  await db.transaction('rw', [db.games, db.analyses, db.puzzles, db.kv], async () => {
    await db.games.bulkPut(arr('games'));
    await db.analyses.bulkPut(arr('analyses'));
    await db.puzzles.bulkPut(arr('puzzles'));
    await db.kv.bulkPut(arr('kv'));
  });
  return {
    games: arr('games').length,
    analyses: arr('analyses').length,
    puzzles: arr('puzzles').length,
    settings: (data.settings as Record<string, unknown>) ?? undefined,
  };
}
