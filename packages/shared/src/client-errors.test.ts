import { describe, expect, it } from 'bun:test';
import {
  CLIENT_ERROR_BUILD_MAX,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_PATH_MAX,
  CLIENT_ERROR_STACK_MAX,
  clientErrorReportSchema,
} from './client-errors.ts';

const report = {
  message: 'Cannot read properties of undefined',
  source: 'boundary' as const,
  path: '/',
};

describe('clientErrorReportSchema', () => {
  it('accepts a report with a message, a source and a path', () => {
    expect(clientErrorReportSchema.parse(report)).toEqual(report);
  });

  it('accepts the stack and the build when they are sent', () => {
    const full = {
      ...report,
      source: 'window' as const,
      stack: 'Error: boom\n    at main.js:1:1',
      build: '0.0.0+1a2b3c4',
    };
    expect(clientErrorReportSchema.parse(full)).toEqual(full);
  });

  it('accepts each of the three sources and no other', () => {
    for (const source of ['boundary', 'window', 'promise']) {
      expect(clientErrorReportSchema.safeParse({ ...report, source }).success).toBe(true);
    }
    expect(clientErrorReportSchema.safeParse({ ...report, source: 'console' }).success).toBe(false);
  });

  it('accepts a message and a stack exactly at their limits and rejects one character more', () => {
    const message = 'm'.repeat(CLIENT_ERROR_MESSAGE_MAX);
    const stack = 's'.repeat(CLIENT_ERROR_STACK_MAX);
    expect(clientErrorReportSchema.safeParse({ ...report, message, stack }).success).toBe(true);
    expect(clientErrorReportSchema.safeParse({ ...report, message: `${message}m` }).success).toBe(
      false,
    );
    expect(clientErrorReportSchema.safeParse({ ...report, stack: `${stack}s` }).success).toBe(
      false,
    );
  });

  it('accepts a path and a build exactly at their limits and rejects one character more', () => {
    const path = `/${'p'.repeat(CLIENT_ERROR_PATH_MAX - 1)}`;
    const build = 'b'.repeat(CLIENT_ERROR_BUILD_MAX);
    expect(clientErrorReportSchema.safeParse({ ...report, path, build }).success).toBe(true);
    expect(clientErrorReportSchema.safeParse({ ...report, path: `${path}p` }).success).toBe(false);
    expect(clientErrorReportSchema.safeParse({ ...report, build: `${build}b` }).success).toBe(
      false,
    );
  });

  it('rejects a path with a query or a hash, so no room code can leave the page', () => {
    for (const path of ['/?room=ABCD', '/#ABCD', '/lobby?code=KRWN', '/a?b#c']) {
      expect({ path, ok: clientErrorReportSchema.safeParse({ ...report, path }).success }).toEqual({
        path,
        ok: false,
      });
    }
  });

  it('rejects a path that is not a pathname: relative, empty or a full URL', () => {
    for (const path of ['', 'game', 'https://bronsie.drkp.dev/']) {
      expect({ path, ok: clientErrorReportSchema.safeParse({ ...report, path }).success }).toEqual({
        path,
        ok: false,
      });
    }
  });

  it('rejects a report without a message, a source or a path', () => {
    const { message: _message, ...noMessage } = report;
    const { source: _source, ...noSource } = report;
    const { path: _path, ...noPath } = report;
    expect(clientErrorReportSchema.safeParse(noMessage).success).toBe(false);
    expect(clientErrorReportSchema.safeParse(noSource).success).toBe(false);
    expect(clientErrorReportSchema.safeParse(noPath).success).toBe(false);
  });

  it('drops fields it does not know, so a nickname sent by mistake is never kept', () => {
    const parsed = clientErrorReportSchema.parse({ ...report, nickname: 'Ola', roomCode: 'ABCD' });
    expect(parsed).toEqual(report);
    expect(parsed).not.toHaveProperty('nickname');
    expect(parsed).not.toHaveProperty('roomCode');
  });
});
