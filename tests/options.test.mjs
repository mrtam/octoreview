import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  draftToFilter,
  readPollingIntervalSelectValue,
  renderFilterList,
  setPollingIntervalSelectValue,
  updateSearchSyntaxState,
  validateFilterDraft
} from "../dist/options.js";

test("validateFilterDraft requires query unless default open PRs is selected", () => {
  const baseDraft = {
    id: "",
    name: "Mine",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "",
    icon: "",
    useDefaultOpen: false,
    enabled: true,
    pollingEnabled: false,
    includeDrafts: true,
    sort: "updated-desc",
    categoryId: ""
  };

  assert.deepEqual(validateFilterDraft(baseDraft), [
    "Search syntax is required unless default open PRs is selected."
  ]);
  assert.deepEqual(validateFilterDraft({ ...baseDraft, useDefaultOpen: true }), []);
});

test("draftToFilter stores blank query for explicit default-open filters", () => {
  const filter = draftToFilter({
    id: "f1",
    name: " Mine ",
    repoOwner: " octo-org ",
    repoName: " octo-repo ",
    query: " ignored ",
    icon: " API ",
    useDefaultOpen: true,
    enabled: true,
    pollingEnabled: false,
    includeDrafts: true,
    sort: "updated-desc",
    categoryId: ""
  });

  assert.equal(filter.name, "Mine");
  assert.equal(filter.repoOwner, "octo-org");
  assert.equal(filter.repoName, "octo-repo");
  assert.equal(filter.query, "");
  assert.equal(filter.icon, "API");
});

test("draftToFilter limits custom filter icons", () => {
  const filter = draftToFilter({
    id: "f1",
    name: "Mine",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "review-requested:@me",
    icon: "ABCDE",
    useDefaultOpen: false,
    enabled: true,
    pollingEnabled: false,
    includeDrafts: true,
    sort: "updated-desc",
    categoryId: ""
  });

  assert.equal(filter.icon, "ABCD");
});

test("draftToFilter preserves the includeDrafts toggle", () => {
  const filter = draftToFilter({
    id: "f1",
    name: "Ready only",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "review-requested:@me",
    icon: "",
    useDefaultOpen: false,
    enabled: true,
    pollingEnabled: false,
    includeDrafts: false,
    sort: "updated-desc",
    categoryId: ""
  });

  assert.equal(filter.includeDrafts, false);
});

test("draftToFilter preserves the polling toggle", () => {
  const filter = draftToFilter({
    id: "f1",
    name: "Team",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "team:octo/reviewers",
    icon: "",
    useDefaultOpen: false,
    enabled: true,
    pollingEnabled: true,
    includeDrafts: true,
    sort: "updated-desc",
    categoryId: ""
  });

  assert.equal(filter.pollingEnabled, true);
});

test("draftToFilter round-trips the categoryId", () => {
  const withCategory = draftToFilter({
    id: "f1",
    name: "Team",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "team:octo/reviewers",
    icon: "",
    useDefaultOpen: false,
    enabled: true,
    pollingEnabled: false,
    includeDrafts: true,
    sort: "updated-desc",
    categoryId: " cat-monolith "
  });
  assert.equal(withCategory.categoryId, "cat-monolith");

  const withoutCategory = draftToFilter({
    id: "f2",
    name: "Other",
    repoOwner: "octo-org",
    repoName: "octo-repo",
    query: "is:open",
    icon: "",
    useDefaultOpen: false,
    enabled: true,
    pollingEnabled: false,
    includeDrafts: true,
    sort: "updated-desc",
    categoryId: ""
  });
  assert.equal("categoryId" in withoutCategory, false);
});

test("polling interval select reads valid values and defaults invalid values", () => {
  const dom = new JSDOM("<select></select>");
  globalThis.document = dom.window.document;
  const select = dom.window.document.querySelector("select");

  for (const value of ["1", "5", "15", "30", "60", "2"]) {
    const option = dom.window.document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }

  setPollingIntervalSelectValue(select, { pollingIntervalMinutes: 1 });
  assert.equal(select.value, "1");
  assert.equal(readPollingIntervalSelectValue(select), 1);

  select.value = "2";
  assert.equal(readPollingIntervalSelectValue(select), 15);
});

