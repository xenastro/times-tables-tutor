// Makes the Arabic voice clips the app plays (public/voice/ar/<VOICE.dir>/*.mp3) with Azure's
// neural text-to-speech. Run once when the set of phrases changes; clips already made are kept.
//
//   node scripts/make-voice.mjs              make missing clips
//   node scripts/make-voice.mjs --count      just say how many there are
//   node scripts/make-voice.mjs --only k1,k2 make (or remake) just these clips
//
// Neural voices pick the case ending of the tens (خمسون / خمسين) from their own guess at the
// grammar, whatever the spelling. So for every clip with a tens word, this listens to the clip
// with Azure's speech recogniser and, if the ending came out wrong, tries the next way of writing
// it (SPELLINGS in src/engine/arabicSpeech.ts). Clips that never come out right, or that the
// recogniser can't make out, are listed in voice-check.txt for a person to listen to.
//
// Needs AZURE_SPEECH.txt (gitignored) in the project root: the key on line 1, the region on line 2.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const RATE = '-10%';

const args = process.argv.slice(2);
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const speech = await vite.ssrLoadModule('/src/engine/arabicSpeech.ts');
await vite.close();
const { VOICE, SPELLINGS } = speech;
const OUT = `public/voice/ar/${VOICE.dir}`;
const keys = speech.allClips();
console.log(`${keys.length} clips (${speech.bilingualClips().length} used by bilingual mode), voice ${VOICE.name}`);
if (args.includes('--count')) process.exit(0);

const [key, region] = readFileSync('AZURE_SPEECH.txt', 'utf8').split(/\r?\n/).map((s) => s.trim());
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST with retries: the free tier allows about 20 requests a minute. */
async function post(url, headers, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, ...headers }, body });
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 12) {
      await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 || 5000 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${await res.text()}`);
  }
}

async function synth(ssmlBody, format) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-SA"><voice name="${VOICE.name}"><prosody rate="${RATE}">${ssmlBody}</prosody></voice></speak>`;
  const res = await post(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    { 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': format, 'User-Agent': 'times-tables-tutor' },
    ssml,
  );
  return Buffer.from(await res.arrayBuffer());
}

/** What Azure's recogniser hears, word for word (no digits). */
async function hear(wav) {
  const res = await post(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-SA&format=detailed`,
    { 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000' },
    wav,
  );
  const j = await res.json();
  return j.NBest?.[0]?.Lexical ?? '';
}

/** The case endings of the tens words, in order: "ون,ين". (\b doesn't work for Arabic letters.) */
const endings = (s) => (s.match(/(ون|ين)(?=[\s؟?.,،]|$)/g) ?? []).join(',');

const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const todo = only ?? keys.filter((k) => !existsSync(`${OUT}/${k}.mp3`));
console.log(`${todo.length} to make`);
if (!existsSync('voice-check.txt')) writeFileSync('voice-check.txt', '');

const save = (clip, mp3) => {
  // Written whole, so a stopped run never leaves half a clip behind.
  writeFileSync(`${OUT}/${clip}.tmp`, mp3);
  renameSync(`${OUT}/${clip}.tmp`, `${OUT}/${clip}.mp3`);
};

let done = 0;
let flagged = 0;
for (const clip of todo) {
  if (!speech.hasTens(clip)) {
    save(clip, await synth(speech.clipSsml(clip), 'audio-24khz-48kbitrate-mono-mp3'));
  } else {
    const want = endings(speech.clipText(clip));
    // Each spelling as it is, then each with the sentence ending changed: a pause written as ؟
    // instead of ، or a full stop at the end. (The same input always gives the same audio, so the
    // clip saved is the one that was heard.)
    const tweak = (ssml) => (ssml.includes('،') ? ssml.replace('،', '؟') : `${ssml}.`);
    const tries = [
      ...SPELLINGS.map((how) => [how, speech.clipSsml(clip, how)]),
      ...SPELLINGS.map((how) => [`${how}+`, tweak(speech.clipSsml(clip, how))]),
    ];
    let chosen = null;
    let unheard = 0;
    for (const [how, ssml] of tries) {
      const heard = endings(await hear(await synth(ssml, 'riff-16khz-16bit-mono-pcm')));
      if (heard === want) {
        chosen = [how, ssml];
        break;
      }
      if (!heard) unheard++;
    }
    save(clip, await synth(chosen ? chosen[1] : speech.clipSsml(clip), 'audio-24khz-48kbitrate-mono-mp3'));
    if (!chosen) {
      flagged++;
      const why = unheard === tries.length ? 'not made out' : 'ending never right';
      appendFileSync('voice-check.txt', `${clip}\t${speech.clipText(clip)}\t${why}\n`);
    } else if (chosen[0] !== 'plain') {
      console.log(`${clip}: ${chosen[0]}`);
    }
  }
  if (++done % 20 === 0) console.log(`${done}/${todo.length}`);
}
writeFileSync(`${OUT}/clips.json`, JSON.stringify({ voice: VOICE.name, clips: keys }) + '\n');
console.log(`done; ${flagged} clips to listen to by ear (voice-check.txt)`);
