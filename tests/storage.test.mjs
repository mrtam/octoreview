import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppSettings, normalizeStoredFilter } from "../dist/storage.js";

test("normalizeStoredFilter defaults existing filters to polling disabled", () => {
  const filter = normalizeStoredFilter({
    id: "f1",
    name: " Team ",
    repoOwner: " octo-org ",
    repoName: " octo-repo ",
    query: " review-requested:@me ",
    enabled: true,
    sort: "updated-desc",
    includeDrafts: true
  });

  assert.equal(filter.name, "Team");
  assert.equal(filter.repoOwner, "octo-org");
  assert.equal(filter.repoName, "octo-repo");
  assert.equal(filter.query, "review-requested:@me");
  assert.equal(filter.pollingEnabled, false);
});

test("normalizeStoredFilter preserves explicit polling enabled", () => {
  const filter = normalizeStoredFilter({
    id: "f1",
    name: "Team",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "review-requested:@me",
    enabled: true,
    pollingEnabled: true,
    sort: "updated-desc",
    includeDrafts: true
  });

  assert.equal(filter.pollingEnabled, true);
});

test("normalizeAppSettings defaults invalid polling intervals", () => {
  assert.deepEqual(normalizeAppSettings(undefined), { pollingIntervalMinutes: 15 });
  assert.deepEqual(normalizeAppSettings({ pollingIntervalMinutes: 1 }), { pollingIntervalMinutes: 1 });
  assert.deepEqual(normalizeAppSettings({ pollingIntervalMinutes: 2 }), { pollingIntervalMinutes: 15 });
});
