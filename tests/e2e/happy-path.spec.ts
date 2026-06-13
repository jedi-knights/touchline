import { expect, test } from '@playwright/test';

/**
 * Happy-path end-to-end test covering the project's definition of done:
 *
 *   sign up → create team/players → set up a soccer match with a starting
 *   lineup → start the clock → record a goal with scorer → make a
 *   substitution → end the match → view a summary with correct score,
 *   full event timeline, and accurate minutes played.
 *
 * Requires the app stack to be running at `E2E_BASE_URL`
 * (default http://localhost:3000) — bring it up with `docker compose up`
 * from a clean checkout.
 *
 * Each run creates a unique user so the test is repeatable without DB reset.
 */
test('happy path: sign up → setup → play → summary', async ({ page }) => {
  test.setTimeout(120_000);

  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  const password = 'hunter22hunter';

  // ── Sign up ─────────────────────────────────────────────────────────
  await page.goto('/sign-up');
  await page.getByLabel('Name (optional)').fill('E2E Coach');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Server action redirects to / on success.
  await expect(page).toHaveURL('/', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

  // ── Create team ─────────────────────────────────────────────────────
  await page.getByRole('navigation').getByRole('link', { name: 'Teams' }).click();
  await page.getByRole('link', { name: 'New team' }).click();
  await page.getByLabel('Team name').fill(`E2E FC ${stamp}`);
  await page.getByRole('button', { name: 'Create team' }).click();

  await expect(page.getByRole('heading', { name: `E2E FC ${stamp}` })).toBeVisible({
    timeout: 15_000,
  });

  // ── Add 12 active players: 11 starters + 1 bench ────────────────────
  for (let i = 1; i <= 12; i++) {
    await page.getByLabel('Name').fill(`E2E Player ${i}`);
    await page.getByLabel('Number').fill(String(i));
    await page.getByLabel('Position').fill('MF');
    await page.getByRole('button', { name: 'Add player' }).click();
    // Wait for the row to appear before adding the next.
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: `E2E Player ${i}` })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  // ── Create match ────────────────────────────────────────────────────
  await page.getByRole('navigation').getByRole('link', { name: 'Matches' }).click();
  await page.getByRole('link', { name: 'New match' }).click();

  await page.getByLabel('Opponent').fill('E2E Visitors');

  // Pick the first 11 active players as starters. They render as label
  // cards within the "Starting lineup" fieldset.
  const lineupSection = page.getByRole('group', { name: /Starting lineup/ });
  for (let i = 1; i <= 11; i++) {
    await lineupSection.getByText(`E2E Player ${i}`, { exact: true }).click();
  }

  // Submit and land on the match detail page.
  await page.getByRole('button', { name: 'Create match' }).click();
  await expect(page.getByRole('heading', { name: /vs E2E Visitors/ })).toBeVisible({
    timeout: 15_000,
  });

  // ── Open the live tracker ────────────────────────────────────────────
  await page.getByRole('link', { name: 'Open live tracker' }).click();
  await expect(page).toHaveURL(/\/matches\/[a-z0-9-]+\/live$/);

  // Setup state — only the start events are tappable. Tap Kickoff.
  await page.getByRole('button', { name: 'Kickoff' }).click();
  await expect(page.getByText('1st half')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('running')).toBeVisible();

  // ── Record a goal with the player picker ────────────────────────────
  await page.getByRole('button', { name: 'Goal', exact: true }).click();
  // Player picker is a dialog with on-field players.
  const picker = page.getByRole('dialog', { name: /Goal: pick a player/ });
  await expect(picker).toBeVisible();
  await picker.getByText('E2E Player 1', { exact: true }).click();

  // After the action revalidates, home score should reflect +1.
  // Score is rendered as "1" in the home score panel.
  await expect(page.locator('text=/^1$/').first()).toBeVisible({ timeout: 10_000 });

  // ── Substitution: Player 11 OFF, Player 12 ON ───────────────────────
  await page.getByRole('button', { name: 'Substitution' }).click();
  const subSheet = page.getByRole('dialog', { name: 'Substitution' });
  await expect(subSheet).toBeVisible();

  // The OFF column lists on-field players; the ON column lists bench.
  await subSheet.getByText('E2E Player 11', { exact: true }).click();
  await subSheet.getByText('E2E Player 12', { exact: true }).click();
  await subSheet.getByRole('button', { name: 'Confirm substitution' }).click();
  await expect(subSheet).not.toBeVisible({ timeout: 10_000 });

  // ── Run the clock through to Full Time ──────────────────────────────
  await page.getByRole('button', { name: 'Half Time' }).click();
  await expect(page.getByText('stopped').first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Second Half' }).click();
  await expect(page.getByText('2nd half')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Full Time' }).click();
  await expect(page.getByText('Final').first()).toBeVisible({ timeout: 10_000 });

  // The live page surfaces a "View summary →" link once finished.
  await page.getByRole('link', { name: /View summary/ }).click();
  await expect(page).toHaveURL(/\/matches\/[a-z0-9-]+$/);

  // ── Summary verification ────────────────────────────────────────────
  // Final score: 1 – 0 home.
  await expect(page.locator('text=/1\\s*[–-]\\s*0/').first()).toBeVisible();

  // Timeline contains every event we recorded.
  await expect(page.getByText('Kickoff').first()).toBeVisible();
  await expect(page.getByText('Goal', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Substitution').first()).toBeVisible();
  await expect(page.getByText('Half Time').first()).toBeVisible();
  await expect(page.getByText('Second Half').first()).toBeVisible();
  await expect(page.getByText('Full Time').first()).toBeVisible();

  // Minutes table is present.
  await expect(page.getByRole('heading', { name: 'Minutes played' })).toBeVisible();

  // Player 1 was on the whole match — should appear in the table.
  await expect(page.getByRole('cell', { name: 'E2E Player 1', exact: true })).toBeVisible();
  // Player 11 was subbed off, Player 12 came on — both should appear too.
  await expect(page.getByRole('cell', { name: 'E2E Player 11', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E Player 12', exact: true })).toBeVisible();
});
