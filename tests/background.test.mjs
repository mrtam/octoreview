import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ICON_PATHS,
  getNewPullRequestIds,
  getPollingFilters,
  hasUnreadNotifications,
  mergeUnreadPrIds,
  pruneNotificationState,
  UNREAD_ICON_PATHS,
  updateUnreadBadge
} from "../dist/background.js";

const baseFilter = {
  id: "f1",
  name: "Needs review",
  repoOwner: "octo-org",
  repoName: "octo-repo",
  query: "review-requested:@me",
  enabled: true,
  pollingEnabled: true,
  includeDrafts: true,
  sort: "updated-desc"
};

function pr(id, updatedAt = "2026-05-05T11:00:00Z") {
  return {
    id,
    number: id,
    title: `PR ${id}`,
    url: `https://github.com/octo-org/octo-repo/pull/${id}`,
    author: "octocat",
    labels: [],
    state: "open",
    draft: false,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt
  };
}

test("getNewPullRequestIds treats first poll as a cache seed", () => {
  assert.deepEqual(getNewPullRequestIds([pr(1), pr(2)], undefined), []);
});

test("getNewPullRequestIds returns PR ids missing from the cached result set", () => {
  const previous = {
    fetchedAt: "2026-05-05T12:00:00Z",
    results: [pr(1), pr(2)]
  };

  assert.deepEqual(getNewPullRequestIds([pr(3), pr(2), pr(1)], previous), [3]);
});

test("getNewPullRequestIds ignores updates to existing PR ids", () => {
  const previous = {
    fetchedAt: "2026-05-05T12:00:00Z",
    results: [pr(1)]
  };

  assert.deepEqual(getNewPullRequestIds([pr(1, "2026-05-06T10:00:00Z")], previous), []);
});

test("getPollingFilters skips disabled filters and filters without polling", () => {
  assert.deepEqual(
    getPollingFilters([
      baseFilter,
      { ...baseFilter, id: "f2", enabled: false },
      { ...baseFilter, id: "f3", pollingEnabled: false }
    ]).map((filter) => filter.id),
    ["f1"]
  );
});

test("notification helpers merge unread ids and report unread state", () => {
  assert.deepEqual(mergeUnreadPrIds([1, 2], [2, 3]), [1, 2, 3]);
  assert.equal(hasUnreadNotifications({ f1: { unreadPrIds: [] } }), false);
  assert.equal(hasUnreadNotifications({ f1: { unreadPrIds: [3] } }), true);
});

test("pruneNotificationState removes entries for filters no longer polled", () => {
  assert.deepEqual(
    pruneNotificationState(
      {
        f1: { unreadPrIds: [1] },
        f2: { unreadPrIds: [2] }
      },
      new Set(["f2"])
    ),
    {
      f2: { unreadPrIds: [2] }
    }
  );
});

test("updateUnreadBadge uses compact icon variants instead of badge text", async () => {
  const calls = [];
  globalThis.chrome = {
    action: {
      setBadgeText: async (details) => calls.push(["setBadgeText", details]),
      setIcon: async (details) => calls.push(["setIcon", details])
    }
  };

  await updateUnreadBadge({ f1: { unreadPrIds: [3] } });
  assert.deepEqual(calls, [
    ["setBadgeText", { text: "" }],
    ["setIcon", { path: UNREAD_ICON_PATHS }]
  ]);

  calls.length = 0;
  await updateUnreadBadge({ f1: { unreadPrIds: [] } });
  assert.deepEqual(calls, [
    ["setBadgeText", { text: "" }],
    ["setIcon", { path: DEFAULT_ICON_PATHS }]
  ]);

  delete globalThis.chrome;
});
