import { buildFilterWebUrl, validateGitHubToken } from "./github.js";
import { FILTER_ICONS, FILTER_ICON_CATEGORIES } from "./icons.js";
import {
  clearGitHubToken,
  getFilters,
  getGitHubToken,
  saveFilters,
  saveGitHubToken
} from "./storage.js";
import type { FilterSort, SavedFilter } from "./types.js";
import { UI_ICONS, type UiIconName } from "./ui-icons.js";

type ListAction = "open" | "edit" | "delete";

const LIST_ACTIONS: ReadonlyArray<{ action: ListAction; icon: UiIconName; label: (name: string) => string; danger?: boolean }> = [
  { action: "open", icon: "open", label: (n) => `Open ${n}` },
  { action: "edit", icon: "edit", label: (n) => `Edit ${n}` },
  { action: "delete", icon: "delete", label: (n) => `Delete ${n}`, danger: true }
];

interface FilterDraft {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  query: string;
  icon: string;
  useDefaultOpen: boolean;
  enabled: boolean;
  includeDrafts: boolean;
  sort: FilterSort;
}

interface OptionsState {
  filters: SavedFilter[];
}

const state: OptionsState = {
  filters: []
};

export function validateFilterDraft(draft: FilterDraft): string[] {
  const errors: string[] = [];

  if (!draft.name.trim()) {
    errors.push("Name is required.");
  }

  if (!draft.repoOwner.trim()) {
    errors.push("Owner is required.");
  }

  if (!draft.repoName.trim()) {
    errors.push("Repository is required.");
  }

  if (!draft.query.trim() && !draft.useDefaultOpen) {
    errors.push("Search syntax is required unless default open PRs is selected.");
  }

  return errors;
}

export function draftToFilter(draft: FilterDraft): SavedFilter {
  return {
    id: draft.id || createId(),
    name: draft.name.trim(),
    repoOwner: draft.repoOwner.trim(),
    repoName: draft.repoName.trim(),
    query: draft.useDefaultOpen ? "" : draft.query.trim(),
    icon: normalizeIcon(draft.icon),
    enabled: draft.enabled,
    includeDrafts: draft.includeDrafts,
    sort: draft.sort
  };
}

export function updateSearchSyntaxState(
  queryInput: HTMLInputElement,
  defaultOpenInput: HTMLInputElement,
  note?: HTMLElement | null
): void {
  const useDefaultOpen = defaultOpenInput.checked;
  queryInput.disabled = useDefaultOpen;
  queryInput.placeholder = useDefaultOpen ? "Default open PRs selected" : "review-requested:@me -draft:true";
  queryInput.closest(".field")?.classList.toggle("field-disabled", useDefaultOpen);

  if (note) {
    note.hidden = !useDefaultOpen;
  }
}

