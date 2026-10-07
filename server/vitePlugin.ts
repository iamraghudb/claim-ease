import type { Plugin } from 'vite';
import { resolveConfig } from './config';
import { createGemini } from './gemini';
import { createHandlers } from './handlers';
import { createAiMiddleware } from './http';

/**
 * Adds the /api/ai/* endpoints to the Vite dev server (`npm run dev`) and to `npm run preview`.
 * The API key is read here, in Node, and is never sent to the browser.
 */
export function claimEaseAi(env: Record<string, string | undefined>): Plugin {
  const config = resolveConfig(env);
  const handlers = createHandlers({ complete: config.apiKey ? createGemini(config) : null, model: config.model });
  const middleware = createAiMiddleware(handlers);
  const mode = config.apiKey ? `Gemini (${config.model})` : 'demo mode (no GEMINI_API_KEY found; add it to .env.local)';

  return {
    name: 'claimease-ai',
    configureServer(server) {
      server.middlewares.use('/api/ai', middleware);
      server.config.logger.info(`  AI: ${mode}`);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', middleware);
      server.config.logger.info(`  AI: ${mode}`);
    },
  };
}
