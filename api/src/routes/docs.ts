import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { validateResponse, responseSchemas } from '../responses.js';

// Public markdown docs (strategy & reflection prompts), surfaced read-only on the dashboard.
// SECURITY: the :name param is NOT used to build a path. It is a key into a fixed allowlist that maps to
// a known filename. Anything not in the allowlist → 404. This makes path traversal / arbitrary file reads
// impossible — there is no way to reach a file outside this map regardless of the request value.
const DOCS: Record<string, string> = {
  strategy: 'strategy.md',
  reflection: 'reflection.md',
};

// The prompts/ directory lives at the repo root. This file is api/src/routes/docs.ts → up three levels.
const promptsDir = new URL('../../../prompts/', import.meta.url);

export async function registerDocsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/docs/:name', async (req, reply) => {
    const name = (req.params as { name: string }).name;
    const file = Object.prototype.hasOwnProperty.call(DOCS, name) ? DOCS[name] : undefined;
    if (!file) return reply.code(404).send({ error: `unknown doc: ${name}` });
    const content = await readFile(fileURLToPath(new URL(file, promptsDir)), 'utf8');
    return validateResponse(responseSchemas.doc, { name, content }, req.log);
  });
}
