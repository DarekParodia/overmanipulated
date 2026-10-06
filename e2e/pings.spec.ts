import { expect, type Page, test } from '@playwright/test';
import {
  avatarPositions,
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  openPlayer,
  PHONE,
} from './helpers.ts';

test.afterEach(closePlayers);

/**
 * Records every ping bubble the page ever shows (as "ping|text"). A bubble lives only ~2 s, and
 * on a loaded CI machine a software-rendered page may paint once a second, so polling the DOM
 * can miss it; a MutationObserver cannot.
 */
async function recordBubbles(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __pingBubbles: string[] }).__pingBubbles = seen;
    new MutationObserver(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid="ping-bubble"]')) {
        const entry = `${el.dataset.ping}|${el.textContent}`;
        if (!seen.includes(entry)) {
          seen.push(entry);
        }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

function seenBubbles(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __pingBubbles: string[] }).__pingBubbles);
}

test('pings from keyboard and touch show a bubble on the other screen', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'covers both device types in one run');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const phone = await openPlayer(browser, 'Łukasz', PHONE);
  const code = await createRoom(host);
  await joinRoom(phone, code);
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  for (const player of [host, phone]) {
    await expect.poll(async () => Object.keys(await avatarPositions(player)).length).toBe(2);
  }

  await recordBubbles(host.page);
  await recordBubbles(phone.page);

  // Desktop: Q opens the picker, 2 sends "Fałszywka!".
  await host.page.keyboard.press('KeyQ');
  await expect(host.page.getByTestId('ping-picker')).toBeVisible();
  await host.page.keyboard.press('Digit2');
  await expect(host.page.getByTestId('ping-picker')).toBeHidden();
  const onPhone = phone.page.locator('[data-testid="ping-bubble"][data-ping="fake"]');
  await expect.poll(() => seenBubbles(phone.page)).toContain('fake|Fałszywka!');
  await expect(onPhone).toBeHidden({ timeout: 4000 });

  // Phone: the "Sygnał" button opens the picker, a tap sends "Biorę to".
  await phone.page.getByTestId('touch-ping').tap();
  await phone.page.getByTestId('ping-option-mine').tap();
  await expect(phone.page.getByTestId('ping-picker')).toBeHidden();
  const onHost = host.page.locator('[data-testid="ping-bubble"][data-ping="mine"]');
  await expect.poll(() => seenBubbles(host.page)).toContain('mine|Biorę to');
  await expect(onHost).toBeHidden({ timeout: 4000 });

  // Esc closes without sending.
  await host.page.keyboard.press('KeyQ');
  await expect(host.page.getByTestId('ping-picker')).toBeVisible();
  await host.page.keyboard.press('Escape');
  await expect(host.page.getByTestId('ping-picker')).toBeHidden();
});
