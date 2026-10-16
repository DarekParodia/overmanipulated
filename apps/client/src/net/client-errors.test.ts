import { describe, expect, it } from 'bun:test';
import {
  CLIENT_ERROR_BUILD_MAX,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_PATH_MAX,
  CLIENT_ERROR_STACK_MAX,
  type ClientErrorReport,
  clientErrorReportSchema,
} from '@redakcja/shared';
import {
  buildReport,
  CLIENT_ERROR_DEDUPE_MS,
  createClientErrorReporter,
  describeError,
  errorEventInput,
  installGlobalErrorReporting,
  isIgnorableWindowError,
  pathnameOnly,
  rejectionInput,
  truncateText,
  UNKNOWN_ERROR_MESSAGE,
} from './client-errors.ts';

const page = { pathname: '/', build: '0.0.0+1a2b3c4' };

describe('truncateText', () => {
  it('leaves text within the limit alone', () => {
    expect(truncateText('krótki', 10)).toBe('krótki');
    expect(truncateText('dokładnie', 9)).toBe('dokładnie');
  });

  it('cuts to the limit in UTF-16 units, the unit the schema counts', () => {
    expect(truncateText('abcdefgh', 5)).toBe('abcde');
    expect(truncateText('ą'.repeat(10), 4)).toBe('ąąąą');
  });

  it('never leaves half of a surrogate pair at the end', () => {
    // '😀' is two UTF-16 units; cutting after the high half would send a lone surrogate.
    const cut = truncateText('aaaa😀', 5);
    expect(cut).toBe('aaaa');
    expect(cut.length).toBeLessThanOrEqual(5);
  });
});

describe('pathnameOnly', () => {
  it('keeps the pathname and drops the query and the hash', () => {
    expect(pathnameOnly('/')).toBe('/');
    expect(pathnameOnly('/?room=ABCD')).toBe('/');
    expect(pathnameOnly('/lobby/x?code=KRWN#top')).toBe('/lobby/x');
    expect(pathnameOnly('/a#ABCD')).toBe('/a');
  });

  it('falls back to / for a value that is not a path', () => {
    expect(pathnameOnly('')).toBe('/');
    expect(pathnameOnly('game')).toBe('/');
  });
});

describe('describeError', () => {
  it('takes the message and the stack of an Error', () => {
    const error = new Error('Nie ma redakcji');
    const { message, stack } = describeError(error);
    expect(message).toBe('Nie ma redakcji');
    expect(stack).toBe(error.stack);
  });

  it('falls back to the error name when the message is empty', () => {
    expect(describeError(new TypeError('')).message).toBe('TypeError');
  });

  it('takes the text of anything else and no stack', () => {
    expect(describeError('boom')).toEqual({ message: 'boom' });
    expect(describeError(42)).toEqual({ message: '42' });
    expect(describeError(undefined)).toEqual({ message: '' });
    expect(describeError(null)).toEqual({ message: '' });
  });

  it('never throws, even for a value whose text cannot be made', () => {
    const hostile = {
      toString() {
        throw new Error('no text here');
      },
    };
    expect(describeError(hostile)).toEqual({ message: '' });
  });

  it('keeps the report going when an error object throws on read', () => {
    const broken = new Error('x');
    Object.defineProperty(broken, 'message', {
      get() {
        throw new Error('getter');
      },
    });
    expect(describeError(broken)).toEqual({ message: '' });
  });
});

describe('isIgnorableWindowError', () => {
  it('recognises a cross-origin script error: "Script error." with no error object', () => {
    expect(isIgnorableWindowError({ message: 'Script error.', error: null })).toBe(true);
    expect(isIgnorableWindowError({ message: 'Script error.', error: undefined })).toBe(true);
  });

  it('recognises the ResizeObserver notice, which names no failure', () => {
    const notice = 'ResizeObserver loop completed with undelivered notifications.';
    expect(isIgnorableWindowError({ message: notice, error: null })).toBe(true);
  });

  it('keeps every other error, with or without an error object', () => {
    expect(isIgnorableWindowError({ message: 'Script error.', error: new Error('x') })).toBe(false);
    expect(isIgnorableWindowError({ message: 'Uncaught TypeError', error: null })).toBe(false);
  });
});

