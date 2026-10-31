import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { joinMicrosoftTeams } from './join';
import { setHooks } from '../_host';

// Local DOM fixtures exercise real Playwright actionability without a Teams connection.
const fixture = (mode: string) => [
  '<!doctype html>',
  '<button onclick="this.remove()">Continue on this browser</button>',
  '<button aria-label="Turn off camera">Camera</button>',
  '<input placeholder="Your name"><audio></audio>',
  '<button id="join">Join now</button>',
  '<div id="modal" role="dialog" style="display:none;position:fixed;inset:0;background:white;z-index:9">',
  '<button id="dismiss">Continue without audio or video</button></div>',
  '<script>',
  'const mode = ' + JSON.stringify(mode) + ';',
  'window.joinClicks = 0; window.dismissClicks = 0;',
  'const modal = document.querySelector("#modal");',
  'const audio = document.querySelector("audio");',
  'audio.play = () => Promise.resolve();',
  'new MutationObserver(() => {',
  '  if (mode === "before-click" && !window.dismissClicks) modal.style.display = "block";',
  '}).observe(audio, { attributes: true, attributeFilter: ["data-vexa-touched"] });',
  'document.querySelector("#dismiss").onclick = () => {',
  '  window.dismissClicks++; modal.style.display = "none";',
  '};',
  'document.querySelector("#join").onclick = () => {',
  '  window.joinClicks++;',
  '  if (mode === "after-click" && window.joinClicks === 1) {',
  '    modal.style.display = "block"; return;',
  '  }',
  '  document.querySelector("#join").remove();',
  '  const leave = document.createElement("button");',
  '  leave.id = "hangup-button"; leave.textContent = "Leave"; document.body.append(leave);',
  '};',
  '</script>',
].join('\n');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  let failed = false;
  setHooks({ onState: () => {} });
  try {
    for (const mode of ['before-click', 'none', 'after-click']) {
      const page = await browser.newPage();
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture(mode) }));
      const started = Date.now();
      await joinMicrosoftTeams(page, 'https://teams.microsoft.com/meet/fixture', 'Test Bot', { platform: 'teams' });
      const elapsedMs = Date.now() - started;
      const observed = await page.evaluate(() => ({
        joined: !!document.querySelector('#hangup-button'),
        joinClicks: (window as any).joinClicks,
        dismissClicks: (window as any).dismissClicks,
      }));
      console.log(JSON.stringify({ mode, elapsedMs, ...observed }));
      try {
        assert.equal(observed.joined, true, mode + ': actual join control must be clicked');
        assert.equal(observed.dismissClicks, mode === 'none' ? 0 : 1, mode + ': dismiss only the AV modal');
        assert.equal(observed.joinClicks, mode === 'after-click' ? 2 : 1, mode + ': no duplicate joins');
        assert.ok(elapsedMs < 10000, mode + ': fixture must finish without a click timeout');
      } catch (error) {
        failed = true;
        console.error(error);
      } finally {
        await page.close();
      }
    }
  } finally {
    setHooks({});
    await browser.close();
  }
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
