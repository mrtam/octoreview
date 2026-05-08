import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { renderPopup } from "../dist/popup.js";

const filter = {
  id: "f1",
  name: "Needs review",
  repoOwner: "octo-org",
  repoName: "octo-repo",
  query: "review-requested:@me",
  enabled: true,
  includeDrafts: true,
  sort: "updated-desc"
};

test("renderPopup shows token empty state", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(root, [filter], {}, {
    tokenConfigured: false,
    loadingFilterIds: new Set(),
    expandedFilterIds: new Set([filter.id])
  });

  assert.match(root.textContent, /Add a GitHub token/);
});

test("renderPopup shows cached PR rows and open URLs", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(
    root,
    [filter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        results: [
          {
            id: 1,
            number: 42,
            title: "Ship OctoReview",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [{ name: "ui", color: "a2eeef" }],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      expandedFilterIds: new Set([filter.id])
    }
  );

  assert.equal(root.querySelector(".pr-title").textContent, "Ship OctoReview");
  assert.match(root.querySelector(".pr-meta").textContent, /^#42 · octocat · updated /);
  assert.doesNotMatch(root.querySelector(".pr-meta").textContent, / open /);
  assert.equal(
    root.querySelector("[data-action='open-url'][data-url='https://github.com/octo-org/octo-repo/pull/42']") !== null,
    true
  );
});

test("renderPopup shows a +N overflow chip when a PR has more than four labels", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(
    root,
    [filter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        results: [
          {
            id: 1,
            number: 42,
            title: "Many labels",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [
              { name: "a", color: "ff0000" },
              { name: "b", color: "00ff00" },
              { name: "c", color: "0000ff" },
              { name: "d", color: "ffff00" },
              { name: "e", color: "ff00ff" },
              { name: "f", color: "00ffff" }
            ],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      activeFilterId: filter.id
    }
  );

  const overflow = root.querySelector(".label-overflow");
  assert.equal(overflow !== null, true);
  assert.equal(overflow.textContent, "+2");
  assert.equal(root.querySelectorAll(".pr-labels .label").length, 5);
});

test("renderPopup formats counts at GitHub's hard cap as '1000+'", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(root, [filter], {
    [filter.id]: {
      fetchedAt: "2026-05-05T12:00:00Z",
      totalCount: 1000,
      results: []
    }
  }, {
    tokenConfigured: true,
    loadingFilterIds: new Set(),
    activeFilterId: filter.id
  });

  assert.equal(root.querySelector(".count").textContent, "1000+");
});

test("renderPopup keeps stale count visible while a refresh is in flight", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(root, [filter], {
    [filter.id]: {
      fetchedAt: "2026-05-05T12:00:00Z",
      totalCount: 47,
      results: []
    }
  }, {
    tokenConfigured: true,
    loadingFilterIds: new Set([filter.id]),
    activeFilterId: filter.id
  });

  const count = root.querySelector(".count");
  assert.equal(count.textContent, "47");
  assert.equal(count.dataset.state, "has");
});

test("renderPopup renders labels with a colored dot and neutral text", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(
    root,
    [filter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        results: [
          {
            id: 1,
            number: 42,
            title: "Fix dark label contrast",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [{ name: "component:package", color: "000000" }],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      expandedFilterIds: new Set([filter.id])
    }
  );

  const label = root.querySelector(".label");
  const dot = label.querySelector(".label-dot");
  const text = label.querySelector(".label-text");
  assert.equal(text.textContent, "component:package");
  assert.equal(dot.style.backgroundColor, "rgb(0, 0, 0)");
});

test("renderPopup uses custom filter icons in the menu", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(root, [{ ...filter, icon: "ME" }], {}, {
    tokenConfigured: true,
    loadingFilterIds: new Set(),
    expandedFilterIds: new Set([filter.id])
  });

  const icon = root.querySelector(".filter-icon");
  assert.equal(icon.textContent, "ME");
  assert.equal(icon.classList.contains("filter-icon-custom"), true);
  assert.equal(icon.classList.contains("filter-icon-emoji"), false);
});

test("renderPopup styles emoji icons differently from text initials", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(root, [{ ...filter, icon: "🐛" }], {}, {
    tokenConfigured: true,
    loadingFilterIds: new Set(),
    activeFilterId: filter.id
  });

  const icon = root.querySelector(".filter-icon");
  assert.equal(icon.textContent, "🐛");
  assert.equal(icon.classList.contains("filter-icon-emoji"), true);
  assert.equal(icon.classList.contains("filter-icon-custom"), false);
});

test("renderPopup only shows pull requests for the active filter", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");
  const secondFilter = {
    ...filter,
    id: "f2",
    name: "Auth changes",
    query: "label:auth"
  };

  renderPopup(
    root,
    [filter, secondFilter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        results: [
          {
            id: 1,
            number: 42,
            title: "Hidden until selected",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      },
      [secondFilter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        results: [
          {
            id: 2,
            number: 43,
            title: "Visible active PR",
            url: "https://github.com/octo-org/octo-repo/pull/43",
            author: "octocat",
            labels: [],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      activeFilterId: secondFilter.id
    }
  );

  assert.match(root.textContent, /Auth changes/);
  assert.match(root.textContent, /Visible active PR/);
  assert.doesNotMatch(root.querySelector(".menu-panel").textContent, /Hidden until selected/);
  assert.equal(root.querySelector("[data-filter-id='f2']").getAttribute("aria-selected"), "true");
});

test("renderPopup renders a Load more button when the cache has more pages", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(
    root,
    [filter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        totalCount: 47,
        loadedPage: 1,
        hasMore: true,
        results: [
          {
            id: 1,
            number: 42,
            title: "First page entry",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      pagingFilterIds: new Set(),
      activeFilterId: filter.id
    }
  );

  const loadMore = root.querySelector("button[data-action='load-more']");
  assert.equal(loadMore !== null, true);
  assert.equal(loadMore.dataset.filterId, filter.id);
  assert.match(loadMore.textContent, /Load more \(46 remaining\)/);
});

test("renderPopup omits the Load more button when hasMore is false", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(
    root,
    [filter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        totalCount: 1,
        loadedPage: 1,
        hasMore: false,
        results: [
          {
            id: 1,
            number: 42,
            title: "Only entry",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      pagingFilterIds: new Set(),
      activeFilterId: filter.id
    }
  );

  assert.equal(root.querySelector("button[data-action='load-more']"), null);
});

test("renderPopup preserves cached results while showing filter errors", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderPopup(
    root,
    [filter],
    {
      [filter.id]: {
        fetchedAt: "2026-05-05T12:00:00Z",
        error: "API rate limit exceeded",
        results: [
          {
            id: 1,
            number: 42,
            title: "Still visible",
            url: "https://github.com/octo-org/octo-repo/pull/42",
            author: "octocat",
            labels: [],
            state: "open",
            draft: false,
            createdAt: "2026-05-01T12:00:00Z",
            updatedAt: "2026-05-05T11:00:00Z"
          }
        ]
      }
    },
    {
      tokenConfigured: true,
      loadingFilterIds: new Set(),
      expandedFilterIds: new Set([filter.id])
    }
  );

  assert.match(root.textContent, /API rate limit exceeded/);
  assert.match(root.textContent, /Still visible/);
});
