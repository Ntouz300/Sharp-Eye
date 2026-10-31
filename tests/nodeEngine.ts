import { createRequire } from 'node:module';
import type { Engine, PositionEval } from '../src/engine/types';
import { UciDriver } from '../src/engine/uci';

const require = createRequire(import.meta.url);

/** Stockfish 18 lite (même binaire WASM que l'app) piloté depuis Node pour les tests. */
export async function createNodeEngine(): Promise<Engine> {
  const init = require('stockfish');
  const sf = await init('lite-single');
  const driver = new UciDriver((cmd) => sf.sendCommand(cmd));
  sf.listener = (line: string) => driver.receive(line);
  await driver.init();
  return {
    name: 'Stockfish 18 (test)',
    analyze: (fen: string, depth: number, multiPv: number, signal?: AbortSignal): Promise<PositionEval> =>
      driver.analyze(fen, depth, multiPv, signal),
    stop: () => driver.stop(),
  };
}
