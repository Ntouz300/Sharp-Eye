import type { Engine, PositionEval } from './types';
import { UciDriver } from './uci';

/** Stockfish 18 « lite » monothread (WebAssembly, NNUE intégré) exécuté dans un Web Worker. */
export class StockfishWorker implements Engine {
  readonly name = 'Stockfish 18 (WASM)';
  private worker: Worker;
  private driver: UciDriver;
  private initialized: Promise<void>;

  constructor(baseUrl = import.meta.env.BASE_URL) {
    this.worker = new Worker(`${baseUrl}engine/stockfish-18-lite-single.js`);
    this.driver = new UciDriver((cmd) => this.worker.postMessage(cmd));
    this.worker.onmessage = (e: MessageEvent) => {
      const data = typeof e.data === 'string' ? e.data : String(e.data);
      for (const line of data.split('\n')) if (line) this.driver.receive(line);
    };
    this.initialized = this.driver.init();
  }

  async analyze(fen: string, depth: number, multiPv: number, signal?: AbortSignal): Promise<PositionEval> {
    await this.initialized;
    return this.driver.analyze(fen, depth, multiPv, signal);
  }

  stop() {
    this.driver.stop();
  }

  terminate() {
    this.worker.terminate();
  }
}

let shared: StockfishWorker | null = null;
export function getEngine(): StockfishWorker {
  if (!shared) shared = new StockfishWorker();
  return shared;
}
