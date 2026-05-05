import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFilterWebUrl,
  buildSearchApiUrl,
  buildSearchQuery,
  mapSort,
  normalizeSearchResponse,
  PAGE_SIZE
} from "../dist/github.js";

const baseFilter = {
  id: "f1",
  name: "Needs review",
  repoOwner: "octo-org",
  repoName: "octo-repo",
  query: "review-requested:@me",
  enabled: true,
  includeDrafts: true,
  sort: "updated-desc"
};

test("buildSearchQuery adds repo, PR type, and open state", () => {
  assert.equal(
    buildSearchQuery(baseFilter),
    "repo:octo-org/octo-repo type:pr is:open review-requested:@me"
  );
});

test("buildSearchQuery respects explicit state qualifiers", () => {
  assert.equal(
    buildSearchQuery({ ...baseFilter, query: "is:closed author:octocat" }),
    "repo:octo-org/octo-repo type:pr is:closed author:octocat"
  );
});

test("buildSearchQuery excludes drafts when includeDrafts is false", () => {
  assert.equal(
    buildSearchQuery({ ...baseFilter, includeDrafts: false }),
    "repo:octo-org/octo-repo type:pr is:open -draft:true review-requested:@me"
  );
});

test("buildSearchQuery does not double up on draft qualifier when user already specified one", () => {
  assert.equal(
    buildSearchQuery({ ...baseFilter, includeDrafts: false, query: "draft:true" }),
    "repo:octo-org/octo-repo type:pr is:open draft:true"
  );
});

test("buildSearchApiUrl maps sort and uses fixed page size", () => {
  const url = new URL(buildSearchApiUrl({ ...baseFilter, sort: "comments-desc" }));

  assert.equal(url.origin + url.pathname, "https://api.github.com/search/issues");
  assert.equal(url.searchParams.get("sort"), "comments");
  assert.equal(url.searchParams.get("order"), "desc");
  assert.equal(url.searchParams.get("per_page"), String(PAGE_SIZE));
  assert.equal(url.searchParams.get("page"), null);
});

test("buildSearchApiUrl includes page param when paging beyond the first page", () => {
  const url = new URL(buildSearchApiUrl(baseFilter, 3));
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("per_page"), String(PAGE_SIZE));
});

test("buildFilterWebUrl points to the GitHub pull request search view", () => {
  const url = new URL(buildFilterWebUrl(baseFilter));

  assert.equal(url.href.startsWith("https://github.com/octo-org/octo-repo/pulls?"), true);
  assert.equal(url.searchParams.get("q"), "type:pr is:open review-requested:@me");
});

test("normalizeSearchResponse keeps PRs and normalizes labels", () => {
  const results = normalizeSearchResponse({
    items: [
      {
        id: 1,
        number: 42,
        title: "Ship it",
        html_url: "https://github.com/octo-org/octo-repo/pull/42",
        state: "open",
        draft: true,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
        user: { login: "octocat" },
        labels: [{ name: "bug", color: "ff0000" }, { name: "bad", color: "not-a-color" }],
        pull_request: {}
      },
      {
        id: 2,
        number: 7,
        title: "Issue only",
        html_url: "https://github.com/octo-org/octo-repo/issues/7",
        state: "open",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
        user: { login: "octocat" },
        labels: []
      }
    ]
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].number, 42);
  assert.equal(results[0].draft, true);
  assert.deepEqual(results[0].labels, [
    { name: "bug", color: "ff0000" },
    { name: "bad", color: "d8dde5" }
  ]);
});

test("mapSort exposes stable defaults", () => {
  assert.deepEqual(mapSort("created-asc"), { sort: "created", order: "asc" });
  assert.deepEqual(mapSort("updated-desc"), { sort: "updated", order: "desc" });
});
