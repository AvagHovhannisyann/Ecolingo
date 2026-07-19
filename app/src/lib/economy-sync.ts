/**
 * Economy cloud persistence (Wave 2 Stream Y, decision D-020): a standalone
 * adapter + merge module for the game economy (streak/gems/hearts/XP/quest
 * claims). This file owns exactly three things — the wire type, the
 * push/pull adapter against `public.learner_economy`
 * (20260719_wave2_economy.sql), and the local↔remote merge function — and
 * nothing else. It does not read localStorage, does not manage a debounce
 * timer, does not touch the shared SyncStatus channel, and does not import
 * from learner-state.ts / learner-store.ts. Those belong to the parallel
 * Wave 2 stream building the local economy slice; wiring the two together is
 * the architect's job at merge time (see "WIRING" below).
 *
 * ## Merge rules (per field group) and why
 *
 * - **streak_count: MAX, paired with its last_active_day.** A streak may
 *   never be pushed down by a merge — a device that missed the last sync
 *   still gets credit for days it genuinely studied. But `streak_count` on
 *   its own is meaningless without knowing *which* day it was last extended
 *   on (that's what tells the next-day streak logic whether "today" extends
 *   or resets it), so the two fields are merged as one atomic pair: whichever
 *   snapshot has the higher `streakCount` "wins," and its `lastActiveDay`
 *   travels with it. Mixing the winning count with the *other* snapshot's
 *   date would let a stale date silently break tomorrow's streak check.
 *
 * - **gems / xp: MAX, independently (monotonic currencies).** Both are
 *   strictly-earned, never-directly-spent-down values (gems fund the shop,
 *   which is a separate ledger, not a decrement of this row; xp only grows).
 *   Because both directions of a sync race are "did you already know about
 *   this earned amount," MAX is the only merge that can never destroy value
 *   the learner actually earned — a network hiccup that delays one push can
 *   never cost currency, only delay when the *other* device's view of it
 *   catches up. The accepted trade-off: MAX cannot self-heal a runaway bug
 *   that over-credits one device (there is no "undo" in a join), so gem/xp
 *   *writes* must stay append-only-derived (evidence-driven) upstream of
 *   this module, exactly like xp already is in learner-state.ts today.
 *
 * - **hearts: newest `updatedAt` wins, paired with its heart_regen_anchor.**
 *   Hearts are the one field here that legitimately *decreases* (wrong
 *   answers cost a heart), so MAX is wrong for hearts — it would let a
 *   learner dodge a heart loss by simply resyncing an older snapshot that
 *   still had more. Recency is the only sound rule: whichever snapshot was
 *   written most recently reflects the most recent gameplay, full stop. Like
 *   streak_count/last_active_day, `hearts` travels paired with its own
 *   `heartRegenAnchor` — the anchor timestamp the regen formula is computed
 *   from — because a heart count from one snapshot combined with an anchor
 *   from the other would make the client-side regen math (hearts regen over
 *   time, anchored at heartRegenAnchor) compute nonsense. On an exact
 *   `updatedAt` tie, the merge falls back to more hearts (never let a dead
 *   heat cost a heart) and, for a further tie on hearts, the earlier anchor
 *   (more elapsed regen time credited, never less).
 *
 * - **quest_claims: UNION, keyed by `quest:period`.** Claiming a repeatable
 *   quest reward is idempotent by nature (the same quest+period should only
 *   ever be paid out once), so the merge is a set union rather than a
 *   pick-a-winner rule: every claim either side knows about survives the
 *   merge. When both sides somehow recorded a claim for the same
 *   `quest:period` (a race between two devices claiming near-simultaneously),
 *   the earlier `claimedAt` wins — that's the factual first time the reward
 *   was actually earned, and it keeps the result independent of which device
 *   the merge treats as "local."
 *
 * Every one of the four rules above is a commutative, idempotent join over
 * its field(s) — merging is a MAX, a union, or a recency pick tie-broken by a
 * further MAX, never anything that depends on which argument is "local" vs
 * "remote." That makes the whole snapshot a join-semilattice: merges are
 * safe to apply in any order, any number of times, with no coordinator
 * deciding a canonical ordering of writes. See economy-sync.test.ts for the
 * idempotence/commutativity proof-by-cases.
 *
 * ## WIRING (what the architect connects at merge)
 *
 * This module is deliberately inert on its own — nothing in it runs until
 * called. Two call sites need to be added where the local economy store
 * lives (outside this file's ownership):
 *
 * 1. **Hydrate on sign-in**: after `ensureSession()` resolves (see
 *    supabase.ts), call `pullEconomy(supabase)`. If it returns non-null,
 *    `mergeEconomy(localSnapshot, remoteSnapshot)` and persist the merged
 *    result as the new local snapshot — mirroring `hydrateAndMerge()` in
 *    learner-store.ts. If it returns null (no remote row yet, or the network
 *    call failed), keep the local snapshot as-is; the next push will create
 *    the remote row.
 * 2. **Debounced push on mutation**: every local economy mutation should
 *    call `pushEconomy(supabase, snapshot)` behind the *same* debounce
 *    pattern `schedulePush` already uses in sync.ts (800ms trailing-edge
 *    timer) and should report through the shared `SyncStatus` channel
 *    (`setStatus` from sync.ts / `onSyncStatus` for the UI badge) exactly as
 *    teacher-sync.ts does for its own push. This module intentionally does
 *    not own that timer or that channel — economy-sync's push/pull are meant
 *    to slot into the existing debounce + status infrastructure rather than
 *    duplicate it.
 *
 * `snapshot.userId` must be the signed-in session's user id (from
 * `ensureSession()`) before calling `pushEconomy` — RLS's `with check
 * (auth.uid() = user_id)` rejects anything else. `pullEconomy` needs no
 * explicit user id: `select * ... maybeSingle()` is already scoped to the
 * caller's own row by the `learner_economy_select_own` policy.
 */

