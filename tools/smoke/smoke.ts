// Production smoke test: drives a deployed stack through its public URL only (what a school
// network sees). Usage:
//   bun run smoke -- https://gra.example.pl [--insecure] [--strict]
//
// Checks, in order: /api/health, /health, /api/config, the HTML page and every script/stylesheet
// it links, response headers (warnings; failures with --strict), the HTML shell the game server
// renders (embedded config, CSP mode, nonce rotation), /ads.txt, /prywatnosc and the manifest,
// then a full game flow over `wss://…/ws`: heartbeat, create room, second player joins by code,
// ready, start, skip the briefing, receive live snapshots that acknowledge our input and arm the
// host's role ability (M3). Exit code 1 if any check fails. --insecure accepts a self-signed
// certificate.
import {
  type ClientMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  PUBLIC_CONFIG_ELEMENT_ID,
  type PublicConfig,
  parseServerMessage,
  publicConfigSchema,
  type ServerMessage,
} from '../../packages/shared/src/index.ts';

export type CheckResult = {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  ms: number;
};

export type SmokeOptions = {
  /** Accept self-signed certificates. */
  insecure?: boolean;
  /** Treat header warnings as failures. */
  strict?: boolean;
  /** Called after every finished check, for live output. */
  onResult?: (result: CheckResult) => void;
  /** Snapshots to wait for once the level runs. */
  snapshots?: number;
};

const STEP_TIMEOUT_MS = 8000;

type Socket = {
  ws: WebSocket;
  messages: ServerMessage[];
  send(message: ClientMessage): void;
  waitFor<T extends ServerMessage['type']>(
    type: T,
    predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
  ): Promise<Extract<ServerMessage, { type: T }>>;
  close(): void;
};

function openSocket(url: string, insecure: boolean): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const init = insecure ? { tls: { rejectUnauthorized: false } } : undefined;
    const ws = new WebSocket(url, init as unknown as string[]);
    const messages: ServerMessage[] = [];
    const listeners = new Set<() => void>();
    ws.addEventListener('message', (event) => {
      const parsed = parseServerMessage(String(event.data));
      if (parsed.ok) {
        messages.push(parsed.message);
        for (const listener of [...listeners]) {
          listener();
        }
      }
    });
    const timer = setTimeout(() => reject(new Error('WebSocket did not open in time')), 8000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({
        ws,
        messages,
        send: (message) => ws.send(encodeMessage(message)),
        waitFor(type, predicate = () => true) {
          type Found = Extract<ServerMessage, { type: typeof type }>;
          const find = () =>
            messages.find((m): m is Found => m.type === type && predicate(m as Found));
          return new Promise<Found>((resolveWait, rejectWait) => {
            const done = () => {
              const found = find();
              if (found) {
                clearTimeout(deadline);
                listeners.delete(done);
                resolveWait(found);
              }
            };
            const deadline = setTimeout(() => {
              listeners.delete(done);
              rejectWait(new Error(`timed out waiting for "${type}"`));
            }, STEP_TIMEOUT_MS);
            listeners.add(done);
            done();
          });
        },
        close: () => ws.close(1000),
      });
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket connection failed (blocked, wrong URL, or TLS error)'));
    });
    ws.addEventListener('close', (event) => {
      if (event.code !== 1000) {
        for (const listener of [...listeners]) {
          listener();
        }
      }
    });
  });
}

/** `https://host[:port]` → `wss://host[:port]/ws`. */
export function websocketUrl(base: URL): string {
  const url = new URL('/ws', base);
  url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Same-origin script and stylesheet URLs referenced by an HTML page. */
export function linkedAssets(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)) {
    const tag = match[0];
    const url = match[1];
    if (!url) {
      continue;
    }
    const isAsset =
      /<script\b/.test(tag) ||
      /rel="(?:stylesheet|modulepreload)"/.test(tag) ||
      /rel="manifest"/.test(tag);
    if (isAsset && !/^[a-z]+:\/\//.test(url) && !url.startsWith('//')) {
      urls.add(url);
    }
  }
  return [...urls];
}

/**
 * Whether a static file came back whole: 200, or a 206 whose Content-Range covers the whole file.
 * Caddy 2.10's `precompressed br` answers a request without a Range header with such a 206;
 * browsers use the body like a 200.
 */
