import { Page } from "playwright";
import { log } from "../_host";
import { teamsContinueWithoutMediaSelectors } from "./selectors";

/**
 * Dismiss the Teams audio/video confirmation and observe it becoming hidden.
 * It can cover Join now before a click or appear after submitting it.
 * Join and admission checks share this handler so the visible pre-join button
 * behind the overlay does not trap the bot in a false lobby state.
 *
 * Returns true once the confirmation was clicked and its control is hidden.
 */
export async function dismissTeamsAvConfirmModal(page: Page): Promise<boolean> {
  const selector = teamsContinueWithoutMediaSelectors.join(", ");
  try {
    const btn = page.locator(selector).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5000 });
      log('✅ Dismissed "Continue without audio or video" confirmation modal');
      await btn.waitFor({ state: 'hidden', timeout: 1000 });
      return true;
    }
  } catch (err: any) {
    log(`ℹ️ Could not dismiss AV-confirm modal: ${err?.message || err}`);
  }
  return false;
}

/**
 * True if the Teams AV-confirm modal is currently on screen.
 */
export async function isTeamsAvConfirmModalVisible(page: Page): Promise<boolean> {
  const selector = teamsContinueWithoutMediaSelectors.join(", ");
  return await page.locator(selector).first().isVisible().catch(() => false);
}