/** One claim of a repeatable quest reward, for a given reset period. */
export interface QuestClaim {
  /** stable quest identifier, e.g. "daily-xp-50" */
  quest: string;
  /** the reset period the claim belongs to, e.g. an ISO week "2026-W29" or day "2026-07-19" */
  period: string;
  /** ISO8601 timestamp of when the reward was claimed */
  claimedAt: string;
}

/**
 * The whole game-economy state for one learner, in the camelCase shape used
 * by application code (as opposed to `EconomyRow`, the snake_case DB wire
 * shape). This is what `mergeEconomy` operates on and what the local store
 * (owned by the parallel stream) is expected to hold as its in-memory shape.
 */
export interface EconomySnapshot {
  userId: string;
  hearts: number;
  /** ISO8601 anchor timestamp the current `hearts` count regenerates from */
  heartRegenAnchor: string;
  gems: number;
  streakCount: number;
  /** local calendar date (YYYY-MM-DD) of the last study day, or null before the first one */
  lastActiveDay: string | null;
  xp: number;
  questClaims: QuestClaim[];
  /** ISO8601 timestamp this snapshot was last mutated (drives the hearts recency rule) */
  updatedAt: string;
}

/** the `learner_economy` row shape, snake_case, exactly matching the migration's columns */
export interface EconomyRow {
  user_id: string;
  hearts: number;
  heart_regen_anchor: string;
  gems: number;
  streak_count: number;
  last_active_day: string | null;
  xp: number;
  quest_claims: QuestClaim[];
  updated_at: string;
}

/**
 * Structural client contract for the two adapter functions below —
 * deliberately narrower than the full `SupabaseClient` type from
 * `@supabase/supabase-js`. Only the `.from(...).select().maybeSingle()` and
 * `.from(...).upsert()` chains this module actually calls are declared, so:
 *   - a real `SupabaseClient` (e.g. from `getSupabase()` in supabase.ts)
 *     satisfies this structurally without any adaptation — it has strictly
 *     more members than this interface requires;
 *   - tests can pass a small hand-written mock instead of faking the entire
 *     supabase-js surface.
 * `select()` intentionally does not chain through `.eq(...)` before
 * `.maybeSingle()`: RLS already scopes the query to the caller's own row
 * (see `learner_economy_select_own` in the migration), so no explicit filter
 * is needed or passed.
 */
