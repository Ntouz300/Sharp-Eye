import { afterEach, describe, expect, it, vi } from 'vitest';
import { chessComGames, parseGameLink } from '../src/features/library/online';

describe('liens et API publiques', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reconnaît les liens de partie', () => {
    expect(parseGameLink('https://lichess.org/AbCdEfGh')).toEqual({ site: 'lichess', id: 'AbCdEfGh' });
    expect(parseGameLink('https://lichess.org/AbCdEfGhIjKl/black')).toEqual({ site: 'lichess', id: 'AbCdEfGh' });
    expect(parseGameLink('https://www.chess.com/game/live/123456789')).toEqual({ site: 'chesscom', id: '123456789' });
    expect(parseGameLink('1. e4 e5')).toBeNull();
  });

  it('liste les parties du mois le plus récent sur chess.com', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.endsWith('/archives')
        ? { archives: ['https://api.chess.com/pub/player/antoine/games/2026/09', 'https://api.chess.com/pub/player/antoine/games/2026/10'] }
        : {
            games: [
              {
                url: 'https://www.chess.com/game/live/1',
                pgn: '[White "antoine"]\n\n1. e4 *',
                time_control: '180+2',
                time_class: 'blitz',
                end_time: 1793400000,
                white: { username: 'antoine', rating: 1500, result: 'win' },
                black: { username: 'bob', rating: 1480, result: 'resigned' },
              },
            ],
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await chessComGames('Antoine');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.chess.com/pub/player/antoine/games/2026/10');
    expect(r.hasOlder).toBe(true);
    expect(r.games[0]).toMatchObject({ white: 'antoine', black: 'bob', result: '1-0', speed: 'Blitz 3+2' });
  });
});
