import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * Silences read-aloud in every page the tests open. Chrome on Windows hands speechSynthesis to
 * the system's own voice, which plays through the speakers even with --mute-audio. The phone
 * still reports its voices; speaking just finishes quietly. (Tests that check what was said
 * install their own pretend engine on top.)
 */
function quietSpeech() {
  const s = window.speechSynthesis;
  if (!s) return;
  s.speak = (u: SpeechSynthesisUtterance) => {
    setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 50);
  };
}

export const test = base.extend<object, { quietBrowser: void }>({
  quietBrowser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        await context.addInitScript(quietSpeech);
        return context;
      };
      await use();
    },
    { scope: 'worker', auto: true },
  ],
  context: async ({ context }, use) => {
    await context.addInitScript(quietSpeech);
    await use(context);
  },
});
