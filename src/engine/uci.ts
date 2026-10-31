import type { EngineLine } from './types';

/** Lit une ligne « info … » de Stockfish. Le score UCI est du point de vue du camp au trait ; on le ramène côté blancs. */
export function parseInfo(line: string, whiteToMove: boolean): EngineLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ') || line.includes('bound')) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const multipv = /\bmultipv (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  if (!depth || !score || !pv) return null;
  const sign = whiteToMove ? 1 : -1;
  const value = Number(score[2]) * sign;
  return {
    depth: Number(depth[1]),
    multipv: multipv ? Number(multipv[1]) : 1,
    score: score[1] === 'cp' ? { cp: value } : { mate: value },
    pv: pv[1].trim().split(/\s+/),
  };
}

/** Pilote générique d'un moteur UCI : envoie des commandes, reçoit des lignes. */
export class UciDriver {
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private send: (cmd: string) => void) {}

  receive(line: string) {
    for (const l of this.listeners) l(line);
  }

  waitFor(predicate: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        if (predicate(line)) {
          this.listeners.delete(l);
          resolve();
        }
      };
      this.listeners.add(l);
    });
  }

  async init() {
    const ok = this.waitFor((l) => l === 'uciok');
    this.send('uci');
    await ok;
    this.send('setoption name Hash value 32');
    await this.ready();
  }

  async ready() {
    const ok = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    await ok;
  }

  stop() {
    this.send('stop');
  }

  /**
   * Analyse à profondeur fixe. Chaque position commence par « ucinewgame » (table de hachage vidée)
   * pour que le résultat ne dépende que de la position et de la profondeur : analyses reproductibles.
   */
  analyze(fen: string, depth: number, multiPv: number, signal?: AbortSignal): Promise<{ fen: string; depth: number; lines: EngineLine[] }> {
    const run = async () => {
      if (signal?.aborted) throw new DOMException('Analyse annulée', 'AbortError');
      const whiteToMove = fen.split(' ')[1] === 'w';
      const lines = new Map<number, EngineLine>();
      this.send('ucinewgame');
      this.send(`setoption name MultiPV value ${multiPv}`);
      await this.ready();
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        this.send('stop');
      };
      signal?.addEventListener('abort', onAbort);
      const collector = (line: string) => {
        const info = parseInfo(line, whiteToMove);
        if (info) lines.set(info.multipv, info);
      };
      this.listeners.add(collector);
      const done = this.waitFor((l) => l.startsWith('bestmove'));
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
      await done;
      this.listeners.delete(collector);
      signal?.removeEventListener('abort', onAbort);
      if (aborted) throw new DOMException('Analyse annulée', 'AbortError');
      const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
      return { fen, depth, lines: sorted };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}
