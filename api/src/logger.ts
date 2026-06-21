import pino, { type Logger } from 'pino';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// API logger: writes both to stdout (visible in the terminal during `npm run dev`) and to a file (logs always on disk).
// The file defaults to logs/api.log (relative to the project root); overridden by API_LOG_FILE.
// Level is LOG_LEVEL (info by default). Called lazily — in tests we don't create the file stream.
export function createLogger(): Logger {
  const dest = process.env['API_LOG_FILE'] || resolve(process.cwd(), 'logs/api.log');
  mkdirSync(dirname(dest), { recursive: true });
  const streams = [
    { stream: process.stdout },
    { stream: pino.destination({ dest, mkdir: true, sync: false }) },
  ];
  return pino({ level: process.env['LOG_LEVEL'] || 'info' }, pino.multistream(streams));
}
