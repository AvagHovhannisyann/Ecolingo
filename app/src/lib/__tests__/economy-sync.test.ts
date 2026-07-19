import { describe, expect, it, vi } from "vitest";
import {
  emptyEconomySnapshot,
  mergeEconomy,
  pullEconomy,
  pushEconomy,
  type EconomyClient,
  type EconomyRow,
  type EconomySnapshot,
  type QuestClaim,
} from "../economy-sync";

const USER = "user-1";

function snap(overrides: Partial<EconomySnapshot> = {}): EconomySnapshot {
  return {
    ...emptyEconomySnapshot(USER, "2026-07-19T00:00:00.000Z"),
    ...overrides,
  };
}

function claim(overrides: Partial<QuestClaim> = {}): QuestClaim {
  return { quest: "daily-xp-50", period: "2026-07-19", claimedAt: "2026-07-19T09:00:00.000Z", ...overrides };
}

// ---------------------------------------------------------------------------
// streak_count: MAX, paired with last_active_day
// ---------------------------------------------------------------------------
describe("mergeEconomy: streak (MAX + last_active_day pairing)", () => {
  it("takes the higher streak count from remote, paired with remote's last_active_day", () => {
    const local = snap({ streakCount: 3, lastActiveDay: "2026-07-17" });
    const remote = snap({ streakCount: 5, lastActiveDay: "2026-07-19" });
    const merged = mergeEconomy(local, remote);
    expect(merged.streakCount).toBe(5);
    expect(merged.lastActiveDay).toBe("2026-07-19");
  });

  it("takes the higher streak count from local, paired with local's last_active_day", () => {
    const local = snap({ streakCount: 8, lastActiveDay: "2026-07-19" });
    const remote = snap({ streakCount: 2, lastActiveDay: "2026-07-10" });
    const merged = mergeEconomy(local, remote);
    expect(merged.streakCount).toBe(8);
    expect(merged.lastActiveDay).toBe("2026-07-19");
  });

  it("never pairs the winning count with the losing side's date (consistency check)", () => {
    // remote has the higher count but an OLDER date than local — a naive
    // "max count, max date" merge would wrongly pair remote's count with
    // local's newer date. The pair must travel together.
    const local = snap({ streakCount: 2, lastActiveDay: "2026-07-19" });
    const remote = snap({ streakCount: 9, lastActiveDay: "2026-06-01" });
    const merged = mergeEconomy(local, remote);
    expect(merged.streakCount).toBe(9);
    expect(merged.lastActiveDay).toBe("2026-06-01"); // remote's date, not local's
  });

  it("equal counts: keeps the fresher last_active_day", () => {
    const local = snap({ streakCount: 4, lastActiveDay: "2026-07-15" });
    const remote = snap({ streakCount: 4, lastActiveDay: "2026-07-19" });
    const merged = mergeEconomy(local, remote);
    expect(merged.streakCount).toBe(4);
    expect(merged.lastActiveDay).toBe("2026-07-19");
  });

  it("a real date always beats a null last_active_day at equal counts", () => {
    const local = snap({ streakCount: 0, lastActiveDay: null });
    const remote = snap({ streakCount: 0, lastActiveDay: "2026-07-19" });
    expect(mergeEconomy(local, remote).lastActiveDay).toBe("2026-07-19");
    expect(mergeEconomy(remote, local).lastActiveDay).toBe("2026-07-19");
  });
});

