# Times Tables Tutor — Product Spec

> **Status:** v0.2 · 2026-10-10 · first release live at math.aburaddad.com
> **Name:** placeholder. Our first learner will choose the real name after trying the app.

## 1. Goal

Help children build lasting, low-stress fluency with the multiplication tables. The first learner is a lower-secondary student (IGCSE track) who has struggled with times tables for years. A younger sibling in early primary is second. If the app works, other families may use it later.

**First release:** get our first learner practising daily on their phone, with a parent dashboard that shows real progress.

**Not in scope for the first release:** other maths topics, the Arabic module, public sign-up, and the full beginner path for young learners (see §9).

## 2. Learning principles

These rules apply to every design decision.

1. **Shrink the job.** 3×7 and 7×3 count as one fact, so 10×10 is **55 facts**. ×0, ×1 and ×10 are taught as rules. ×2, ×5 and ×9 are taught as patterns. That leaves about 15 genuinely hard facts, and the app says so.
2. **A strategy before memorising.** Each hard fact comes with a way to work it out: ×4 is double-double, ×8 is double-double-double, ×6 is ×5 plus one group, ×3 is ×2 plus one group, and 7×8 = 56 is "5, 6, 7, 8". Strategies are taught as step-by-step guides with bar models (§4.6), never as grids of dots too big to count.
3. **Mostly success.** New facts are mixed in among facts she already knows (incremental rehearsal, roughly 1 new to 8 known). The target success rate in a session is **85% or more**. If accuracy drops, the session stops adding new facts.
4. **Spaced repetition per fact.** Each fact moves through levels with growing review gaps (§4.3).
5. **Speed is measured, never shown.** There are no countdowns and no "beat the clock". Response time is recorded so the app can tell instant recall from counting.
6. **Gentle mistakes.** A wrong answer shows the correct one with its picture. The same fact comes back 2–4 questions later. No red X, no buzzer.
7. **Short and frequent.** A session lasts about 5–7 minutes. Daily practice beats long sessions.
8. **Learners compare only with their own past.** No leaderboards. Progress reads like "6×8: twice as fast as last week".

## 3. Who it's for

| Learner | Starting stage | First-release support |
|---|---|---|
| Older learner (lower secondary) | Check-up, then Strategise or Fluency for each fact | **Full.** This release is built and polished for them. |
| Younger learner (early primary) | Starts with ×10, ×2, ×5 only, using pictures | **Basic.** Uses the same engine with the younger settings (§4.5). The full "Understand" path comes later. |
| Parent | — | **Full.** Dashboard, child profiles, linking a child's phone. |

## 4. How a learner uses the app

### 4.1 Check-up (first use)
- Framed as "Let's see what you already know". There are no wrong answers.
- Asks each fact once, from easy to hard, split across one or two short sittings.
- **Adapts as it goes.** After two misses in a row within a table, it skips the harder facts in that table and marks them "to learn", so the learner isn't worn down.
- **Ends with the fact map,** which usually shows more green than the learner expected.
- **Typing calibration.** Answers to the trivial facts (×1, ×10) measure how fast this learner types on this phone. That baseline sets their personal fluency threshold (§4.3).

### 4.2 Daily session
- **Contents:** facts due for review first. Then up to 2–3 **new** facts, each introduced with a guide (§4.6). Each new fact is woven in among known facts, and the facts are interleaved.
- **Both orders are asked** (7×3 and 3×7), but they share one mastery record.
- **Ends on a correct answer,** then shows a short summary, such as how many facts moved up, and a fact-map animation.
- **Optional one-tap check-in at the end:** "How did that feel?" 😌 🙂 😣. This lets us watch for anxiety, not just accuracy.

### 4.3 Fact levels and mastery

Each fact has a level from 0 to 5. The level sets when it is next shown and its colour on the fact map.

| Level | Next review | Fact map colour |
|---|---|---|
| 0 New | — | grey |
| 1 Learning | same session | amber |
| 2 | 1 day | amber |
| 3 Fluent | 3 days | light green |
| 4 | 7 days | green |
| 5 Mastered | 21 days | deep green |

- **A correct, fluent answer** moves the fact up one level. "Fluent" means correct and within the learner's threshold: about 2.5 s above their typing baseline (configurable).
- **A correct but slow answer** keeps the fact at its level.
- **A wrong answer** moves it down to level 1. A slip on a well-known fact (level 4 or 5, often a typo) only drops it to level 2.
- **Exact gaps and thresholds** are settings, so they can be tuned with real data.
- **Red is never used.**

### 4.4 Teaching order
The usual school order: ×10 and ×2, then ×5, then ×3, ×4 and ×8, then ×6, ×7 and ×9.

The map starts at **10×10**. Once every 10×10 fact has been started and 80% are fluent, **"bonus rows" ×11 and ×12 unlock**. That brings the total to 78 facts, and the extra ones are mostly easy.

