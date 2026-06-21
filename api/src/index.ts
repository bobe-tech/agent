import { buildServer } from './server.js';
import { getPool } from '../../core/db.js';

const port = Number(process.env['API_PORT']) || 3001;
// Bind to loopback by default — the API is unauthenticated and read-only, so it must not be
// exposed directly. Put a reverse proxy (with TLS/auth) in front and set API_HOST=0.0.0.0 there.
const host = process.env['API_HOST'] || '127.0.0.1';
const app = buildServer();

app
  .listen({ port, host })
  .then(() => console.log(`api listening on ${host}:${port}`))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });

// Graceful shutdown: on a deploy/restart signal (SIGTERM from systemd/Docker, SIGINT from Ctrl-C)
// we stop accepting requests, wait for in-flight ones (app.close), close the DB pool, and exit.
// Safety timeout with unref(): if shutdown hangs, force the exit without blocking the restart.
let shuttingDown = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    setTimeout(() => process.exit(1), 10_000).unref();
    try {
      await app.close();
      await getPool().end();
      process.exit(0);
    } catch (e) {
      console.error('error during shutdown:', e);
      process.exit(1);
    }
  });
}
