/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { claimEaseAi } from './server/vitePlugin';

export default defineConfig(({ mode }) => {
  // '' = load every variable from .env / .env.local, not only the VITE_* ones.
  // That is how GEMINI_API_KEY reaches the server code without ever reaching the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), claimEaseAi(env)],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  };
});
