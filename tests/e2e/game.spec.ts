import { expect, test, type Page } from '@playwright/test';

const SAVE = 'dust-it-alone:save';

async function boot(page: Page, debug = true) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?quality=minimal${debug ? '&debug' : ''}`);
  await expect(page.locator('.btn-big')).toBeVisible({ timeout: 30_000 });
  // On attend la fin de l'écran de chargement (sinon les premiers clics et touches peuvent se perdre).
  await page.waitForSelector('#loading', { state: 'detached', timeout: 120_000 });
  return errors;
}

const dust = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __dust: Record<string, (...x: unknown[]) => unknown> }).__dust[f as string](...(a as unknown[])), [fn, args] as const);

test('l’écran titre s’affiche et le jeu démarre sans erreur', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('h1.logo')).toBeVisible();
  await page.click('.btn-big', { force: true });
  await expect(page.locator('.coins')).toBeVisible();
  await expect(page.locator('.btn-shop')).toBeVisible();
  expect(errors).toEqual([]);
});

test('on gagne des pièces, on achète dans l’arbre, et tout est sauvegardé', async ({ page }) => {
  const errors = await boot(page);
  await page.click('.btn-big', { force: true });
  await dust(page, 'earn', 50_000);
  await dust(page, 'buy', 'broom-wide-1', 2);
  await page.keyboard.press('KeyB');
  await expect(page.locator('.tree-screen')).toBeVisible();
  await page.keyboard.press('KeyB');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE);
  expect(save.tree['broom-wide-1']).toBe(2);
  expect(save.stats.levelsBought).toBe(2);
  await page.reload();
  await expect(page.locator('.btn-big')).toBeVisible({ timeout: 30_000 });
  const again = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE);
  expect(again.tree['broom-wide-1']).toBe(2);
  expect(errors).toEqual([]);
});

test('anti-triche : un argent changé en dehors du jeu est remis à sa vraie valeur', async ({ page }) => {
  const errors = await boot(page);
  await page.click('.btn-big', { force: true });
  await dust(page, 'earn', 500);
  await page.waitForTimeout(1200);
  const real = (await dust(page, 'coins')) as number;
  await dust(page, 'cheatCoins', 1e12);
  await expect.poll(async () => (await dust(page, 'coins')) as number, { timeout: 5000 }).toBe(real);
  await expect(page.locator('.toast').filter({ hasText: 'Argent modifié' })).toBeVisible();
  // La sauvegarde garde la vraie valeur.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).coins, SAVE)).toBeLessThan(1e6);
  expect(errors).toEqual([]);
});

test('clavier AZERTY : la touche M ouvre la carte', async ({ page }) => {
  const errors = await boot(page);
  await page.click('.btn-big', { force: true });
  await expect(page.locator('.coins')).toBeVisible();
  // Sur un clavier AZERTY, la lettre M est à la place du « ; » d'un clavier QWERTY.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'Semicolon' })));
  await expect(page.locator('.map-card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ouvrir une porte avec E', async ({ page }) => {
  const errors = await boot(page);
  await page.click('.btn-big', { force: true });
  await dust(page, 'earn', 1e6);
  // Au pied de l'escalier du donjon, face à la porte de la Galerie.
  await dust(page, 'teleport', -1120, 315, 0, Math.PI / 2, -0.2);
  await expect(page.locator('.door-prompt')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').filter({ hasText: 'Porte ouverte' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE);
  expect(save.rooms.gallery?.unlocked).toBe(true);
  expect(errors).toEqual([]);
});

test('album, carnet et événements', async ({ page }) => {
  const errors = await boot(page);
  await page.click('.btn-big', { force: true });
  await expect(page.locator('.coins')).toBeVisible();
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.album-card')).toBeVisible();
  await page.keyboard.press('KeyJ');
  await page.keyboard.press('KeyK');
  await expect(page.locator('.journal-card')).toBeVisible();
  await page.keyboard.press('KeyK');
  await dust(page, 'teleport', 1200, 1000, 400, 0, -0.75);
  await dust(page, 'event', 'cat');
  await expect(page.locator('.toast').filter({ hasText: 'Patatras' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('réglages : export puis import d’une sauvegarde', async ({ page }) => {
  const errors = await boot(page, false);
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  // Sans « force » : on attend que la fenêtre ait fini son animation d'ouverture avant de cliquer.
  await page.click('.settings-tab:has-text("Sauvegarde")');
  await page.click('.save-buttons .btn:has-text("Copier")');
  const code = await page.locator('.save-code').inputValue();
  expect(code.startsWith('DUST2:')).toBe(true);
  // Un code modifié à la main (triche) est refusé.
  const forged = await page.evaluate((c) => {
    const s = JSON.parse(decodeURIComponent(escape(atob(c.slice(6)))));
    s.coins = 4242;
    return 'DUST2:' + btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  }, code);
  await page.fill('.save-code', forged);
  await page.click('.save-buttons .btn:has-text("Charger ce code")', { force: true });
  await expect(page.locator('.settings-note')).toContainText('refusé');
  // Le vrai code, lui, se recharge.
  await page.fill('.save-code', code);
  await page.click('.save-buttons .btn:has-text("Charger ce code")', { force: true });
  await page.waitForLoadState('load');
  await expect(page.locator('.btn-big')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate((k) => typeof JSON.parse(localStorage.getItem(k)!).sig, SAVE)).toBe('string');
  // Modifier la sauvegarde dans le navigateur ne marche pas non plus : le jeu reprend la version valide.
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)!);
    s.coins = 999999;
    localStorage.setItem(k, JSON.stringify(s));
  }, SAVE);
  await page.reload();
  await page.waitForSelector('#loading', { state: 'detached', timeout: 120_000 });
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k + ':backup') ?? localStorage.getItem(k)!).coins, SAVE)).not.toBe(999999);
  expect(errors).toEqual([]);
});
