// Minimal structured logger: one JSON line per entry, so logs stay greppable in Docker.
type Level = 'debug' | 'info' | 'warn' | 'error';

const quiet = process.env.LOG_LEVEL === 'silent';

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (quiet) {
    return;
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