export function isWholeFile(response: Pick<Response, 'status' | 'headers'>): boolean {
  if (response.status === 200) {
    return true;
  }
  const range = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
  return response.status === 206 && range !== null && Number(range[1]) + 1 === Number(range[2]);
}

/** The value of one CSP directive (`'self' wss:`), or undefined when the policy has none. */
export function cspDirective(csp: string, name: string): string | undefined {
  for (const part of csp.split(';')) {
    const [directive, ...sources] = part.trim().split(/\s+/);
    if (directive?.toLowerCase() === name) {
      return sources.join(' ');
    }
  }
  return undefined;
}

export type EmbeddedConfig =
  | { kind: 'missing' }
  | { kind: 'invalid'; error: string }
  | { kind: 'ok'; config: PublicConfig };

/**
 * The public config the game server embeds in the HTML shell
 * (`<script id="redakcja-config" type="application/json">`). Missing on the static fallback page
 * Caddy serves while the game server is down.
 */
export function embeddedConfig(html: string): EmbeddedConfig {
  const match = new RegExp(
    `<script\\b[^>]*\\bid="${PUBLIC_CONFIG_ELEMENT_ID}"[^>]*>([\\s\\S]*?)</script>`,
  ).exec(html);
  if (match?.[1] === undefined) {
    return { kind: 'missing' };
  }
  try {
    const parsed = publicConfigSchema.safeParse(JSON.parse(match[1]));
    return parsed.success
      ? { kind: 'ok', config: parsed.data }
      : { kind: 'invalid', error: parsed.error.issues[0]?.message ?? 'schema mismatch' };
  } catch (error) {
    return { kind: 'invalid', error: error instanceof Error ? error.message : String(error) };
  }
}

/** The `nonce` attribute of the page's module script (the client entry), or null. */
export function moduleScriptNonce(html: string): string | null {
  const tag = /<script\b[^>]*\btype="module"[^>]*>/.exec(html)?.[0];
  return (tag && /\bnonce="([^"]*)"/.exec(tag)?.[1]) || null;
}