test("updateSearchSyntaxState disables query input while default open PRs is selected", () => {
  const dom = new JSDOM(`
    <label class="field">
      <input id="query" type="text" value="review-requested:@me">
      <span id="note" hidden>Ignored.</span>
    </label>
    <input id="default-open" type="checkbox" checked>
  `);
  globalThis.document = dom.window.document;
  const queryInput = dom.window.document.getElementById("query");
  const defaultOpenInput = dom.window.document.getElementById("default-open");
  const note = dom.window.document.getElementById("note");

  updateSearchSyntaxState(queryInput, defaultOpenInput, note);

  assert.equal(queryInput.disabled, true);
  assert.equal(queryInput.value, "review-requested:@me");
  assert.equal(queryInput.placeholder, "Default open PRs selected");
  assert.equal(queryInput.closest(".field").classList.contains("field-disabled"), true);
  assert.equal(note.hidden, false);

  defaultOpenInput.checked = false;
  updateSearchSyntaxState(queryInput, defaultOpenInput, note);

  assert.equal(queryInput.disabled, false);
  assert.equal(queryInput.placeholder, "review-requested:@me -draft:true");
  assert.equal(queryInput.closest(".field").classList.contains("field-disabled"), false);
  assert.equal(note.hidden, true);
});

test("renderFilterList groups by category with uncategorized first", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderFilterList(
    root,
    [
      { id: "f1", name: "Mono A", repoOwner: "o", repoName: "r", query: "is:open", enabled: true, pollingEnabled: false, sort: "updated-desc", includeDrafts: true, categoryId: "cat-mono" },
      { id: "f2", name: "Loose", repoOwner: "o", repoName: "r", query: "is:open", enabled: true, pollingEnabled: false, sort: "updated-desc", includeDrafts: true },
      { id: "f3", name: "CLI A", repoOwner: "o", repoName: "r", query: "is:open", enabled: true, pollingEnabled: false, sort: "updated-desc", includeDrafts: true, categoryId: "cat-cli" },
      { id: "f4", name: "Mono B", repoOwner: "o", repoName: "r", query: "is:open", enabled: true, pollingEnabled: false, sort: "updated-desc", includeDrafts: true, categoryId: "cat-mono" }
    ],
    [
      { id: "cat-mono", name: "Monolith" },
      { id: "cat-cli", name: "CLI" }
    ]
  );

  const sequence = Array.from(root.children).map((node) => {
    if (node.classList.contains("filter-list-category-header")) {
      return `H:${node.querySelector(".category-name-input").value}`;
    }
    return `F:${node.querySelector(".filter-name").textContent}`;
  });

  assert.deepEqual(sequence, [
    "F:Loose",
    "H:Monolith",
    "F:Mono A",
    "F:Mono B",
    "H:CLI",
    "F:CLI A"
  ]);
});

test("renderFilterList category header has drag handle, rename input, and delete button", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderFilterList(
    root,
    [
      { id: "f1", name: "A", repoOwner: "o", repoName: "r", query: "is:open", enabled: true, pollingEnabled: false, sort: "updated-desc", includeDrafts: true, categoryId: "cat-mono" }
    ],
    [{ id: "cat-mono", name: "Monolith" }]
  );

  const header = root.querySelector(".filter-list-category-header");
  assert.ok(header, "expected a category header");
  assert.equal(header.dataset.dragType, "category");
  assert.equal(header.dataset.categoryId, "cat-mono");

  const handle = header.querySelector(".drag-handle");
  assert.ok(handle, "expected a drag handle on the header");
  assert.equal(handle.dataset.dragType, "category");
  assert.equal(handle.dataset.categoryId, "cat-mono");

  const input = header.querySelector("input.category-name-input");
  assert.ok(input, "expected an inline rename input");
  assert.equal(input.value, "Monolith");
  assert.equal(input.dataset.categoryId, "cat-mono");

  const deleteButton = header.querySelector("button[data-action='category-delete']");
  assert.ok(deleteButton, "expected a delete button on the header");
  assert.equal(deleteButton.dataset.categoryId, "cat-mono");
});

test("renderFilterList renders actions for saved filters", () => {
  const dom = new JSDOM("<main id=\"root\"></main>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.getElementById("root");

  renderFilterList(root, [
    {
      id: "f1",
      name: "Needs review",
      repoOwner: "octo-org",
      repoName: "octo-repo",
      query: "review-requested:@me",
      icon: "ME",
      enabled: true,
      pollingEnabled: true,
      sort: "updated-desc"
    }
  ]);

  assert.match(root.textContent, /Needs review/);
  assert.match(root.textContent, /polling/);
  assert.equal(root.querySelector(".filter-list-icon").textContent, "ME");
  assert.equal(root.querySelector(".filter-item").dataset.polling, "true");
  assert.equal(root.querySelectorAll("button[data-action]").length, 3);
  assert.ok(root.querySelector(".drag-handle"), "expected a drag handle");
  assert.match(
    root.querySelector("button[data-action='open']").getAttribute("aria-label"),
    /Open/
  );
  assert.match(
    root.querySelector("button[data-action='delete']").getAttribute("aria-label"),
    /Delete/
  );
});
