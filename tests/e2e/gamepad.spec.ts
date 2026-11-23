import { expect, test, type Page } from '@playwright/test';

/**
 * On branche une fausse manette Xbox dans le navigateur (l'API Gamepad est simulée)
 * et on joue uniquement avec elle : menus, déplacement, arbre, pause.
 */
const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9 } as const;

async function press(page: Page, b: keyof typeof BUTTON) {
  await page.evaluate((i) => {
    const p = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad;
    p.buttons[i].pressed = true;
    p.buttons[i].value = 1;
  }, BUTTON[b]);
  await page.waitForTimeout(450);
  await page.evaluate((i) => {
    const p = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad;
    p.buttons[i].pressed = false;
    p.buttons[i].value = 0;
  }, BUTTON[b]);
  await page.waitForTimeout(300);
}

async function stick(page: Page, axes: number[]) {
  await page.evaluate((a) => {
    (window as unknown as { __pad: { axes: number[] } }).__pad.axes = a;
  }, axes);
}

const pos = async (page: Page) => {
  const t = (await page.locator('.debug').textContent()) ?? '';
  const m = /pos (-?\d+),(-?\d+),(-?\d+)/.exec(t);
  return m ? { x: Number(m[1]), z: Number(m[3]) } : { x: 0, z: 0 };
};

test('jouer à la manette : menus, déplacement, arbre, pause', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const pad = {
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad], configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&quality=minimal');
  await page.waitForSelector('#loading', { state: 'detached', timeout: 120_000 });

  // Écran titre : la manette choisit un bouton (il s'illumine), on descend jusqu'à « Jouer ».
  await press(page, 'a');
  await expect(page.locator('.pad-focus')).toHaveCount(1);
  for (let k = 0; k < 14 && !(await page.locator('.btn-big.pad-focus').count()); k++) {
    await stick(page, [0, 0.95, 0, 0]);
    await page.waitForTimeout(250);
    await stick(page, [0, 0, 0, 0]);
    await page.waitForTimeout(300);
  }
  await expect(page.locator('.btn-big.pad-focus')).toHaveCount(1);
  await press(page, 'a');
  await expect(page.locator('.hud')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // Stick gauche vers l'avant : Plume avance.
  const p0 = await pos(page);
  await stick(page, [0, -1, 0, 0]);
  await page.waitForTimeout(1200);
  await stick(page, [0, 0, 0, 0]);
  const p1 = await pos(page);
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(60);

  // Y : l'arbre ; B : on le ferme.
  await page.waitForTimeout(500);
  await press(page, 'y');
  await page.screenshot({ path: 'test-results/manette-y.png' });
  await expect(page.locator('.tree-screen')).toBeVisible();
  await press(page, 'b');
  await expect(page.locator('.tree-screen')).toHaveCount(0);

  // Menu : pause (avec les commandes de la manette) ; B : on reprend.
  await press(page, 'menu');
  await expect(page.locator('.pause-card')).toBeVisible();
  await expect(page.locator('.pad-controls')).toContainText('Manette Xbox');
  await page.screenshot({ path: 'test-results/manette-pause.png' });
  await press(page, 'b');
  await expect(page.locator('.pause-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});
