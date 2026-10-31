import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { joinMicrosoftTeams } from './join';
import { setHooks } from '../_host';

// Real Chromium actionability: an overlay intercepts the join click.
const modes = ['direct', 'browser-choice', 'before-click', 'during-click', 'after-click', 'optional-absent', 'slow-ready', 'disabled-join', 'audio-permission', 'audio-unavailable'];
function fixture(mode: string): string {
  return `<!doctype html>
    <main id="controls">
      <button aria-label="Turn off camera" onclick="this.setAttribute('aria-label','Turn on camera')">Camera</button>
      <input placeholder="Your name">
      <audio></audio><button id="join">Join now</button>
    </main>
    <div id="modal" style="display:none;position:fixed;inset:0;background:white;z-index:10">
      <button id="dismiss">Continue without audio or video</button>
    </div>
    <script>
      const mode = ${JSON.stringify(mode)};
      window.joinClicks = 0; window.dismissClicks = 0; window.mediaRequests = [];
      const controls = document.querySelector('#controls');
      const modal = document.querySelector('#modal');
      const join = document.querySelector('#join');
      if (mode === 'audio-permission' || mode === 'audio-unavailable') {
        controls.style.display = 'none';
        const gate = document.createElement('p');
        gate.id = 'permission-gate';
        gate.textContent = 'Select Allow to let Microsoft Teams use your mic and camera';
        document.body.append(gate);
        navigator.mediaDevices.getUserMedia = async constraints => {
          window.mediaRequests.push(constraints);
          if (constraints.video || mode === 'audio-unavailable') {
            if (mode === 'audio-unavailable') modal.style.display = 'block';
            throw new DOMException('Requested device not found', 'NotFoundError');
          }
          gate.remove(); controls.style.display = '';
          return { getTracks: () => [{ stop() {} }] };
        };
      }
      if (mode === 'optional-absent') {
        document.querySelector('input').remove();
        document.querySelector('[aria-label]').remove();
      }
      if (mode === 'browser-choice' || mode === 'slow-ready') {
        controls.style.display = 'none';
        if (mode === 'browser-choice') {
          const button = document.createElement('button');
          button.textContent = 'Continue on this browser';
          button.onclick = () => { button.remove(); controls.style.display = ''; };
          document.body.insertBefore(button, controls);
        } else setTimeout(() => controls.style.display = '', 1200);
      }
      const audio = document.querySelector('audio');
      audio.play = () => Promise.resolve();
      new MutationObserver(() => {
        if (mode === 'before-click' && !window.dismissClicks) modal.style.display = 'block';
      }).observe(audio, { attributes: true });
      join.addEventListener('pointerover', () => {
        if (mode === 'during-click' && !window.dismissClicks) modal.style.display = 'block';
      });
      document.querySelector('#dismiss').onclick = () => {
        window.dismissClicks++;
        modal.style.display = 'none';
        if (mode === 'audio-unavailable') {
          document.querySelector('#permission-gate').remove();
          controls.style.display = '';
        }
      };
      if (mode === 'disabled-join') {
        join.disabled = true;
        setTimeout(() => join.disabled = false, 1200);
      }
      join.onclick = () => {
        window.joinClicks++;
        if (mode === 'after-click' && window.joinClicks === 1) {
          setTimeout(() => modal.style.display = 'block', 150);
          return;
        }
        join.remove();
        const leave = document.createElement('button');
        leave.id = 'hangup-button'; leave.textContent = 'Leave';
        document.body.append(leave);
      };
    </script>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  setHooks({ onState: () => {} });
  let failures = 0;
  try {
    for (const mode of modes.filter(mode => !process.env.TEAMS_JOIN_FIXTURE || mode === process.env.TEAMS_JOIN_FIXTURE)) {
      const page = await browser.newPage();
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture(mode) }));
      const start = Date.now();
      let navigationDone = start;
      page.once('domcontentloaded', () => { navigationDone = Date.now(); });
      try {
        await joinMicrosoftTeams(page, 'https://teams.microsoft.com/meet/fixture', 'Timing Bot', { platform: 'teams' });
        const elapsedMs = Date.now() - start;
        const navigationMs = navigationDone - start;
        const joinHandlingMs = Date.now() - navigationDone;
        const observed = await page.evaluate(() => ({
          joined: !!document.querySelector('#hangup-button'),
          joinClicks: (window as any).joinClicks,
          dismissClicks: (window as any).dismissClicks,
          name: (document.querySelector('input') as HTMLInputElement)?.value,
          camera: document.querySelector('[aria-label]')?.getAttribute('aria-label'),
          mediaRequests: (window as any).mediaRequests,
        }));
        console.log(JSON.stringify({ mode, elapsedMs, navigationMs, joinHandlingMs, ...observed }));
        assert.equal(observed.joined, true, mode + ': enter the meeting');
        assert.equal(observed.joinClicks, mode === 'after-click' ? 2 : 1, mode + ': join count');
        assert.equal(observed.dismissClicks, mode.includes('click') || mode === 'audio-unavailable' ? 1 : 0, mode + ': modal count');
        if (mode === 'audio-permission' || mode === 'audio-unavailable') {
          assert.deepEqual(observed.mediaRequests, [{ audio: true }], mode + ': no camera dependency');
        }
        if (mode !== 'optional-absent') {
          assert.equal(observed.name, 'Timing Bot');
          assert.equal(observed.camera, 'Turn on camera');
        }
        // A regression guard for the 10s/30s stalls, not a live Teams latency SLA.
        // Keep margin for Chromium scheduling on a shared development machine.
        assert.ok(joinHandlingMs < 10000, mode + ': join handling must avoid long timeout stalls');
      } catch (error) {
        failures++;
        console.error(mode, error);
      } finally {
        await page.close();
      }
    }
  } finally {
    setHooks({});
    await browser.close();
  }
  assert.equal(failures, 0, 'browser fixture failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
