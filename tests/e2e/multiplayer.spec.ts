import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Deux joueurs dans deux navigateurs séparés, avec un serveur de rencontre PeerJS local
 * (pour ne pas dépendre d'Internet) : liste des parties, demande, acceptation,
 * poussière partagée, pièces gagnées par l'invité, ping affiché.
 */
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn('npx', ['peerjs', '--port', '9123', '--path', '/', '--host', '127.0.0.1'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
});
test.afterAll(() => server?.kill());

const URL = '/?debug&quality=minimal&peer=127.0.0.1:9123';
const dust = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __dust: Record<string, (...x: unknown[]) => unknown> }).__dust[f as string](...(a as unknown[])), [fn, args] as const);

test('héberger, voir la partie en ligne, demander, accepter, jouer ensemble', async ({ browser }) => {
  test.setTimeout(300_000);
  const hostCtx = await browser.newContext({ viewport: { width: 1100, height: 650 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1100, height: 650 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(e.message));

  // L'hôte lance le jeu et ouvre sa partie (publique).
  await host.goto(URL);
  await host.waitForSelector('#loading', { state: 'detached', timeout: 120_000 });
  await host.click('.btn-big', { force: true });
  await host.keyboard.press('KeyP');
  await host.fill('.net-profile input', 'Hôte');
  await host.click('text=Ouvrir ma partie', { force: true });
  await expect(host.locator('.net-code strong')).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 30_000 });
  const code = (await host.locator('.net-code strong').textContent())!;
  await host.keyboard.press('KeyP');

  // L'invité ouvre l'écran multijoueur depuis l'écran titre : la partie est dans la liste.
  await guest.goto(URL);
  await guest.waitForSelector('#loading', { state: 'detached', timeout: 120_000 });
  await guest.click('text=👥 Multijoueur', { force: true });
  await guest.fill('.net-profile input', 'Invité');
  await expect(guest.locator('.net-games li')).toContainText('Château de Hôte', { timeout: 40_000 });
  await guest.click('.net-games li button', { force: true });
  await expect(guest.locator('.net-status')).toContainText('attente', { timeout: 20_000 });

  // L'hôte reçoit la demande et l'accepte (touche O).
  await expect(host.locator('.net-request')).toContainText('Invité', { timeout: 20_000 });
  await host.waitForTimeout(1500);
  await host.screenshot({ path: 'test-results/mp-demande.png' });
  await host.keyboard.press('KeyO');

  // L'invité arrive chez l'hôte : liste des joueurs avec le ping.
  await expect(guest.locator('.net-hud')).toContainText('Hôte', { timeout: 20_000 });
  await expect(guest.locator('.net-hud .ping').last()).toHaveText(/\d+ ms/, { timeout: 15_000 });
  await expect(host.locator('.net-hud')).toContainText(code);

  // La poussière des combles est la même des deux côtés (photos de l'hôte).
  await guest.waitForTimeout(4000);
  const hd = (await dust(host, 'dirt', 0)) as Record<string, number>;
  const gd = (await dust(guest, 'dirt', 0)) as Record<string, number>;
  expect(Math.abs(hd.dust - gd.dust)).toBeLessThan(hd.dust * 0.05 + 10);

  // L'invité balaie vers une pelle : il gagne des pièces (comptées avec ses améliorations).
  const before = (await dust(guest, 'coins')) as number;
  await dust(guest, 'teleport', 700, 675, 400, Math.PI / 2, -0.6);
  await dust(guest, 'press', true);
  for (let k = 0; k < 12; k++) {
    await dust(guest, 'teleport', 600 - k * 40, 675 + Math.sin(k) * 60, 400, Math.PI / 2, -0.6);
    await guest.waitForTimeout(400);
  }
  await dust(guest, 'press', false);
  await expect.poll(async () => (await dust(guest, 'coins')) as number, { timeout: 20_000 }).toBeGreaterThan(before);
  await guest.screenshot({ path: 'test-results/mp-invite.png' });
  // On regarde l'autre joueur de près (son avatar, son nom, son balai).
  await dust(guest, 'teleport', 500, 675, 400, Math.PI / 2, -0.4);
  await dust(host, 'teleport', 260, 640, 400, -Math.PI / 2 - 0.1, -0.2);
  await host.waitForTimeout(4000);
  await host.screenshot({ path: 'test-results/mp-hote.png' });

  // L'invité rentre chez lui ; l'hôte voit qu'il est parti.
  await guest.keyboard.press('KeyP');
  await guest.click('text=Rentrer dans mon château', { force: true });
  await expect(host.locator('.net-hud')).not.toContainText('Invité', { timeout: 20_000 });
  expect(errors).toEqual([]);
});
