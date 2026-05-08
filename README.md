# OctoReview

OctoReview is a Manifest V3 Chrome extension for saving GitHub pull request filters and opening their matching PRs from the toolbar.

## Develop

```sh
npm install
npm run build
npm test
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

## Token

OctoReview is read-only. Use a GitHub personal access token with read access to the repositories you want to query. The token is stored in `chrome.storage.local`; saved filters and cached result metadata are stored separately.

## Polling

Filters can opt into background polling from the options page. OctoReview uses one app-wide polling interval and shows a purple toolbar badge when a polled filter finds a PR that was not present in that filter's previous cached result set. Opening the toolbar popup clears the unread badge, and each filter-level dot clears when that filter is hovered or focused.

## Filter Syntax

Each filter combines:

- Repository owner
- Repository name
- GitHub issue/PR search syntax

OctoReview adds `repo:owner/name type:pr` automatically. If the filter query does not include `is:open`, `is:closed`, `state:open`, `state:closed`, `is:merged`, or `is:unmerged`, OctoReview adds `is:open`.