export function renderFilterList(root: HTMLElement, filters: SavedFilter[]): void {
  root.replaceChildren();

  if (filters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "filter-item filter-item-empty";
    empty.textContent = "No filters saved.";
    root.append(empty);
    return;
  }

  for (const filter of filters) {
    const item = document.createElement("article");
    item.className = "filter-item";
    item.dataset.filterId = filter.id;
    item.dataset.disabled = String(!filter.enabled);

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.dataset.filterId = filter.id;
    handle.setAttribute("aria-label", `Reorder ${filter.name}`);
    handle.title = "Drag to reorder";
    handle.innerHTML = UI_ICONS.grip;

    const details = document.createElement("div");
    details.className = "filter-details-col";
    const nameRow = document.createElement("div");
    nameRow.className = "filter-name-row";
    const name = document.createElement("div");
    name.className = "filter-name";
    name.textContent = filter.name;
    if (filter.icon) {
      const icon = document.createElement("span");
      icon.className = "filter-list-icon";
      if (isEmojiIcon(filter.icon)) {
        icon.classList.add("filter-list-icon-emoji");
      }
      icon.textContent = filter.icon;
      nameRow.append(icon);
    }
    nameRow.append(name);
    const meta = document.createElement("div");
    meta.className = "filter-details";
    meta.textContent = `${filter.repoOwner}/${filter.repoName} · ${filter.query || "is:open"} · ${filter.sort}`;
    details.append(nameRow, meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    for (const spec of LIST_ACTIONS) {
      actions.append(createListButton(spec.action, filter.id, filter.name, spec.icon, spec.label(filter.name), spec.danger ?? false));
    }

    item.append(handle, details, actions);
    root.append(item);
  }
}

async function bootstrapOptions(): Promise<void> {
  state.filters = await getFilters();

  inflateInlineIcons(document);

  const tokenInput = getInput("token-input");
  const token = await getGitHubToken();
  tokenInput.value = token ? "token saved" : "";

  getElement("token-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveTokenFromForm();
  });

  getElement("validate-token-button").addEventListener("click", () => {
    void validateTokenFromForm();
  });

  getElement("clear-token-button").addEventListener("click", () => {
    void clearTokenFromForm();
  });

  getElement("new-filter-button").addEventListener("click", () => {
    resetFilterForm();
    openEditorDialog("new");
  });

  getElement("filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveFilterFromForm();
  });

  setupIconPickerDialog();
  setupEditorDialog();
  setupFilterListDragDrop();

  getInput("filter-default-open").addEventListener("change", () => {
    syncSearchSyntaxState();
  });

  getElement("cancel-edit-button").addEventListener("click", () => {
    closeEditorDialog();
  });

  getElement("filter-list").addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button");

    if (!button) {
      return;
    }

    if (button.classList.contains("drag-handle")) {
      return;
    }

    void handleFilterAction(button.dataset.action || "", button.dataset.filterId || "");
  });

  renderAll();
  resetFilterForm();
}

async function saveTokenFromForm(): Promise<void> {
  const tokenInput = getInput("token-input");
  const token = tokenInput.value.trim();

  if (!token || token === "token saved") {
    setStatus("Enter a token first.");
    return;
  }

  await saveGitHubToken(token);
  tokenInput.value = "token saved";
  setStatus("Token saved.");
}

