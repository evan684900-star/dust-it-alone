import { defineConfig } from '@playwright/test';

/** Tests de bout en bout : le vrai jeu dans un vrai navigateur (WebGL logiciel). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    // Version spéciale pour les tests : le mode ?debug y est activé (jamais mise en ligne).
    command: 'VITE_DEBUG=1 npx vite build --outDir dist-test --emptyOutDir && npx vite preview --outDir dist-test --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