describe('installGlobalErrorReporting', () => {
  it('listens for window errors and unhandled rejections, and removes both on cleanup', () => {
    // A stand-in for `window`'s listener methods only; the page's own DOM is not needed here.
    const added: string[] = [];
    const removed: string[] = [];
    Object.defineProperty(globalThis, 'window', {
      value: {
        addEventListener: (type: string) => {
          added.push(type);
        },
        removeEventListener: (type: string) => {
          removed.push(type);
        },
      },
      configurable: true,
    });
    try {
      const cleanup = installGlobalErrorReporting();
      expect(added).toEqual(['error', 'unhandledrejection']);
      cleanup();
      expect(removed).toEqual(['error', 'unhandledrejection']);
    } finally {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

describe('error inputs', () => {
  it('reads an uncaught error event as a window error, from its error object', () => {
    const error = new Error('e2e window error');
    const input = errorEventInput({ message: 'Uncaught Error', error });
    expect(input.message).toBe('e2e window error');
    expect(input.stack).toBe(error.stack);
    expect(input.source).toBe('window');
  });

  it('falls back to the event message when the event carries no error object', () => {
    expect(errorEventInput({ message: 'Script error.', error: undefined })).toEqual({
      message: 'Script error.',
      source: 'window',
    });
  });

  it('reads a rejection as a promise error', () => {
    expect(rejectionInput(new RangeError('zła liczba'))).toEqual({
      message: 'zła liczba',
      stack: expect.any(String),
      source: 'promise',
    });
    expect(rejectionInput('odrzucone')).toEqual({ message: 'odrzucone', source: 'promise' });
  });
});

describe('buildReport', () => {
  it('cuts every field to its schema limit and passes the schema', () => {
    const report = buildReport(
      {
        message: 'm'.repeat(CLIENT_ERROR_MESSAGE_MAX + 50),
        stack: 's'.repeat(CLIENT_ERROR_STACK_MAX + 50),
        source: 'boundary',
      },
      { pathname: `/${'p'.repeat(CLIENT_ERROR_PATH_MAX + 50)}`, build: 'b'.repeat(90) },
    );
    expect(report.message).toHaveLength(CLIENT_ERROR_MESSAGE_MAX);
    expect(report.stack).toHaveLength(CLIENT_ERROR_STACK_MAX);
    expect(report.path).toHaveLength(CLIENT_ERROR_PATH_MAX);
    expect(report.build).toHaveLength(CLIENT_ERROR_BUILD_MAX);
    expect(clientErrorReportSchema.safeParse(report).success).toBe(true);
  });

  it('sends the pathname only, whatever the page URL held', () => {
    const report = buildReport(
      { message: 'boom', source: 'window' },
      { pathname: '/?room=ABCD', build: '0.0.0+dev' },
    );
    expect(report.path).toBe('/');
    expect(report).not.toHaveProperty('stack');
  });

  it('uses a stand-in message when the error has no text', () => {
    const report = buildReport({ message: '', source: 'promise' }, page);
    expect(report.message).toBe(UNKNOWN_ERROR_MESSAGE);
  });
});

describe('createClientErrorReporter', () => {
  /** A reporter on a clock the test moves by hand; `sent` collects every payload sent. */
  function fakeReporter(pathname = '/') {
    const sent: ClientErrorReport[] = [];
    let time = 0;
    const reporter = createClientErrorReporter({
      send: async (report) => {
        sent.push(report);
        return undefined;
      },
      now: () => time,
      pathname: () => pathname,
      build: '0.0.0+1a2b3c4',
    });
    return {
      reporter,
      sent,
      at(ms: number) {
        time = ms;
      },
    };
  }

  it('sends a new message once, with its source and the build', () => {
    const { reporter, sent } = fakeReporter('/');
    reporter.report({ message: 'Cannot read properties', source: 'boundary' });
    expect(sent).toEqual([
      { message: 'Cannot read properties', source: 'boundary', path: '/', build: '0.0.0+1a2b3c4' },
    ]);
  });

  it('drops an identical message within 60 seconds and sends it again after', () => {
    const { reporter, sent, at } = fakeReporter();
    at(0);
    reporter.report({ message: 'render loop', source: 'boundary' });
    at(CLIENT_ERROR_DEDUPE_MS - 1);
    reporter.report({ message: 'render loop', source: 'window' });
    expect(sent).toHaveLength(1);
    at(CLIENT_ERROR_DEDUPE_MS);
    reporter.report({ message: 'render loop', source: 'boundary' });
    expect(sent).toHaveLength(2);
  });

  it('keeps distinct messages apart', () => {
    const { reporter, sent, at } = fakeReporter();
    at(0);
    reporter.report({ message: 'one', source: 'window' });
    reporter.report({ message: 'two', source: 'window' });
    expect(sent.map((r) => r.message)).toEqual(['one', 'two']);
  });

  it('lets the next occurrence through when the send was lost', async () => {
    const sent: ClientErrorReport[] = [];
    const reporter = createClientErrorReporter({
      send: async (report) => {
        sent.push(report);
        if (sent.length === 1) {
          throw new Error('offline');
        }
        return undefined;
      },
      now: () => 0,
      pathname: () => '/',
      build: 'dev',
    });
    reporter.report({ message: 'lost', source: 'window' });
    // The failed send settles in a microtask; the next occurrence then finds nothing recorded.
    await new Promise((resolve) => setTimeout(resolve, 0));
    reporter.report({ message: 'lost', source: 'window' });
    expect(sent.map((r) => r.message)).toEqual(['lost', 'lost']);
  });

  it('never throws when the send fails, synchronously or asynchronously', async () => {
    const throwing = createClientErrorReporter({
      send: () => {
        throw new Error('offline');
      },
      now: () => 0,
      pathname: () => '/',
      build: 'dev',
    });
    expect(() => throwing.report({ message: 'x', source: 'window' })).not.toThrow();

    const rejecting = createClientErrorReporter({
      send: () => Promise.reject(new Error('offline')),
      now: () => 0,
      pathname: () => '/',
      build: 'dev',
    });
    expect(() => rejecting.report({ message: 'y', source: 'promise' })).not.toThrow();
    // Let the rejected send settle; the handler swallows it, so nothing is left unhandled.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