### 4.5 Per-learner settings
Settings are set by the parent, with defaults by age:
- range (10 or 12)
- read-aloud on or off
- picture hints (always / on mistakes / off)
- session length
- fluency threshold offset

Younger profiles default to read-aloud on, pictures always shown, and only ×10, ×2 and ×5.

### 4.6 Explanations: guides, shorts and tips
- **Guides ("let's work it out together").** Used for a new fact, the hint button and a mistake. The method is split into baby steps and the learner types every in-between answer (5 × 3 → 10 × 3 = 30 → half of 30 = 15). A step can't be skipped: a wrong step shows the right number and the learner types it. A bar model under each step shows the groups being added, taken away or halved.
- **Numbers keep their position.** When a factor is swapped, it changes in place (5 × 3 → 10 × 3, never 3 × 10), and the old number visibly flips into the new one.
- **Animated shorts.** 7 × 8 ("5, 6, 7, 8", ending with 8 × 7 when asked that way), ×10 (the digits move up a place), ×11 (the digit is copied) and ×9 (one less, digits add to 9). A short plays only after the learner has worked out the answer, and can be replayed.
- **Turnaround tip.** The first time a learner answers a fact correctly the other way round (both factors 2 or more and clearly different, like 3 × 7 after 7 × 3), a short turns 3 rows of 7 into 7 rows of 3. Shown once; also available from the fact map.
- **Half speed.** Every animation is designed at 1× and played at half speed. Motion is used only where it explains something.
- **Answers are never given away early,** and a hinted or guided answer never counts as fluent.

### 4.6a Missing numbers, read-aloud and games (1.1)
- **Missing-number puzzles** (`? × 7 = 56`): a first step into division. Mixed in only for facts at level 3+, taken from the "known" fillers (never a due review), at most 4 a session. The first one ever is an introduction: type a known fact, then fill the same fact's gap; a short then turns it into 56 ÷ 7 = 8. A hint or slip opens a guide that counts on or back from 2, 5 or 10 groups, one typed step at a time. They are counted separately and **never change a fact's level**; there is no picture under the question, since it would let the answer be counted.
- **Read-aloud** uses the phone's own voice (speechSynthesis): questions and guide steps, plus a 🔊 button. If the phone has no voice, it does nothing. While the question is read, the answer clock waits.
- **Games** (after the check-up): *Find the pairs* (match six facts to their answers, all face up) and *Fill a row* (fill one row of the map; a miss comes back later, a second miss opens the guide; the finished row lights up +n at a time). No timers, no losing. Game answers don't change fact levels.

### 4.6b Understand path (1.2, younger profile)
Five short lessons come before the check-up: **equal groups** (plates of apples), **rows** (3 rows of 4, then turned into 4 rows of 3), and **counting in 10s, 2s and 5s** (jumps on a number line). The picture grows one plate, row or jump per step and the child types one number each time; a jump's landing point is labelled only after it's typed. A first slip asks to count again, a second shows the number to type. Lessons stay on the home screen to replay. A young learner who has already started the check-up isn't held back.

### 4.6c Arabic (release 2)
- **Language** (per child: English / العربية) and **digits** (0123 / ٠١٢٣) are separate settings. Arabic turns screens right to left; sums, the number pad and the shorts stay left to right, as in IGCSE textbooks. The parent area has its own language switch.
- **Number words, units first:** 56 = ستة وخمسون. A short lights the 6, shows ستة, then lights the 5 and shows وخمسون (hundreds come first: مئة وأربعة وأربعون). Shown the first time in bilingual mode, and from the fact map.
- **Bilingual mode** (per child): practice questions appear and are heard in Arabic words (سبعة ضرب ثمانية); the child answers in digits, then sees and hears the answer's words. 2.5 s extra is allowed before an answer counts as slow. Check-up and missing-number puzzles stay in digits.
- **The parent's voice:** the parent records 30 short clips (1–19, 20–90, مئة, و, ضرب) on the parent page; together they say any answer up to 144. Stored in D1 (≤64 KB each), cached on the child's phone for offline use. Order of preference: the parent's clips, then the phone's Arabic voice, then words only.

### 4.7 Motivation
- The fact map is the main reward.
- The streak is a **forgiving streak**, counted as "5 of the last 7 days" rather than consecutive days, so one missed day doesn't wipe it.
- Personal bests.
- The learner picks a colour theme and an avatar.
- No points race, and no streak that can be lost in a way that punishes.

## 5. Screens

**Child (phone, used with one thumb):**
1. **Home:** avatar, "Start today's practice" button, mini fact map, streak.
2. **Practice:** large question in the top half and a large custom number pad in the bottom half (no system keyboard). A hint button opens the guide.
3. **Guide:** the method in baby steps, with a bar model and, for some facts, an animated short at the end (§4.6).
4. **Fact map:** the full 10×10 (or 12×12) grid. Tapping a cell shows that fact's history and its strategy.
5. **Session summary.**

