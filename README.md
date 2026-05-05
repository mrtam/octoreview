# Gitmarks

Gitmarks is a Manifest V3 Chrome extension for saving GitHub pull request filters and opening their matching PRs from the toolbar.

## Develop

```sh
npm install
npm run build
npm test
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

## Token

Gitmarks is read-only. Use a GitHub personal access token with read access to the repositories you want to query. The token is stored in `chrome.storage.local`; saved filters and cached result metadata are stored separately.

## Filter Syntax

Each filter combines:

- Repository owner
- Repository name
- GitHub issue/PR search syntax

Gitmarks adds `repo:owner/name type:pr` automatically. If the filter query does not include `is:open`, `is:closed`, `state:open`, `state:closed`, `is:merged`, or `is:unmerged`, Gitmarks adds `is:open`.
