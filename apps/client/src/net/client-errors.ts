// Client error reports: what the page saw when it broke (a render error caught by the error
// boundary, an uncaught error, an unhandled promise rejection) goes to the server log through
// POST /api/client-errors, so the teacher can see it there. Reporting never throws and never
// holds up the page. A report carries the message, the stack, the pathname (never the query or
// the hash, where room codes live) and the build; nothing in it names a player.
import {
  CLIENT_ERROR_BUILD_MAX,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_PATH_MAX,
  CLIENT_ERROR_STACK_MAX,
  type ClientErrorReport,
  type ClientErrorSource,
  clientErrorReportSchema,
} from '@redakcja/shared';
import { APP_INFO } from '../about/app-info.ts';
import { api } from './api.ts';

/** Identical messages within this window are sent once: a render loop must not flood the log. */
export const CLIENT_ERROR_DEDUPE_MS = 60_000;

/** Stands in for an error that carries no text (`throw undefined`, an empty message). */
export const UNKNOWN_ERROR_MESSAGE = 'unknown error';

/** What a caller knows about one error; the reporter adds the pathname and the build. */
export type ClientErrorInput = {
  message: string;
  stack?: string;
  source: ClientErrorSource;
};

export type ClientErrorReporter = {
  report(input: ClientErrorInput): void;
};

/**
 * Cuts `text` to at most `max` UTF-16 units, the unit the schema counts, and never leaves half
 * of a surrogate pair at the end.
 */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(max - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** The pathname only: a query and a hash never leave the page. A value that is not a path is `/`. */
export function pathnameOnly(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? '';
  return path.startsWith('/') ? path : '/';
}

/** The text of anything thrown or rejected, and its stack when it has one. Never throws. */
export function describeError(value: unknown): { message: string; stack?: string } {
  try {
    if (value instanceof Error) {
      const stack = typeof value.stack === 'string' && value.stack !== '' ? value.stack : undefined;
      return {
        message: value.message || value.name,
        ...(stack === undefined ? {} : { stack }),
      };
    }
    return { message: safeText(value) };
  } catch {
    // An error object whose getters throw: its text is lost, the report still goes out.
    return { message: '' };
  }
}

/**
 * Window errors that name no bug. A cross-origin script (an ad tag, a CDN) arrives as "Script
 * error." with no error object; the browser's ResizeObserver notice is a layout hint, not a
 * failure. Neither says what broke, so neither is reported.
 */
export function isIgnorableWindowError(event: { message: string; error: unknown }): boolean {
  const opaqueScript =
    (event.error === null || event.error === undefined) && event.message === 'Script error.';
  return opaqueScript || event.message.startsWith('ResizeObserver loop');
}

/** The input for an uncaught error (`window` 'error'): the error object when there is one. */
export function errorEventInput(event: { message: string; error: unknown }): ClientErrorInput {
  return { ...describeError(event.error ?? event.message), source: 'window' };
}

/** The input for an unhandled promise rejection: whatever the promise was rejected with. */
export function rejectionInput(reason: unknown): ClientErrorInput {
  return { ...describeError(reason), source: 'promise' };
}

/**
 * The wire payload for one report: every field cut to its schema limit, the pathname without
 * query or hash, and the build. Fields that are not set are left out (no `undefined` keys).
 */
export function buildReport(
  input: ClientErrorInput,
  page: { pathname: string; build: string },
): ClientErrorReport {
  const stack = input.stack ? truncateText(input.stack, CLIENT_ERROR_STACK_MAX) : undefined;
  return {
    message: truncateText(input.message || UNKNOWN_ERROR_MESSAGE, CLIENT_ERROR_MESSAGE_MAX),
    ...(stack === undefined ? {} : { stack }),
    source: input.source,
    path: truncateText(pathnameOnly(page.pathname), CLIENT_ERROR_PATH_MAX),
    build: truncateText(page.build, CLIENT_ERROR_BUILD_MAX),
  };
}

/**
 * A reporter that sends each new message through `send`. A message already sent within
 * `CLIENT_ERROR_DEDUPE_MS` is dropped. A payload the schema would refuse is dropped too, and so
 * is a failed send: nothing here throws into the page.
 */
export function createClientErrorReporter(options: {
  send: (report: ClientErrorReport) => Promise<unknown>;
  now: () => number;
  pathname: () => string;
  build: string;
}): ClientErrorReporter {
  const lastSentAt = new Map<string, number>();
  return {
    report(input) {
      try {
        const now = options.now();
        for (const [message, at] of lastSentAt) {
          if (now - at >= CLIENT_ERROR_DEDUPE_MS) {
            lastSentAt.delete(message);
          }
        }
        const report = buildReport(input, { pathname: options.pathname(), build: options.build });
        const last = lastSentAt.get(report.message);
        if (last !== undefined) {
          return;
        }
        const parsed = clientErrorReportSchema.safeParse(report);
        if (!parsed.success) {
          return;
        }
        lastSentAt.set(report.message, now);
        // Lost in transit (offline, a 5xx while the server restarts): the next occurrence may retry.
        attempt(options.send, parsed.data).catch(() => {
          lastSentAt.delete(parsed.data.message);
        });
      } catch {
        // Best effort: a broken reporter must not break the page it reports on.
      }
    },
  };
}

/** Starts one send; a failure, thrown or returned as a rejection, comes back as a rejection. */
function attempt(
  send: (report: ClientErrorReport) => Promise<unknown>,
  report: ClientErrorReport,
): Promise<unknown> {
  try {
    return send(report);
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * POSTs one report as JSON. `keepalive` lets it leave while the page is going away. A 5xx (Caddy's
 * 502 while the game server restarts) is a lost send: the next occurrence goes out again.
 */
async function postReport(report: ClientErrorReport): Promise<unknown> {
  const res = await api['client-errors'].$post({ json: report }, { init: { keepalive: true } });
  if (res.status >= 500) {
    throw new Error(`client error report: HTTP ${res.status}`);
  }
  return res;
}

const reporter = createClientErrorReporter({
  send: postReport,
  now: () => performance.now(),
  pathname: () => globalThis.location?.pathname ?? '/',
  build: APP_INFO.version,
});

/** Reports one error to the server. Never throws. */
export function reportClientError(input: ClientErrorInput): void {
  reporter.report(input);
}

/**
 * Reports uncaught errors and unhandled promise rejections for the life of the page. Returns the
 * function that removes both listeners.
 */
export function installGlobalErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => {
    if (!isIgnorableWindowError(event)) {
      reportClientError(errorEventInput(event));
    }
  };
  const onRejection = (event: PromiseRejectionEvent) =>
    reportClientError(rejectionInput(event.reason));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Text of any value for a message. Never throws; `null` and `undefined` give no text. */
function safeText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  try {
    return String(value);
  } catch {
    return '';
  }
}