async function validateTokenFromForm(): Promise<void> {
  const tokenInput = getInput("token-input");
  const storedToken = await getGitHubToken();
  const token = tokenInput.value.trim() === "token saved" ? storedToken : tokenInput.value.trim();

  if (!token) {
    setStatus("Enter a token first.");
    return;
  }

  try {
    const login = await validateGitHubToken(token);
    setStatus(`Validated as ${login}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Token validation failed.");
  }
}

async function clearTokenFromForm(): Promise<void> {
  await clearGitHubToken();
  getInput("token-input").value = "";
  setStatus("Token cleared.");
}

async function saveFilterFromForm(): Promise<void> {
  const draft = readFilterDraft();
  const errors = validateFilterDraft(draft);
  const errorRoot = getElement("filter-errors");

  if (errors.length > 0) {
    errorRoot.textContent = errors.join(" ");
    return;
  }

  errorRoot.textContent = "";

  const filter = draftToFilter(draft);
  const existingIndex = state.filters.findIndex((item) => item.id === filter.id);

  if (existingIndex >= 0) {
    state.filters = state.filters.map((item) => (item.id === filter.id ? filter : item));
  } else {
    state.filters = [...state.filters, filter];
  }

  await saveFilters(state.filters);
  renderAll();
  resetFilterForm();
  closeEditorDialog();
  setStatus("Filter saved.");
}

async function handleFilterAction(action: string, filterId: string): Promise<void> {
  const index = state.filters.findIndex((filter) => filter.id === filterId);

  if (index < 0) {
    return;
  }

  const filter = state.filters[index];

  if (!filter) {
    return;
  }

  if (action === "open") {
    void chrome.tabs.create({ url: buildFilterWebUrl(filter) });
    return;
  }

  if (action === "edit") {
    populateFilterForm(filter);
    openEditorDialog("edit");
    return;
  }

  if (action === "delete") {
    state.filters = state.filters.filter((item) => item.id !== filterId);
    await saveFilters(state.filters);
    renderAll();
    setStatus("Filter deleted.");
    return;
  }
}

function readFilterDraft(): FilterDraft {
  return {
    id: getInput("filter-id").value,
    name: getInput("filter-name").value,
    repoOwner: getInput("filter-owner").value,
    repoName: getInput("filter-repo").value,
    query: getInput("filter-query").value,
    icon: getInput("filter-icon").value,
    useDefaultOpen: getInput("filter-default-open").checked,
    enabled: getInput("filter-enabled").checked,
    includeDrafts: getInput("filter-include-drafts").checked,
    sort: getInput("filter-sort").value as FilterSort
  };
}

function populateFilterForm(filter: SavedFilter): void {
  getInput("filter-id").value = filter.id;
  getInput("filter-name").value = filter.name;
  getInput("filter-owner").value = filter.repoOwner;
  getInput("filter-repo").value = filter.repoName;
  getInput("filter-query").value = filter.query;
  setIconValue(filter.icon || "");
  getInput("filter-default-open").checked = filter.query.length === 0;
  getInput("filter-enabled").checked = filter.enabled;
  getInput("filter-include-drafts").checked = filter.includeDrafts !== false;
  getInput("filter-sort").value = filter.sort;
  getElement("filter-errors").textContent = "";
  syncSearchSyntaxState();
}

function resetFilterForm(): void {
  getInput("filter-id").value = "";
  getInput("filter-name").value = "";
  getInput("filter-owner").value = "";
  getInput("filter-repo").value = "";
  getInput("filter-query").value = "";
  setIconValue("");
  getInput("filter-default-open").checked = true;
  getInput("filter-enabled").checked = true;
  getInput("filter-include-drafts").checked = true;
  getInput("filter-sort").value = "updated-desc";
  getElement("filter-errors").textContent = "";
  syncSearchSyntaxState();
}

function setupIconPickerDialog(): void {
  const trigger = getElement("filter-icon-trigger") as HTMLButtonElement;
  const clearBtn = getElement("filter-icon-clear") as HTMLButtonElement;
  const dialog = getElement("icon-picker-dialog") as HTMLDialogElement;
  const search = getInput("icon-picker-search");
  const grid = getElement("icon-picker-grid");
  const noneBtn = getElement("icon-picker-none") as HTMLButtonElement;

  renderIconPickerGrid(grid, "");

  trigger.addEventListener("click", () => {
    if (typeof dialog.showModal !== "function") {
      return;
    }

    search.value = "";
    renderIconPickerGrid(grid, "");
    syncIconPickerSelection(grid, getInput("filter-icon").value);
    dialog.showModal();
    requestAnimationFrame(() => {
      search.focus();
    });
  });

  clearBtn.addEventListener("click", () => {
    setIconValue("");
  });

  noneBtn.addEventListener("click", () => {
    setIconValue("");
    dialog.close();
  });

  search.addEventListener("input", () => {
    renderIconPickerGrid(grid, search.value);
    syncIconPickerSelection(grid, getInput("filter-icon").value);
  });

  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const first = grid.querySelector<HTMLButtonElement>(".icon-option");

    if (first) {
      setIconValue(first.dataset.iconValue || "");
      dialog.close();
    }
  });

  grid.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>(".icon-option");

    if (!button) {
      return;
    }

    setIconValue(button.dataset.iconValue || "");
    dialog.close();
  });
}

function renderIconPickerGrid(grid: HTMLElement, query: string): void {
  grid.replaceChildren();
  const empty = document.getElementById("icon-picker-empty");
  const term = query.trim().toLowerCase();
  let total = 0;

  for (const category of FILTER_ICON_CATEGORIES) {
    const matches = FILTER_ICONS.filter((icon) => icon.category === category && iconMatches(icon, term));

    if (matches.length === 0) {
      continue;
    }

    const heading = document.createElement("div");
    heading.className = "icon-picker-category";
    heading.textContent = category;
    grid.append(heading);

    for (const icon of matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-option";
      btn.dataset.iconValue = icon.value;
      btn.title = icon.label;
      btn.setAttribute("aria-label", icon.label);
      btn.setAttribute("role", "radio");
      btn.textContent = icon.value;
      grid.append(btn);
      total += 1;
    }
  }

  if (empty) {
    empty.hidden = total > 0;
  }
}

function iconMatches(icon: { label: string; searchTerms: ReadonlyArray<string> }, term: string): boolean {
  if (!term) {
    return true;
  }

  if (icon.label.toLowerCase().includes(term)) {
    return true;
  }

  return icon.searchTerms.some((s) => s.includes(term));
}

function syncIconPickerSelection(container: HTMLElement, value: string): void {
  for (const button of container.querySelectorAll<HTMLButtonElement>(".icon-option")) {
    const isSelected = button.dataset.iconValue === value;
    button.setAttribute("aria-checked", String(isSelected));
    button.classList.toggle("is-selected", isSelected);
  }
}

function setIconValue(value: string): void {
  getInput("filter-icon").value = value;
  renderIconTrigger(value);
}

function renderIconTrigger(value: string): void {
  const preview = getElement("filter-icon-trigger-preview");
  const label = getElement("filter-icon-trigger-label");
  const clearBtn = getElement("filter-icon-clear");
  preview.textContent = value;
  label.textContent = value ? "Change icon" : "Choose icon";
  clearBtn.hidden = !value;
}

function renderAll(): void {
  renderFilterList(getElement("filter-list"), state.filters);
}

function createListButton(
  action: ListAction,
  filterId: string,
  _filterName: string,
  iconName: UiIconName,
  ariaLabel: string,
  danger: boolean
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "icon-button icon-button-danger" : "icon-button";
  button.innerHTML = UI_ICONS[iconName];
  button.dataset.action = action;
  button.dataset.filterId = filterId;
  button.setAttribute("aria-label", ariaLabel);
  button.title = ariaLabel;
  return button;
}

function setStatus(message: string): void {
  getElement("status").textContent = message;
}

function syncSearchSyntaxState(): void {
  updateSearchSyntaxState(
    getInput("filter-query") as HTMLInputElement,
    getInput("filter-default-open") as HTMLInputElement,
    getElement("filter-query-note")
  );
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() || `filter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeIcon(icon: string | undefined): string {
  return Array.from((icon || "").trim()).slice(0, 4).join("");
}

function isEmojiIcon(value: string): boolean {
  return value.length > 0 && /\p{Extended_Pictographic}/u.test(value) && !/[\p{L}\p{N}]/u.test(value);
}

function getInput(id: string): HTMLInputElement & HTMLSelectElement {
  return getElement(id) as HTMLInputElement & HTMLSelectElement;
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }

  return element;
}

function inflateInlineIcons(scope: Document | HTMLElement): void {
  const slots = scope.querySelectorAll<HTMLElement>(".button-icon[data-icon]");

  for (const slot of slots) {
    const name = slot.dataset.icon as UiIconName | undefined;

    if (name && name in UI_ICONS) {
      slot.innerHTML = UI_ICONS[name];
    }
  }
}

function setupEditorDialog(): void {
  const dialog = getElement("filter-editor-dialog") as HTMLDialogElement;

  getElement("filter-editor-close").addEventListener("click", () => {
    closeEditorDialog();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeEditorDialog();
    }
  });

  dialog.addEventListener("cancel", () => {
    closeEditorDialog();
  });
}

function openEditorDialog(mode: "new" | "edit"): void {
  const dialog = getElement("filter-editor-dialog") as HTMLDialogElement;
  const heading = getElement("editor-heading");
  heading.textContent = mode === "new" ? "New filter" : "Edit filter";

  if (typeof dialog.showModal === "function" && !dialog.open) {
    dialog.showModal();
  }

  requestAnimationFrame(() => {
    getInput("filter-name").focus();
  });
}

function closeEditorDialog(): void {
  const dialog = getElement("filter-editor-dialog") as HTMLDialogElement;

  if (dialog.open) {
    dialog.close();
  }
}

function setupFilterListDragDrop(): void {
  const list = getElement("filter-list");

  list.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement | null;
    const handle = target?.closest<HTMLButtonElement>(".drag-handle");
    const item = handle?.closest<HTMLElement>(".filter-item");

    if (handle && item) {
      item.draggable = true;
    }
  });

  list.addEventListener("mouseup", () => clearDraggableFlags(list));
  list.addEventListener("dragend", (event) => {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(".filter-item");
    item?.classList.remove("is-dragging");
    clearDropMarkers(list);
    clearDraggableFlags(list);
  });

  list.addEventListener("dragstart", (event) => {
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLElement>(".filter-item");

    if (!item || !item.draggable || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.dataset.filterId || "");
    item.classList.add("is-dragging");
  });

  list.addEventListener("dragover", (event) => {
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLElement>(".filter-item");

    if (!item || item.classList.contains("is-dragging")) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    clearDropMarkers(list);
    const rect = item.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    item.classList.add(before ? "drop-before" : "drop-after");
  });

  list.addEventListener("dragleave", (event) => {
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLElement>(".filter-item");
    item?.classList.remove("drop-before", "drop-after");
  });

  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = event.target as HTMLElement | null;
    const targetItem = target?.closest<HTMLElement>(".filter-item");
    const sourceId = event.dataTransfer?.getData("text/plain");
    clearDropMarkers(list);
    clearDraggableFlags(list);

    if (!targetItem || !sourceId) {
      return;
    }

    const targetId = targetItem.dataset.filterId || "";

    if (!targetId || targetId === sourceId) {
      return;
    }

    const rect = targetItem.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    void reorderFilters(sourceId, targetId, before);
  });

  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    const target = event.target as HTMLElement | null;
    const handle = target?.closest<HTMLButtonElement>(".drag-handle");

    if (!handle) {
      return;
    }

    event.preventDefault();
    const filterId = handle.dataset.filterId || "";
    const delta = event.key === "ArrowUp" ? -1 : 1;
    void moveFilterByOffset(filterId, delta);
  });
}

