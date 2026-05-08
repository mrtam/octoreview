import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppSettings, normalizeStoredCategory, normalizeStoredFilter } from "../dist/storage.js";

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
  assert.deepEqual(normalizeAppSettings(undefined), { pollingIntervalMinutes: 15, collapsedCategoryIds: [] });
  assert.deepEqual(normalizeAppSettings({ pollingIntervalMinutes: 1 }), { pollingIntervalMinutes: 1, collapsedCategoryIds: [] });
  assert.deepEqual(normalizeAppSettings({ pollingIntervalMinutes: 2 }), { pollingIntervalMinutes: 15, collapsedCategoryIds: [] });
});

test("normalizeAppSettings preserves collapsed category ids", () => {
  assert.deepEqual(
    normalizeAppSettings({ pollingIntervalMinutes: 5, collapsedCategoryIds: ["cat-a", "cat-b"] }),
    { pollingIntervalMinutes: 5, collapsedCategoryIds: ["cat-a", "cat-b"] }
  );
});

test("normalizeStoredFilter preserves trimmed categoryId", () => {
  const filter = normalizeStoredFilter({
    id: "f1",
    name: "Team",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "review-requested:@me",
    enabled: true,
    pollingEnabled: false,
    sort: "updated-desc",
    includeDrafts: true,
    categoryId: " cat-a "
  });

  assert.equal(filter.categoryId, "cat-a");
});

test("normalizeStoredFilter omits empty categoryId", () => {
  const filter = normalizeStoredFilter({
    id: "f1",
    name: "Team",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "review-requested:@me",
    enabled: true,
    pollingEnabled: false,
    sort: "updated-desc",
    includeDrafts: true,
    categoryId: "   "
  });

  assert.equal("categoryId" in filter, false);
});

test("normalizeStoredCategory trims the category name", () => {
  assert.deepEqual(normalizeStoredCategory({ id: "c1", name: "  Monolith  " }), { id: "c1", name: "Monolith" });
});
