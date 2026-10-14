// Scripted players over raw WebSockets from the test process (S7-92): a full versus match costs
// eight sockets instead of eight browser pages, so a spectator's page can be measured with every
// avatar in both newsrooms. e2e cannot import workspaces, so the messages are written by hand
// (packages/shared/src/protocol.ts) and the protocol version comes from /api/health.

/** A server message, unparsed: only the fields a bot reads. */
type Incoming = { type: string; [key: string]: unknown };

/** Every bot sends one input per server tick (20 Hz), like a client. */
const INPUT_INTERVAL_MS = 50;
/** A bot turns every second and taps interact every two seconds. */
const TURN_EVERY_INPUTS = 20;
const INTERACT_EVERY_INPUTS = 40;
const STEP_TIMEOUT_MS = 15_000;

const DIAGONAL = Math.SQRT1_2;
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: DIAGONAL, y: DIAGONAL },
  { x: 0, y: 1 },
  { x: -DIAGONAL, y: DIAGONAL },
  { x: -1, y: 0 },
  { x: -DIAGONAL, y: -DIAGONAL },
  { x: 0, y: -1 },
  { x: DIAGONAL, y: -DIAGONAL },
] as const;

type Bot = {
  send(message: Record<string, unknown>): void;
  waitFor(predicate: (message: Incoming) => boolean, what: string): Promise<Incoming>;
  close(): void;
};

function isIncoming(value: unknown): value is Incoming {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function openBot(url: string): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: Incoming[] = [];
    const waiters = new Set<() => void>();
    ws.addEventListener('message', (event) => {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isIncoming(parsed)) {
        messages.push(parsed);
        for (const wake of [...waiters]) {
          wake();
        }
      }
    });
    ws.addEventListener('error', () => reject(new Error(`bot socket failed: ${url}`)));
    ws.addEventListener('open', () =>
      resolve({
        send: (message) => ws.send(JSON.stringify(message)),
        waitFor: (predicate, what) =>
          new Promise((done, fail) => {
            const check = () => {
              const found = messages.find(predicate);
              if (found) {
                waiters.delete(check);
                clearTimeout(timer);
                done(found);
              }
            };
            const timer = setTimeout(() => {
              waiters.delete(check);
              fail(new Error(`bot waited in vain for ${what}`));
            }, STEP_TIMEOUT_MS);
            waiters.add(check);
            check();
          }),
        close: () => ws.close(1000, 'done'),
      }),
    );
  });
}

function lobby(bot: Bot, action: Record<string, unknown>): void {
  bot.send({ type: 'lobby', action });
}

/** A `roomState` that passes `test`. */
function roomState(test: (message: Incoming) => boolean) {
  return (message: Incoming) => message.type === 'roomState' && test(message);
}

function playersOf(message: Incoming): { ready?: unknown }[] {
  return Array.isArray(message.players) ? message.players : [];
}

export type BotMatch = { code: string; close(): void };

/**
 * A versus match of `count` bots (alternating into Kurier and Głos) on `levelId`, with the
 * Widownia open, started and past the briefing. The bots walk and tap interact until `close()`.
 */
export async function startBotMatch(
  baseURL: string,
  { count, levelId }: { count: number; levelId: string },
): Promise<BotMatch> {
  const health: unknown = await (await fetch(new URL('/api/health', baseURL))).json();
  const protocolVersion =
    typeof health === 'object' && health !== null && 'protocolVersion' in health
      ? health.protocolVersion
      : null;
  if (typeof protocolVersion !== 'number') {
    throw new Error('the server reports no protocol version');
  }
  const url = new URL('/ws', baseURL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const bots: Bot[] = [];
  const join = async (nickname: string, roomCode?: string) => {
    const bot = await openBot(url.toString());
    bots.push(bot);
    bot.send({
      type: 'join',
      protocolVersion,
      nickname,
      ...(roomCode === undefined ? {} : { roomCode }),
    });
    const welcome = await bot.waitFor((m) => m.type === 'welcome' || m.type === 'error', 'welcome');
    if (welcome.type !== 'welcome' || typeof welcome.roomCode !== 'string') {
      throw new Error(`bot ${nickname} could not join: ${JSON.stringify(welcome)}`);
    }
    return { bot, code: welcome.roomCode };
  };

  const { bot: host, code } = await join('Bot 1');
  lobby(host, { kind: 'setMode', mode: 'versus' });
  lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
  lobby(host, { kind: 'selectLevel', levelId });
  // Guests join after the level is chosen: choosing one clears the ready ticks.
  await host.waitFor(
    roomState((m) => m.mode === 'versus' && m.levelId === levelId && m.spectatorsAllowed === true),
    'the versus lobby',
  );
  for (let i = 2; i <= count; i++) {
    const { bot } = await join(`Bot ${i}`, code);
    lobby(bot, { kind: 'setReady', ready: true });
  }
  await host.waitFor(
    roomState((m) => {
      const players = playersOf(m);
      // The host has no ready tick of its own; every guest has signed.
      return (
        players.length === count && players.filter((p) => p.ready === true).length >= count - 1
      );
    }),
    'every guest ready',
  );
  lobby(host, { kind: 'start' });
  await host.waitFor(
    roomState((m) => m.phase === 'playing'),
    'the match',
  );

  let seq = 0;
  const timer = setInterval(() => {
    seq++;
    for (const [slot, bot] of bots.entries()) {
      const turn = Math.floor(seq / TURN_EVERY_INPUTS) + slot;
      const move = DIRECTIONS[turn % DIRECTIONS.length] ?? DIRECTIONS[0];
      bot.send({
        type: 'input',
        seq,
        move: { x: move.x, y: move.y },
        actions: { interact: (seq + slot * 5) % INTERACT_EVERY_INPUTS === 0, work: false },
      });
    }
  }, INPUT_INTERVAL_MS);

  return {
    code,
    close() {
      clearInterval(timer);
      for (const bot of bots) {
        bot.close();
      }
    },
  };
}
