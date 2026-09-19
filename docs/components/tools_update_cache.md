# External Tools Update Cache Component

AnEdiKit implements an automatic 24-hour cache for external tool release and update queries to prevent unnecessary network overhead and avoid hitting GitHub public REST API rate limits.

## Files & Architecture

- **JavaScript Modules**:
  - `src/js/storage.js`: Exposes storage keys and persistence operations `getToolsUpdateCache()`, `saveToolsUpdateCache(cacheData)`, and `clearToolsUpdateCache()`.
  - `src/js/tools_manager.js`: Handles version checks via `fetchLatestGitHubReleases({ force = false })` and `refreshToolsUI({ force = false })`.
- **Manifest**:
  - `src/data/tools-manifest.json`: Manifest listing external binaries and dependencies (FFmpeg, yt-dlp, Deno, Python).

## Cache Container Location

The tools update status cache is stored inside application configuration and web storage using dedicated container keys:

1. Primary Config Container:
   - Key: `anedikit:settings`
   - Property: `toolsUpdateCache`
2. Dedicated Storage Key:
   - Key: `anedikit:cache:tools_update`

Both locations are synchronized when saving cache state. When reading cache status, AnEdiKit first inspects the application configuration container (`settings.toolsUpdateCache`) and falls back to the dedicated storage key (`anedikit:cache:tools_update`).

## Cache Payload Schema

```json
{
  "timestamp": 1726740000000,
  "releases": {
    "ffmpeg": "2026-09-13",
    "ffmpeg_latest": "2026-09-13",
    "ffprobe": "2026-09-13",
    "ffprobe_latest": "2026-09-13",
    "ytdlp": "2026.08.19",
    "ytdlp_latest": "2026.08.19",
    "deno": "2.9.6",
    "deno_latest": "2.9.6",
    "python": "Available",
    "python_latest": "Available"
  }
}
```

Fields:
- `timestamp` (number): Epoch timestamp in milliseconds recording when releases were last fetched.
- `releases` (object): Map of tool identifiers and resolved release versions or published dates.

## Expiration & Re-fetch Policy

- Cache Duration (TTL): 24 hours (`86,400,000` milliseconds / `24 * 60 * 60 * 1000`).
- Cache Hits: If `Date.now() - timestamp < 24 hours`, `fetchLatestGitHubReleases()` immediately returns the cached releases without executing network HTTP calls.
- Cache Expiration: Once 24 hours elapse, the next tool check or modal view automatically queries GitHub API releases and updates the cache container with fresh versions.
- Manual Refetch / Clearing Cache:
  - When the user clicks the "Check for Updates" button (`#btn-check-all-updates`), a forced refresh is triggered (`force: true`), bypassing the cache.
  - Calling `clearToolsUpdateCache()` or resetting `toolsUpdateCache` in application settings clears the stored cache state, causing the next query to immediately re-fetch latest releases.
  - Inside the Manage Tools dialog (`#manage-tools-modal`), the "Clear Update Cache" button (`#btn-clear-tools-cache`) clears the cache and immediately initiates a live background check, while the status text (`#tools-cache-status-text`) indicates the elapsed cache age and number of cached items (e.g., `Update status cache: Last checked 15m ago (4 items cached)`).

## UI Placement & Feedback

Both cache controls live inside the Manage Tools dialog so the cache and the tools it describes are managed in one place:

- `#tools-cache-status-text` sits at the top of `.modal-body`, above the tool rows it summarizes. `renderToolsCacheStatus()` is re-run on the dialog's `show.bs.modal` event so the relative age ("15m ago") is current every time it opens, not just when a background fetch lands.
- `#btn-clear-tools-cache` sits in `.modal-footer` next to "Check for Updates".
- While the clear is running the button is disabled and switches from `btn-outline-secondary` to `btn-secondary btn-shimmer` with a "Clearing..." label, mirroring the Manage Tools in-progress treatment. The outline variant is transparent, so the shimmer sheen would not read on it; the filled variant is what makes the sweep visible.
- `lockToolsCacheButton()` in `src/js/tools_manager.js` disables the button for the duration of any tool update or delete, because both actions now share one footer. It preserves the prior disabled state on restore, so an in-flight cache clear is never re-enabled by an unrelated operation.
- The placement is enforced by the `Contract: Manage Tools cache controls placement` suite in `test/unit/contract.test.js`, which fails if either element is duplicated or moved outside `#manage-tools-modal`, or if `app_settings.js` and `index.html` drift apart on those element ids.