// ---------------------------------------------------------------------------
// gems / xp: MAX, monotonic currencies
// ---------------------------------------------------------------------------
describe("mergeEconomy: gems & xp (MAX, monotonic — never lose earned value)", () => {
  it("gems: takes the larger of the two values regardless of side", () => {
    expect(mergeEconomy(snap({ gems: 10 }), snap({ gems: 40 })).gems).toBe(40);
    expect(mergeEconomy(snap({ gems: 40 }), snap({ gems: 10 })).gems).toBe(40);
  });

  it("xp: takes the larger of the two values regardless of side", () => {
    expect(mergeEconomy(snap({ xp: 120 }), snap({ xp: 75 })).xp).toBe(120);
    expect(mergeEconomy(snap({ xp: 75 }), snap({ xp: 120 })).xp).toBe(120);
  });

  it("gems and xp are merged independently of each other", () => {
    const local = snap({ gems: 100, xp: 5 });
    const remote = snap({ gems: 5, xp: 100 });
    const merged = mergeEconomy(local, remote);
    expect(merged.gems).toBe(100); // from local
    expect(merged.xp).toBe(100); // from remote
  });

  it("equal values merge to that value (no accidental doubling)", () => {
    expect(mergeEconomy(snap({ gems: 30 }), snap({ gems: 30 })).gems).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// hearts: newest updatedAt wins, paired with heart_regen_anchor
// ---------------------------------------------------------------------------
describe("mergeEconomy: hearts (recency wins, not MAX — hearts can legitimately decrease)", () => {
  it("remote wins when remote.updatedAt is newer, carrying its own regen anchor", () => {
    const local = snap({ hearts: 5, heartRegenAnchor: "t-local", updatedAt: "2026-07-18T00:00:00.000Z" });
    const remote = snap({ hearts: 2, heartRegenAnchor: "2026-07-19T08:00:00.000Z", updatedAt: "2026-07-19T08:00:00.000Z" });
    const merged = mergeEconomy(local, remote);
    expect(merged.hearts).toBe(2);
    expect(merged.heartRegenAnchor).toBe("2026-07-19T08:00:00.000Z");
  });

  it("local wins when local.updatedAt is newer, carrying its own regen anchor", () => {
    const local = snap({ hearts: 1, heartRegenAnchor: "2026-07-19T10:00:00.000Z", updatedAt: "2026-07-19T10:00:00.000Z" });
    const remote = snap({ hearts: 5, heartRegenAnchor: "t-remote", updatedAt: "2026-07-15T00:00:00.000Z" });
    const merged = mergeEconomy(local, remote);
    expect(merged.hearts).toBe(1);
    expect(merged.heartRegenAnchor).toBe("2026-07-19T10:00:00.000Z");
  });

  it("a stale-but-fuller snapshot can never be used to dodge a heart loss", () => {
    // remote lost a heart more recently than local knows about; merge must
    // reflect the loss, not resurrect the heart via a MAX-style rule.
    const local = snap({ hearts: 5, updatedAt: "2026-07-10T00:00:00.000Z" });
    const remote = snap({ hearts: 3, updatedAt: "2026-07-19T00:00:00.000Z" });
    expect(mergeEconomy(local, remote).hearts).toBe(3);
  });

  it("exact updatedAt tie with different hearts: takes the higher count (never let a tie cost a heart)", () => {
    const a = snap({ hearts: 4, heartRegenAnchor: "anchor-a", updatedAt: "2026-07-19T00:00:00.000Z" });
    const b = snap({ hearts: 2, heartRegenAnchor: "anchor-b", updatedAt: "2026-07-19T00:00:00.000Z" });
    const merged = mergeEconomy(a, b);
    expect(merged.hearts).toBe(4);
    expect(merged.heartRegenAnchor).toBe("anchor-a");
  });

  it("exact updatedAt and hearts tie: takes the earlier regen anchor (more credited regen time)", () => {
    const a = snap({ hearts: 3, heartRegenAnchor: "2026-07-19T06:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" });
    const b = snap({ hearts: 3, heartRegenAnchor: "2026-07-19T02:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" });
    const merged = mergeEconomy(a, b);
    expect(merged.hearts).toBe(3);
    expect(merged.heartRegenAnchor).toBe("2026-07-19T02:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// quest_claims: union keyed by quest:period
// ---------------------------------------------------------------------------
describe("mergeEconomy: quest_claims (union by quest+period)", () => {
  it("unions disjoint claims from both sides", () => {
    const local = snap({ questClaims: [claim({ quest: "daily-xp-50", period: "2026-07-19" })] });
    const remote = snap({ questClaims: [claim({ quest: "weekly-streak", period: "2026-W29" })] });
    const merged = mergeEconomy(local, remote);
    expect(merged.questClaims).toHaveLength(2);
    expect(merged.questClaims.map((c) => c.quest).sort()).toEqual(["daily-xp-50", "weekly-streak"]);
  });

  it("dedupes a claim recorded on both sides for the same quest+period, keeping the earlier claimedAt", () => {
    const local = snap({
      questClaims: [claim({ claimedAt: "2026-07-19T09:00:00.000Z" })],
    });
    const remote = snap({
      questClaims: [claim({ claimedAt: "2026-07-19T05:00:00.000Z" })], // claimed earlier on remote
    });
    const merged = mergeEconomy(local, remote);
    expect(merged.questClaims).toHaveLength(1);
    expect(merged.questClaims[0].claimedAt).toBe("2026-07-19T05:00:00.000Z");
  });

  it("distinguishes the same quest across different periods (no cross-period dedup)", () => {
    const local = snap({ questClaims: [claim({ period: "2026-07-18" })] });
    const remote = snap({ questClaims: [claim({ period: "2026-07-19" })] });
    const merged = mergeEconomy(local, remote);
    expect(merged.questClaims).toHaveLength(2);
  });

  it("empty claims on both sides merge to empty", () => {
    expect(mergeEconomy(snap({ questClaims: [] }), snap({ questClaims: [] })).questClaims).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// userId guard
// ---------------------------------------------------------------------------
describe("mergeEconomy: cross-user guard", () => {
  it("throws when the two snapshots belong to different users", () => {
    const a = snap({ userId: "user-1" });
    const b = snap({ userId: "user-2" });
    expect(() => mergeEconomy(a, b)).toThrow(/different users/);
  });
});

// ---------------------------------------------------------------------------
// commutativity: mergeEconomy(a, b) === mergeEconomy(b, a)
// ---------------------------------------------------------------------------
describe("mergeEconomy: commutativity", () => {
  const fixtures: [EconomySnapshot, EconomySnapshot][] = [
    [
      snap({ streakCount: 3, gems: 10, xp: 5, hearts: 5, updatedAt: "2026-07-18T00:00:00.000Z" }),
      snap({ streakCount: 7, gems: 2, xp: 90, hearts: 1, updatedAt: "2026-07-19T00:00:00.000Z" }),
    ],
    [
      // equal streak counts (date tie-break path) and equal hearts updatedAt (anchor tie-break path)
      snap({ streakCount: 4, lastActiveDay: "2026-07-10", hearts: 2, heartRegenAnchor: "2026-07-19T01:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" }),
      snap({ streakCount: 4, lastActiveDay: "2026-07-19", hearts: 2, heartRegenAnchor: "2026-07-19T03:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" }),
    ],
    [
      snap({ questClaims: [claim({ quest: "a", claimedAt: "2026-07-19T09:00:00.000Z" })] }),
      snap({ questClaims: [claim({ quest: "a", claimedAt: "2026-07-19T05:00:00.000Z" }), claim({ quest: "b" })] }),
    ],
  ];

  it.each(fixtures.map((f, i) => [i, f] as const))("fixture %i: merge(a,b) equals merge(b,a)", (_, [a, b]) => {
    expect(mergeEconomy(a, b)).toEqual(mergeEconomy(b, a));
  });
});

// ---------------------------------------------------------------------------
// idempotence: mergeEconomy(a, mergeEconomy(a, b)) === mergeEconomy(a, b)
// ---------------------------------------------------------------------------
describe("mergeEconomy: idempotence", () => {
  const fixtures: [EconomySnapshot, EconomySnapshot][] = [
    [
      snap({ streakCount: 3, gems: 10, xp: 5, hearts: 5, updatedAt: "2026-07-18T00:00:00.000Z" }),
      snap({ streakCount: 7, gems: 2, xp: 90, hearts: 1, updatedAt: "2026-07-19T00:00:00.000Z" }),
    ],
    [
      snap({ streakCount: 4, lastActiveDay: "2026-07-10", hearts: 2, heartRegenAnchor: "2026-07-19T01:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" }),
      snap({ streakCount: 4, lastActiveDay: "2026-07-19", hearts: 2, heartRegenAnchor: "2026-07-19T03:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" }),
    ],
    [
      snap({ questClaims: [claim({ quest: "a" }), claim({ quest: "b", period: "2026-W29" })] }),
      snap({ questClaims: [claim({ quest: "a", claimedAt: "2026-07-19T02:00:00.000Z" })] }),
    ],
  ];

  it.each(fixtures.map((f, i) => [i, f] as const))("fixture %i: re-merging the result with a local is a no-op", (_, [a, b]) => {
    const once = mergeEconomy(a, b);
    const twice = mergeEconomy(a, once);
    expect(twice).toEqual(once);
  });

  it("re-merging with itself is a no-op", () => {
    const a = snap({ streakCount: 6, gems: 40, xp: 12, hearts: 3, questClaims: [claim()] });
    expect(mergeEconomy(a, a)).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// updatedAt of the merged result
// ---------------------------------------------------------------------------
describe("mergeEconomy: merged updatedAt", () => {
  it("is the max of the two inputs' updatedAt", () => {
    const local = snap({ updatedAt: "2026-07-10T00:00:00.000Z" });
    const remote = snap({ updatedAt: "2026-07-19T00:00:00.000Z" });
    expect(mergeEconomy(local, remote).updatedAt).toBe("2026-07-19T00:00:00.000Z");
    expect(mergeEconomy(remote, local).updatedAt).toBe("2026-07-19T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// emptyEconomySnapshot
// ---------------------------------------------------------------------------
describe("emptyEconomySnapshot", () => {
  it("matches the migration's column defaults", () => {
    const e = emptyEconomySnapshot("u-42", "2026-07-19T00:00:00.000Z");
    expect(e.hearts).toBe(5);
    expect(e.gems).toBe(0);
    expect(e.streakCount).toBe(0);
    expect(e.xp).toBe(0);
    expect(e.lastActiveDay).toBeNull();
    expect(e.questClaims).toEqual([]);
    expect(e.heartRegenAnchor).toBe("2026-07-19T00:00:00.000Z");
    expect(e.userId).toBe("u-42");
  });
});

// ---------------------------------------------------------------------------
// mocked-client contract tests: pushEconomy / pullEconomy
// ---------------------------------------------------------------------------
function mockClient(opts: {
  selectResult?: { data: EconomyRow | null; error: { message: string } | null };
  upsertResult?: { error: { message: string } | null };
  throwOnSelect?: boolean;
  throwOnUpsert?: boolean;
}): { client: EconomyClient; upsertSpy: ReturnType<typeof vi.fn> } {
  const upsertSpy = vi.fn(async () => {
    if (opts.throwOnUpsert) throw new Error("network down");
    return opts.upsertResult ?? { error: null };
  });
  const client: EconomyClient = {
    from: () => ({
      select: () => ({
        maybeSingle: async () => {
          if (opts.throwOnSelect) throw new Error("network down");
          return opts.selectResult ?? { data: null, error: null };
        },
      }),
      upsert: upsertSpy,
    }),
  };
  return { client, upsertSpy };
}

describe("pushEconomy: mocked-client contract", () => {
  it("upserts the snapshot mapped to the snake_case row shape and reports ok:true", async () => {
    const { client, upsertSpy } = mockClient({ upsertResult: { error: null } });
    const s = snap({
      hearts: 4,
      heartRegenAnchor: "2026-07-19T01:00:00.000Z",
      gems: 20,
      streakCount: 6,
      lastActiveDay: "2026-07-19",
      xp: 99,
      questClaims: [claim()],
    });
    const result = await pushEconomy(client, s);
    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const row = upsertSpy.mock.calls[0][0] as EconomyRow;
    expect(row).toEqual({
      user_id: s.userId,
      hearts: 4,
      heart_regen_anchor: "2026-07-19T01:00:00.000Z",
      gems: 20,
      streak_count: 6,
      last_active_day: "2026-07-19",
      xp: 99,
      quest_claims: [claim()],
      updated_at: s.updatedAt,
    });
  });

  it("surfaces a client-reported error as ok:false with the message", async () => {
    const { client } = mockClient({ upsertResult: { error: { message: "permission denied for table learner_economy" } } });
    const result = await pushEconomy(client, snap());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("permission denied for table learner_economy");
  });

  it("catches a thrown network error and reports ok:false", async () => {
    const { client } = mockClient({ throwOnUpsert: true });
    const result = await pushEconomy(client, snap());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });
});

describe("pullEconomy: mocked-client contract", () => {
  it("maps a returned row back into an EconomySnapshot", async () => {
    const row: EconomyRow = {
      user_id: USER,
      hearts: 3,
      heart_regen_anchor: "2026-07-19T02:00:00.000Z",
      gems: 15,
      streak_count: 9,
      last_active_day: "2026-07-19",
      xp: 200,
      quest_claims: [claim()],
      updated_at: "2026-07-19T03:00:00.000Z",
    };
    const { client } = mockClient({ selectResult: { data: row, error: null } });
    const snapshot = await pullEconomy(client);
    expect(snapshot).toEqual({
      userId: USER,
      hearts: 3,
      heartRegenAnchor: "2026-07-19T02:00:00.000Z",
      gems: 15,
      streakCount: 9,
      lastActiveDay: "2026-07-19",
      xp: 200,
      questClaims: [claim()],
      updatedAt: "2026-07-19T03:00:00.000Z",
    });
  });

  it("defaults quest_claims to an empty array when the column comes back null", async () => {
    const row = {
      user_id: USER,
      hearts: 5,
      heart_regen_anchor: "2026-07-19T00:00:00.000Z",
      gems: 0,
      streak_count: 0,
      last_active_day: null,
      xp: 0,
      quest_claims: null as unknown as QuestClaim[],
      updated_at: "2026-07-19T00:00:00.000Z",
    };
    const { client } = mockClient({ selectResult: { data: row, error: null } });
    const snapshot = await pullEconomy(client);
    expect(snapshot?.questClaims).toEqual([]);
  });

  it("returns null when there is no row yet (brand-new learner)", async () => {
    const { client } = mockClient({ selectResult: { data: null, error: null } });
    expect(await pullEconomy(client)).toBeNull();
  });

  it("returns null on a query error", async () => {
    const { client } = mockClient({ selectResult: { data: null, error: { message: "RLS denied" } } });
    expect(await pullEconomy(client)).toBeNull();
  });

  it("returns null when the client throws", async () => {
    const { client } = mockClient({ throwOnSelect: true });
    expect(await pullEconomy(client)).toBeNull();
  });
});