export interface EconomyClient {
  from(table: "learner_economy"): {
    select(columns: string): {
      maybeSingle(): PromiseLike<{ data: EconomyRow | null; error: { message: string } | null }>;
    };
    upsert(row: EconomyRow): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface PushEconomyResult {
  ok: boolean;
  error?: string;
}

function toRow(s: EconomySnapshot): EconomyRow {
  return {
    user_id: s.userId,
    hearts: s.hearts,
    heart_regen_anchor: s.heartRegenAnchor,
    gems: s.gems,
    streak_count: s.streakCount,
    last_active_day: s.lastActiveDay,
    xp: s.xp,
    quest_claims: s.questClaims,
    updated_at: s.updatedAt,
  };
}

function fromRow(r: EconomyRow): EconomySnapshot {
  return {
    userId: r.user_id,
    hearts: r.hearts,
    heartRegenAnchor: r.heart_regen_anchor,
    gems: r.gems,
    streakCount: r.streak_count,
    lastActiveDay: r.last_active_day,
    xp: r.xp,
    questClaims: r.quest_claims ?? [],
    updatedAt: r.updated_at,
  };
}

/** a fresh economy snapshot matching the migration's column defaults */
export function emptyEconomySnapshot(userId: string, nowISO: string = new Date().toISOString()): EconomySnapshot {
  return {
    userId,
    hearts: 5,
    heartRegenAnchor: nowISO,
    gems: 0,
    streakCount: 0,
    lastActiveDay: null,
    xp: 0,
    questClaims: [],
    updatedAt: nowISO,
  };
}

/**
 * Push a snapshot to `learner_economy` as an upsert keyed on the table's
 * primary key (`user_id`). `snapshot.userId` must equal the signed-in
 * session's user id or RLS's `with check` rejects the write — obtaining that
 * id (via `ensureSession()`) is the caller's job, not this module's (see
 * WIRING above).
 */
export async function pushEconomy(client: EconomyClient, snapshot: EconomySnapshot): Promise<PushEconomyResult> {
  try {
    const { error } = await client.from("learner_economy").upsert(toRow(snapshot));
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Pull the signed-in caller's own economy row. Returns null when there is no
 * row yet (a brand-new learner), on any query error, or when the call
 * throws — all three collapse to "nothing to merge in, keep the local
 * snapshot as-is," matching the degrade posture `hydrateRemoteState` already
 * uses in sync.ts (GATE-009: never fail silently, but never block on a
 * transient network error either).
 */
export async function pullEconomy(client: EconomyClient): Promise<EconomySnapshot | null> {
  try {
    const { data, error } = await client.from("learner_economy").select("*").maybeSingle();
    if (error || !data) return null;
    return fromRow(data);
  } catch {
    return null;
  }
}

function isoMax(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** MAX streak_count, with last_active_day carried from whichever side "won" the count (§ streak rule above) */
function mergeStreak(a: EconomySnapshot, b: EconomySnapshot): Pick<EconomySnapshot, "streakCount" | "lastActiveDay"> {
  if (a.streakCount !== b.streakCount) {
    const winner = a.streakCount > b.streakCount ? a : b;
    return { streakCount: winner.streakCount, lastActiveDay: winner.lastActiveDay };
  }
  // equal counts: keep the fresher last_active_day (later calendar date);
  // null (never active) always loses to a real date.
  const aDay = a.lastActiveDay ?? "";
  const bDay = b.lastActiveDay ?? "";
  return { streakCount: a.streakCount, lastActiveDay: aDay >= bDay ? a.lastActiveDay : b.lastActiveDay };
}

/** newest-updatedAt-wins for hearts, paired with the winner's regen anchor (§ hearts rule above) */
function mergeHearts(a: EconomySnapshot, b: EconomySnapshot): Pick<EconomySnapshot, "hearts" | "heartRegenAnchor"> {
  const aT = Date.parse(a.updatedAt);
  const bT = Date.parse(b.updatedAt);
  if (aT !== bT) {
    const winner = aT > bT ? a : b;
    return { hearts: winner.hearts, heartRegenAnchor: winner.heartRegenAnchor };
  }
  // exact updatedAt tie: never let the tie cost a heart — take the higher count.
  if (a.hearts !== b.hearts) {
    const winner = a.hearts > b.hearts ? a : b;
    return { hearts: winner.hearts, heartRegenAnchor: winner.heartRegenAnchor };
  }
  // equal hearts too: take the earlier anchor (credits at least as much
  // elapsed regen time as the later one would).
  const anchor = Date.parse(a.heartRegenAnchor) <= Date.parse(b.heartRegenAnchor) ? a.heartRegenAnchor : b.heartRegenAnchor;
  return { hearts: a.hearts, heartRegenAnchor: anchor };
}

function questKey(c: QuestClaim): string {
  return `${c.quest}:${c.period}`;
}

/** set union keyed by quest:period; duplicate keys keep the earlier claimedAt (§ quest_claims rule above) */
function unionQuestClaims(a: QuestClaim[], b: QuestClaim[]): QuestClaim[] {
  const byKey = new Map<string, QuestClaim>();
  for (const claim of [...a, ...b]) {
    const key = questKey(claim);
    const existing = byKey.get(key);
    if (!existing || Date.parse(claim.claimedAt) < Date.parse(existing.claimedAt)) {
      byKey.set(key, claim);
    }
  }
  // deterministic order independent of which array a claim came from
  return [...byKey.values()].sort((x, y) => questKey(x).localeCompare(questKey(y)));
}

/**
 * Merge a local and a remote economy snapshot into one. Every field-group
 * rule is commutative and idempotent (see the header doc above and
 * economy-sync.test.ts), so `mergeEconomy(x, y)` and `mergeEconomy(y, x)`
 * always produce the same result, and merging an already-merged snapshot
 * back in is a no-op.
 *
 * Throws if the two snapshots belong to different users — merging across
 * accounts is always a caller bug, never a legitimate sync case, so this
 * fails loudly rather than silently blending two learners' currencies.
 */
export function mergeEconomy(local: EconomySnapshot, remote: EconomySnapshot): EconomySnapshot {
  if (local.userId !== remote.userId) {
    throw new Error(
      `mergeEconomy: refusing to merge economies for different users ("${local.userId}" vs "${remote.userId}")`
    );
  }

  const streak = mergeStreak(local, remote);
  const hearts = mergeHearts(local, remote);

  return {
    userId: local.userId,
    hearts: hearts.hearts,
    heartRegenAnchor: hearts.heartRegenAnchor,
    gems: Math.max(local.gems, remote.gems),
    streakCount: streak.streakCount,
    lastActiveDay: streak.lastActiveDay,
    xp: Math.max(local.xp, remote.xp),
    questClaims: unionQuestClaims(local.questClaims, remote.questClaims),
    updatedAt: isoMax(local.updatedAt, remote.updatedAt),
  };
}
