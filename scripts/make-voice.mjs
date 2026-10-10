// Makes the Arabic voice clips the app plays (public/voice/ar/<VOICE.dir>/*.mp3) with Azure's
// neural text-to-speech. Run once when the set of phrases changes; clips already made are kept.
//
//   node scripts/make-voice.mjs                  make missing clips
//   node scripts/make-voice.mjs --count          just say how many there are
//   node scripts/make-voice.mjs --only k1,k2     make (or remake) just these clips
//   node scripts/make-voice.mjs --remake REGEX   remake the clips whose key matches
//
// What the text says and how it's written for the voice live in src/engine/arabicSpeech.ts.
// No automatic check could tell whether the voice said a tens ending right (speech-to-text,
// pronunciation scores and the voice's own viseme data all missed errors a listener heard), so
// listen to a sample of any new or changed clips before they ship.
//
// Needs AZURE_SPEECH.txt (gitignored) in the project root: the key on line 1, the region on line 2.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const RATE = '-10%';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const speech = await vite.ssrLoadModule('/src/engine/arabicSpeech.ts');
await vite.close();
const { VOICE } = speech;
const OUT = `public/voice/ar/${VOICE.dir}`;
const keys = speech.allClips();
console.log(`${keys.length} clips (${speech.bilingualClips().length} used by bilingual mode), voice ${VOICE.name}`);
if (args.includes('--count')) process.exit(0);

const [key, region] = readFileSync('AZURE_SPEECH.txt', 'utf8').split(/\r?\n/).map((s) => s.trim());
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Synthesises one clip, retrying politely: the free tier allows about 20 requests a minute. */
async function synth(body) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-SA"><voice name="${VOICE.name}"><prosody rate="${RATE}">${body}</prosody></voice></speak>`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'times-tables-tutor',
      },
      body: ssml,
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if ((res.status === 429 || res.status >= 500) && attempt < 12) {
      await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 || 5000 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${await res.text()}`);
  }
}

async function save(clip, mp3) {
  // Written whole, so a stopped run never leaves half a clip behind. On Windows the rename can
  // fail while something (a media player, a virus scanner) has the old file open.
  const tmp = `${OUT}/${clip}.tmp`;
  writeFileSync(tmp, mp3);
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, `${OUT}/${clip}.mp3`);
      return;
    } catch (e) {
      if (e.code !== 'EPERM') throw e;
      if (attempt >= 8) {
        // Still open elsewhere: writing over it in place still works.
        copyFileSync(tmp, `${OUT}/${clip}.mp3`);
        unlinkSync(tmp);
        return;
      }
      await sleep(250);
    }
  }
}

const only = arg('--only')?.split(',');
const remake = arg('--remake') ? new RegExp(arg('--remake')) : null;
const todo = only ?? keys.filter((k) => !existsSync(`${OUT}/${k}.mp3`) || remake?.test(k));
console.log(`${todo.length} to make`);

let done = 0;
for (const clip of todo) {
  await save(clip, await synth(speech.clipSsml(clip)));
  if (++done % 20 === 0) console.log(`${done}/${todo.length}`);
}
writeFileSync(`${OUT}/clips.json`, JSON.stringify({ voice: VOICE.name, clips: keys }) + '\n');
console.log('done');