export async function runSmoke(
  baseUrl: string,
  options: SmokeOptions = {},
): Promise<CheckResult[]> {
  const base = new URL(baseUrl);
  const insecure = options.insecure ?? false;
  const results: CheckResult[] = [];
  const fetchInit = insecure ? ({ tls: { rejectUnauthorized: false } } as RequestInit) : {};

  async function check(
    name: string,
    fn: () => Promise<string | { warn: string } | undefined>,
  ): Promise<boolean> {
    const started = performance.now();
    let result: CheckResult;
    try {
      const outcome = await fn();
      const ms = Math.round(performance.now() - started);
      if (outcome && typeof outcome === 'object') {
        result = { name, status: options.strict ? 'fail' : 'warn', detail: outcome.warn, ms };
      } else {
        result = { name, status: 'pass', detail: outcome ?? '', ms };
      }
    } catch (error) {
      result = {
        name,
        status: 'fail',
        detail: error instanceof Error ? error.message : String(error),
        ms: Math.round(performance.now() - started),
      };
    }
    results.push(result);
    options.onResult?.(result);
    return result.status !== 'fail';
  }

  const get = (path: string) =>
    fetch(new URL(path, base), { ...fetchInit, signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });

  await check('GET /api/health', async () => {
    const response = await get('/api/health');
    const body = (await response.json()) as { status?: string; db?: string; rooms?: number };
    if (response.status !== 200 || body.status !== 'ok' || body.db !== 'ok') {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    }
    return `ok, ${body.rooms} room(s) open`;
  });

  await check('GET /health', async () => {
    const response = await get('/health');
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    return 'ok';
  });

  await check('GET /api/leaderboard', async () => {
    const response = await get('/api/leaderboard?scope=global&limit=3');
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    return 'ok';
  });

  let apiConfig: PublicConfig | null = null;
  await check('GET /api/config', async () => {
    const response = await get('/api/config');
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = publicConfigSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`not a public config: ${parsed.error.issues[0]?.message ?? 'schema'}`);
    }
    apiConfig = parsed.data;
    return `ads ${parsed.data.ads.enabled ? 'on' : 'off'}, revision ${parsed.data.revision}`;
  });

  let assets: string[] = [];
  const page: { html: string; headers: Headers | null } = { html: '', headers: null };
  await check('GET / (HTML)', async () => {
    const response = await get('/');
    const html = await response.text();
    page.html = html;
    page.headers = response.headers;
    if (response.status !== 200 || !(response.headers.get('content-type') ?? '').includes('html')) {
      throw new Error(`HTTP ${response.status}, ${response.headers.get('content-type')}`);
    }
    if (!html.includes('id="root"')) {
      throw new Error('page has no #root element: is this the game client?');
    }
    assets = linkedAssets(html);
    if (!assets.some((a) => a.endsWith('.js'))) {
      throw new Error('page links no script');
    }
    const problems: string[] = [];
    const header = (name: string) => response.headers.get(name);
    if (base.protocol === 'https:' && !header('strict-transport-security')) {
      problems.push('no Strict-Transport-Security');
    }
    if (header('x-content-type-options') !== 'nosniff') {
      problems.push('no X-Content-Type-Options: nosniff');
    }
    if (!header('content-security-policy')) {
      problems.push('no Content-Security-Policy');
    } else if (!/frame-ancestors\s+'none'/.test(header('content-security-policy') ?? '')) {
      problems.push('CSP does not forbid framing');
    }
    if (!header('referrer-policy')) {
      problems.push('no Referrer-Policy');
    }
    if (problems.length > 0) {
      return { warn: `${assets.length} assets linked; headers: ${problems.join(', ')}` };
    }
    return `${assets.length} linked assets, security headers present`;
  });

  await check('assets load', async () => {
    let bytes = 0;
    for (const asset of assets) {
      const response = await get(asset);
      if (!isWholeFile(response)) {
        throw new Error(`${asset}: HTTP ${response.status}`);
      }
      const body = await response.arrayBuffer();
      bytes += body.byteLength;
      if (/-[A-Za-z0-9_-]{8}\.(js|css)$/.test(asset)) {
        const cache = response.headers.get('cache-control') ?? '';
        if (!cache.includes('immutable')) {
          return { warn: `${asset} is hashed but Cache-Control is "${cache}"` };
        }
      }
    }
    return `${assets.length} files, ${(bytes / 1024).toFixed(0)} KiB`;
  });

  await check('gzip or brotli for scripts', async () => {
    const script = assets.find((a) => a.endsWith('.js'));
    if (!script) {
      throw new Error('no script to test');
    }
    // fetch() would decode transparently; the header tells us what the server sent.
    const response = await fetch(new URL(script, base), {
      ...fetchInit,
      headers: { 'accept-encoding': 'br, gzip' },
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    const encoding = response.headers.get('content-encoding');
    await response.arrayBuffer();
    return encoding ? `content-encoding: ${encoding}` : { warn: 'scripts are sent uncompressed' };
  });

  // --- Pages the game server renders (S7-70, S7-71) -----------------------------------------
  const shell = embeddedConfig(page.html);
  await check('HTML shell: embedded config and CSP mode', async () => {
    if (!page.headers) {
      throw new Error('no page to inspect');
    }
    if (shell.kind === 'missing') {
      return { warn: 'HTML shell not rendered by the game server (static fallback?)' };
    }
    if (shell.kind === 'invalid') {
      throw new Error(`embedded config is not a public config: ${shell.error}`);
    }
    const csp = page.headers.get('content-security-policy') ?? '';
    const scriptSrc = cspDirective(csp, 'script-src') ?? '';
    const adsOn = shell.config.ads.enabled;
    if (apiConfig && apiConfig.ads.enabled !== adsOn) {
      throw new Error(`embedded config says ads ${adsOn ? 'on' : 'off'}, /api/config disagrees`);
    }
    if (scriptSrc.includes("'strict-dynamic'")) {
      if (!adsOn) {
        throw new Error('ads CSP (strict-dynamic) but the embedded config has ads off');
      }
      const nonce = moduleScriptNonce(page.html);
      if (!nonce || !scriptSrc.split(' ').includes(`'nonce-${nonce}'`)) {
        throw new Error("script-src names no 'nonce-…' matching the module script");
      }
      if ((page.headers.get('referrer-policy') ?? 'no-referrer') === 'no-referrer') {
        return { warn: 'ads mode with Referrer-Policy no-referrer: consent message will not show' };
      }
      return 'ads mode: nonce policy matches the page';
    }
    if (adsOn) {
      throw new Error('embedded config has ads on but the CSP is not the ads (nonce) policy');
    }
    if (!scriptSrc.split(' ').includes("'self'") || scriptSrc.includes("'unsafe-eval'")) {
      throw new Error(
        `base mode needs script-src 'self' without 'unsafe-eval', got "${scriptSrc}"`,
      );
    }
    return "base mode: script-src 'self'";
  });

  await check('HTML shell nonce changes per request', async () => {
    if (shell.kind !== 'ok') {
      return { warn: 'no server-rendered shell to compare' };
    }
    const first = moduleScriptNonce(page.html);
    const response = await get('/');
    const second = moduleScriptNonce(await response.text());
    if (!first || !second) {
      if (shell.config.ads.enabled) {
        throw new Error('ads mode but the module script has no nonce');
      }
      return {
        warn: 'module script has no nonce: the build lacks the placeholder, ads cannot run',
      };
    }
    if (first === second) {
      throw new Error('same nonce twice: cached shell');
    }
    return 'fresh nonce';
  });

  await check('GET /ads.txt', async () => {
    const response = await get('/ads.txt');
    const body = await response.text();
    if (response.status === 404) {
      return 'not configured (404)';
    }
    const type = response.headers.get('content-type') ?? '';
    if (/<html|<!doctype/i.test(body) || type.includes('html')) {
      throw new Error('HTML instead of ads.txt: the SPA fallback swallowed /ads.txt');
    }
    if (response.status !== 200 || !type.startsWith('text/plain')) {
      throw new Error(`HTTP ${response.status}, ${type}`);
    }
    const lines = body.split('\n').filter((line) => line.trim() !== '').length;
    return `${lines} line(s), text/plain`;
  });

  await check('GET /prywatnosc', async () => {
    const response = await get('/prywatnosc');
    const html = await response.text();
    const type = response.headers.get('content-type') ?? '';
    if (response.status !== 200 || !type.includes('html')) {
      throw new Error(`HTTP ${response.status}, ${type}`);
    }
    if (/<h1\b/.test(html)) {
      return 'privacy page';
    }
    // Until the privacy page route lands (S7-75) the path renders the HTML shell.
    if (embeddedConfig(html).kind !== 'missing') {
      return 'HTML shell (privacy page route not deployed yet)';
    }
    throw new Error('HTML without a heading or the game shell');
  });

  await check('GET /manifest.webmanifest', async () => {
    const response = await get('/manifest.webmanifest');
    const body = await response.text();
    const type = response.headers.get('content-type') ?? '';
    if (!isWholeFile(response) || type.includes('html') || /<html|<!doctype/i.test(body)) {
      throw new Error(`HTTP ${response.status}, ${type}: not the static manifest`);
    }
    const cache = response.headers.get('cache-control') ?? '';
    if (!cache.includes('no-cache')) {
      return { warn: `Cache-Control is "${cache}", expected no-cache` };
    }
    if (!type.startsWith('application/manifest+json')) {
      return { warn: `Content-Type is "${type}", expected application/manifest+json` };
    }
    return `${type.split(';')[0]}, no-cache`;
  });

  // --- Game flow over the WebSocket ---------------------------------------------------------
  const wsUrl = websocketUrl(base);
  const sockets: Socket[] = [];
  const hostBox: { host?: Socket; guest?: Socket; roomCode?: string; hostId?: string } = {};

  const connected = await check(`WebSocket opens (${wsUrl})`, async () => {
    hostBox.host = await openSocket(wsUrl, insecure);
    sockets.push(hostBox.host);
    return 'upgrade accepted';
  });

  if (connected && hostBox.host) {
    const host = hostBox.host;
    await check('heartbeat round trip', async () => {
      const sentAt = performance.now();
      host.send({ type: 'heartbeat', clientTime: 4242 });
      const ack = await host.waitFor('heartbeatAck', (m) => m.clientTime === 4242);
      return `ack ${ack.clientTime} in ${Math.round(performance.now() - sentAt)} ms`;
    });

    await check('create room', async () => {
      host.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, nickname: 'Smoke A' });
      const welcome = await host.waitFor('welcome');
      hostBox.roomCode = welcome.roomCode;
      hostBox.hostId = welcome.playerId;
      return `room ${welcome.roomCode}`;
    });

    await check('second player joins by code', async () => {
      if (!hostBox.roomCode) {
        throw new Error('no room to join');
      }
      hostBox.guest = await openSocket(wsUrl, insecure);
      sockets.push(hostBox.guest);
      hostBox.guest.send({
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: 'Smoke B',
        roomCode: hostBox.roomCode,
      });
      await hostBox.guest.waitFor('welcome');
      const state = await host.waitFor('roomState', (m) => m.players.length === 2);
      return `${state.players.length} players in the lobby`;
    });

    await check('start level and receive snapshots', async () => {
      const { guest, hostId } = hostBox;
      if (!guest || !hostId) {
        throw new Error('no second player');
      }
      // A role for the ability check below: Training (l0) has the Lupa obrazu, so the photo
      // editor's Ekspertyza arms at once, with no folder needed.
      host.send({ type: 'lobby', action: { kind: 'setRole', role: 'photoEditor' } });
      guest.send({ type: 'lobby', action: { kind: 'setReady', ready: true } });
      await host.waitFor('roomState', (m) =>
        m.players.every((p) => (p.id === m.hostId ? p.role === 'photoEditor' : p.ready)),
      );
      host.send({ type: 'lobby', action: { kind: 'start' } });
      await guest.waitFor('roomState', (m) => m.phase === 'briefing');
      for (const player of [host, guest]) {
        player.send({ type: 'lobby', action: { kind: 'skipBriefing' } });
      }
      await guest.waitFor('roomState', (m) => m.phase === 'playing');

      const wanted = options.snapshots ?? 10;
      const started = performance.now();
      let seq = 0;
      const pump = setInterval(() => {
        host.send({
          type: 'input',
          seq: seq++,
          move: { x: 1, y: 0 },
          actions: { interact: false, work: false },
        });
      }, 50);
      try {
        await guest.waitFor(
          'snapshot',
          () => guest.messages.filter((m) => m.type === 'snapshot').length >= wanted,
        );
        await guest.waitFor('snapshot', (m) =>
          m.players.some((p) => p.id === hostId && p.lastInputSeq >= 1),
        );
      } finally {
        clearInterval(pump);
      }
      const seconds = (performance.now() - started) / 1000;
      return `${wanted}+ snapshots in ${seconds.toFixed(1)} s, input acknowledged`;
    });

    await check('role ability round trip', async () => {
      const { hostId } = hostBox;
      if (!hostId) {
        throw new Error('no level running');
      }
      host.send({ type: 'command', command: { kind: 'useAbility' } });
      await host.waitFor(
        'event',
        (m) =>
          m.event.kind === 'ability' &&
          m.event.playerId === hostId &&
          m.event.ability === 'expertise' &&
          m.event.stage === 'armed',
      );
      await host.waitFor('snapshot', (m) =>
        m.crew.some((member) => member.id === hostId && member.abilityArmed),
      );
      return 'Ekspertyza armed, crew state in the snapshot';
    });
  }

  for (const socket of sockets) {
    socket.close();
  }
  return results;
}

function format(result: CheckResult): string {
  const mark = { pass: 'PASS', fail: 'FAIL', warn: 'WARN' }[result.status];
  const detail = result.detail ? `  ${result.detail}` : '';
  return `${mark}  ${result.name} (${result.ms} ms)${detail}`;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const target = args.find((a) => !a.startsWith('--'));
  if (!target || !/^https?:\/\//.test(target)) {
    console.error('usage: bun run smoke -- https://host [--insecure] [--strict]');
    process.exit(2);
  }
  console.log(`Smoke test of ${target}\n`);
  const results = await runSmoke(target, {
    insecure: flags.has('--insecure'),
    strict: flags.has('--strict'),
    onResult: (r) => console.log(format(r)),
  });
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  console.log(
    `\n${failed === 0 ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED'}: ${results.length - failed - warned} passed, ${warned} warnings, ${failed} failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