function clearDropMarkers(list: HTMLElement): void {
  for (const el of list.querySelectorAll<HTMLElement>(".drop-before, .drop-after")) {
    el.classList.remove("drop-before", "drop-after");
  }
}

function clearDraggableFlags(list: HTMLElement): void {
  for (const el of list.querySelectorAll<HTMLElement>(".filter-item[draggable='true']")) {
    el.draggable = false;
  }
}

async function reorderFilters(sourceId: string, targetId: string, before: boolean): Promise<void> {
  const sourceIndex = state.filters.findIndex((f) => f.id === sourceId);
  const targetIndex = state.filters.findIndex((f) => f.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return;
  }

  const next = [...state.filters];
  const [moved] = next.splice(sourceIndex, 1);

  if (!moved) {
    return;
  }

  let insertIndex = next.findIndex((f) => f.id === targetId);

  if (insertIndex < 0) {
    return;
  }

  if (!before) {
    insertIndex += 1;
  }

  next.splice(insertIndex, 0, moved);
  state.filters = next;
  await saveFilters(state.filters);
  renderAll();
  refocusHandle(sourceId);
}

async function moveFilterByOffset(filterId: string, delta: number): Promise<void> {
  const index = state.filters.findIndex((f) => f.id === filterId);
  const targetIndex = index + delta;

  if (index < 0 || targetIndex < 0 || targetIndex >= state.filters.length) {
    return;
  }

  const next = [...state.filters];
  const a = next[index];
  const b = next[targetIndex];

  if (!a || !b) {
    return;
  }

  next[index] = b;
  next[targetIndex] = a;
  state.filters = next;
  await saveFilters(state.filters);
  renderAll();
  refocusHandle(filterId);
}

function refocusHandle(filterId: string): void {
  const list = document.getElementById("filter-list");
  const handle = list?.querySelector<HTMLButtonElement>(`.drag-handle[data-filter-id="${cssEscape(filterId)}"]`);
  handle?.focus();
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

if (typeof document !== "undefined" && document.body?.dataset.page === "options") {
  void bootstrapOptions();
}