**Parent (phone or desktop):**
1. Sign up / sign in.
2. **Children:** add or edit a profile, then link a phone with a 6-digit code or QR code that expires after 15 minutes.
3. **Dashboard for each child:**
   - fact map
   - trouble facts (lowest accuracy, slowest)
   - accuracy and median response time over time
   - minutes practised per day
   - streak
   - feelings check-ins
4. **Settings for each child** (§4.5).

## 6. Data and sync

**Works offline, and every answer is recorded as an event.**

- **Every action is saved as an event on the phone first** (IndexedDB via Dexie). Events are added, never changed.
- **Upload is safe to repeat.** Events go up in batches to `POST /api/sync` whenever the phone is online. Each event has an ID created on the phone and the server uses `INSERT OR IGNORE`, so a repeated upload never creates duplicates.
- **Reinstalls and new phones are restored from the server.** This also guards against the browser clearing its storage.
- **Fact levels, the fact map and dashboard figures are all calculated from the events.** If the method improves, everyone's history can be recalculated.

**Event types:**
- `checkup_start` / `checkup_end`
- `session_start` / `session_end`
- `answer`
- `hint_shown`
- `strategy_viewed`
- `feeling`
- `settings_changed`

**Data stored with an `answer` event:**

```json
{ "a": 7, "b": 8, "given": 54, "correct": false, "latencyMs": 4210,
  "mode": "product", "hinted": false, "sessionId": "…" }
```

**Database tables (D1 / SQLite):**

| Table | Columns |
|---|---|
| `parents` | id, email, password_hash, created_at |
| `learners` | id, parent_id, display_name, birth_year, avatar, theme, settings_json, created_at |
| `devices` | id, learner_id, token_hash, paired_at, last_seen_at |
| `pairing_codes` | code, learner_id, expires_at |
| `events` | id (UUID), learner_id, device_id, type, payload_json, client_ts, server_ts |

## 7. Accounts and privacy
- **Parents** sign in with email and password. Passwords are hashed with PBKDF2 via the browser-standard crypto built into Workers. Sessions use an HttpOnly cookie. Until the app opens to other families, sign-up requires an invite code.
- **Children never have passwords or email addresses.** A phone is linked to a child profile with a code and receives a device token. The parent can unlink a phone at any time.
- **Data about children is kept to a minimum:** first name or nickname, birth year, and practice events. No analytics or third-party trackers.
- **Before opening to other families:**
  - password reset by email
  - account and data deletion
  - privacy page

## 8. Tech stack and hosting

| Layer | Choice |
|---|---|
| App | React + TypeScript + Vite, installable to the home screen (`vite-plugin-pwa`), designed for phones first |
| Storage on the phone | IndexedDB via Dexie |
| API | A Cloudflare Worker with the Hono router; the same Worker also serves the app files |
| Database | Cloudflare D1 |
| Tests | Vitest, covering the learning engine: scheduling, mastery and session building |
| Hosting | Cloudflare Workers free tier at `math.aburaddad.com`; DNS is set up automatically on deploy |
| i18n | All text in `src/locales/en.json` and `ar.json`; Arabic is right to left (CSS logical properties), sums stay left to right |

**Android setup:**
- Install from Chrome with "Add to Home screen".
- If Family Link filters websites, allow the app's address once.

**Expected cost: free.** The free tiers allow about 100k requests a day and 5 GB of D1 storage, and one family uses a tiny fraction of that.

## 9. Release plan

**First release (live):**
- parent accounts
- child profiles and phone linking
- check-up
- daily sessions
- step-by-step guides with bar models, animated shorts and the turnaround tip
- fact map (10×10, with ×11 and ×12 unlocking later)
- forgiving streak
- offline sync
- parent dashboard
- English text, built ready for translation

**1.1 (built, §4.6a):**
- missing-number questions (`__ × 7 = 56`) as a first step into division
- read-aloud
- one or two low-pressure game modes

**1.2 (built):** The full **Understand** path for younger learners: equal groups, arrays and skip-counting lessons before practice (§4.6b).

**2 — Arabic numbers (built, §4.6c):**
- switch between Western and Eastern Arabic numerals (0123 / ٠١٢٣)
- Arabic number words, including units-first reading (56 is *ستة وخمسون*)
- the parent records audio of the numbers in their own voice from the dashboard
- bilingual mode: hear the question in Arabic, answer in digits

**3:**
- opening to other families (password reset, deletion, privacy page)
- further IGCSE topics on the same engine

## 10. How we'll know it's working

| Measure | Target |
|---|---|
| Fluent facts (level 3+) | rising week on week from the check-up baseline |
| Median response time on reviewed facts | falling |
| Session accuracy | holding at 85% or more (confirms the difficulty is set right) |
| Practice days per week | 5 or more |
| Feelings check-ins | mostly 😌 / 🙂 |

## 11. Open questions
- App name: our first learner will choose.
- Confirm the subdomain (`math.aburaddad.com`?).
- Fluency threshold and review gaps: start with the values in §4.3 and tune after 2–3 weeks of data.
