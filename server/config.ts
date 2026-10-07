// Server-side settings. This code runs in Node (inside the Vite dev server), never in the browser.

/**
 * "-latest" always points at Google's current Flash model, so the app keeps working when Google
 * retires an old version. Pin a specific one (e.g. GEMINI_MODEL=gemini-3.8-flash) once you have
 * rehearsed your demo, so nothing changes under you on the day.
 */
export const DEFAULT_MODEL = 'gemini-flash-latest';

/** Tried in order when the main model is overloaded or out of free quota (each model has its own quota). */
export const DEFAULT_FALLBACK_MODELS = ['gemini-flash-lite-latest'];

export interface AiConfig {
  /** Empty string means "no key": the AI features answer with clearly-labelled demo data. */
  apiKey: string;
  model: string;
  fallbackModels: string[];
}

/**
 * `env` is whatever Vite loaded from .env / .env.local (see vite.config.ts).
 * A key exported in the terminal works too. GOOGLE_API_KEY is accepted as an alias.
 */
export function resolveConfig(env: Record<string, string | undefined>): AiConfig {
  const pick = (name: string) => (env[name] || process.env[name] || '').trim();
  const fallbacks = pick('GEMINI_FALLBACK_MODELS');
  return {
    apiKey: pick('GEMINI_API_KEY') || pick('GOOGLE_API_KEY'),
    model: pick('GEMINI_MODEL') || DEFAULT_MODEL,
    fallbackModels: fallbacks ? fallbacks.split(',').map((m) => m.trim()).filter(Boolean) : DEFAULT_FALLBACK_MODELS,
  };
}
