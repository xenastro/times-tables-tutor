# Proposal: the next maths topics

*Status: proposal only, nothing built. Written 2026-10-10.*

The engine already does four things well: it keeps a per-item level with spaced reviews, mixes a
few new items among known ones, teaches through baby-step guides the learner types through, and
never lets a hinted answer count as fluent. Any new topic should reuse all four. That favours
topics made of **many small, recallable items with a clear method for each**, and rules out
open-ended problem solving for now.

## Recommended order

1. **Division facts** (56 ÷ 7). The missing-number puzzles are already the bridge. Each division
   fact is linked to its multiplication fact; it becomes due only once that fact is fluent, and a
   slip opens the existing "count on from 5 or 10 groups" guide. Smallest step, biggest payoff.
2. **Multiplying by 10, 100 and 1000, and multiples** (30 × 4, 700 × 6). Uses the ×10 short
   (digits move up a place) and the times tables the learner now knows. Guides: split off the
   zeros, multiply, put them back.
3. **Factors, multiples and primes** (IGCSE number). "Is 7 a factor of 56?" and "list the factors
   of 36" as quick items, with the fact map as the picture: a number's factor pairs are the cells
   where it appears.
4. **Squares and square roots up to 15²**: the diagonal of the map, extended. Easy to schedule,
   and they come up all through IGCSE.
5. **Fraction of an amount** (¾ of 28): divide, then multiply, as two typed steps, with a bar
   model.

## What it would take

- `Fact` becomes a more general `Item` with a topic id; the current facts are the "times" topic.
  Levels, scheduling and the event log carry over unchanged (events gain a `topic` field).
- Each topic supplies: its items, a teaching order, a guide builder, and a check of the answer.
- A topic opens only when the one before it is mostly fluent, as the bonus rows do today.
- The parent dashboard gets one map per topic.

## Questions for you

- Is division (1) the right next step for your daughter's class, or is something else coming up
  in school sooner?
- Should topics stay separate sessions, or be mixed into the daily practice once they open?
