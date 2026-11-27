import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createCampaign,
  expectAllSaved,
  expectLive,
  joinCampaign,
  newUser,
  register,
  setField,
  type TestUser,
} from './helpers';

/** Each person gets their own browser context (own cookies), like separate devices. */
const personIn = async (browser: Browser, user: TestUser): Promise<Page> => {
  const page = await (await browser.newContext()).newPage();
  await register(page, user);
  return page;
};

/** A DM with a campaign and one player in it, both on the campaign page and live. */
const party = async (browser: Browser) => {
  const dmUser = newUser('Dungeon Master');
  const playerUser = newUser('Rogue');
  const dm = await personIn(browser, dmUser);
  const player = await personIn(browser, playerUser);
  const code = await createCampaign(dm, 'Realtime Test');
  await expectLive(dm);
  await joinCampaign(player, code);
  await expectLive(player);
  return { dm, player, playerUser };
};

const sheetEditor = (dm: Page) => dm.getByRole('region', { name: /^Edit .*'s sheet$/ });

test.describe('realtime party board', () => {
  test("the DM sees a player join and edit live, and the player sees the DM's edits", async ({
    browser,
  }) => {
    const { dm, player, playerUser } = await party(browser);

    // Joining shows up on the DM's board without a reload.
    const card = dm.getByRole('button', { name: new RegExp(playerUser.displayName) });
    await expect(card).toBeVisible();

    // Player takes damage; the DM's card follows.
    await setField(player, 'Current', '3');
    await expectAllSaved(player);
    await expect(card.getByRole('meter', { name: 'Hit points' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );

    // The DM poisons the player; the player's own sheet follows.
    await card.click();
    const editor = sheetEditor(dm);
    await editor.getByRole('button', { name: 'Poisoned' }).click();
    await expectAllSaved(dm);
    await expect(player.getByRole('button', { name: 'Poisoned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test("a stale save is merged, so neither the DM's nor the player's edit is lost", async ({
    browser,
  }) => {
    const { dm, player, playerUser } = await party(browser);
    await dm.getByRole('button', { name: new RegExp(playerUser.displayName) }).click();
    const editor = sheetEditor(dm);

    // Hold the DM's first save in flight so the player's save lands first and the DM's
    // arrives based on an outdated version (the server answers 409).
    const statuses: number[] = [];
    let held = false;
    await dm.route('**/api/sheets/*', async (route) => {
      if (route.request().method() === 'PUT' && !held) {
        held = true;
        await new Promise((r) => setTimeout(r, 2_000));
      }
      const response = await route.fetch();
      if (route.request().method() === 'PUT') statuses.push(response.status());
      await route.fulfill({ response });
    });

    await editor.getByLabel('Speed (ft)', { exact: true }).fill('40');
    await expect(dm.getByText('Saving…')).toBeVisible();
    await setField(player, 'Background', 'Urchin');
    await expectAllSaved(player);

    await expectAllSaved(dm);
    expect(statuses).toEqual([409, 200]);

    // Both edits are on the server.
    await player.reload();
    await expect(player.getByLabel('Speed (ft)', { exact: true })).toHaveValue('40');
    await expect(player.getByLabel('Background', { exact: true })).toHaveValue('Urchin');
  });
});
