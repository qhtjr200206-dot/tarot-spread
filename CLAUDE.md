# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static tarot-reading archive site (no build step, no backend server) hosted on GitHub Pages. An admin defines "spreads" (a question + numbered card positions, each with its own meaning) and records dated "readings" against a spread (actual cards drawn per position + AI interpretation + personal notes). The intended use case is literary character analysis via tarot (see the `karamazov-*` spreads in `data/spreads/`), not generic fortune-telling — this shapes the tone of AI-generated content (see Gemini prompt below).

Full product spec: `PLAN.md`. Step-by-step build rationale and failure-mode checklist: `BUILD_GUIDE.md`.

## Commands

There is no bundler, package manager, linter, or test runner at the repo root — it's plain HTML/CSS/JS served as-is.

- **Run locally**: `npx http-server -p 8080 -c-1 .` then open `http://localhost:8080`. `fetch()` calls fail under `file://`, so a local server is required. Avoid `npx serve` — it silently strips query strings on its clean-URL redirects (`spread.html?id=x` → `/spread`), which breaks every page that reads `?id=`/`?spread=`.
- **Syntax-check a client script**: `node --check assets/js/<file>.js`.
- **Test the Actions Gemini script in isolation**: it's `type: module` via `.mjs` extension; import `process-requests.mjs` after mocking `global.fetch` and setting `process.env.GEMINI_API_KEY`/`GEMINI_MODEL`, run from a directory containing a `data/_requests/*.json` fixture. There is no existing test suite/harness in the repo for this — write a throwaway script when needed.
- **Manually trigger the Gemini workflow**: commit a JSON file to `data/_requests/{id}.json` and push (or `gh workflow run gemini-interpret.yml`); watch with `gh run watch`.

## Architecture

### The repo is the database

There's no server and no database. All content lives as JSON under `data/` and is read via plain `fetch()` from the deployed GitHub Pages site. The admin UI *writes* by calling the GitHub Contents API directly from the browser (`assets/js/github-api.js`) using a Personal Access Token the admin pastes into `/admin/login.html` (kept only in `sessionStorage`, never persisted). There is no CMS, no serverless write endpoint — write access is entirely "does this token have Contents:Read-and-write on this repo."

`commitJsonFile(path, mutateFn, message)` in `github-api.js` is the only way data files should be written. It re-fetches the file's current `sha` immediately before every write and retries once on 409, because several files (`data/spreads/index.json`, `data/readings/{spreadId}/index.json`) are shared "index" files touched by multiple independent admin actions. Do not add a second, ad-hoc way of writing JSON to the repo.

Data shape: `data/spreads/index.json` (summary list) + `data/spreads/{id}.json` (full spread incl. `positions[]`) + `data/readings/{spreadId}/index.json` (summary list) + `data/readings/{spreadId}/{readingId}.json` (full reading incl. `cards[]`, optional `characterContext`). See `PLAN.md` §6 for the exact schema.

### AI interpretation is asynchronous and never touches the browser directly

`gemini-client.js`'s `requestAiInterpretation()` does **not** call the Gemini API. It commits a request file to `data/_requests/{requestId}.json`, then polls `data/_responses/{requestId}.json` (via `ghGetJsonFile`, 4s interval, ~2min timeout) until the GitHub Actions workflow `.github/workflows/gemini-interpret.yml` produces it. That workflow triggers on push to `data/_requests/**`, runs `.github/scripts/process-requests.mjs` (uses the repo secret `GEMINI_API_KEY`, looks up per-card upright/reversed summaries from `.github/scripts/card-meanings.mjs` to enrich the prompt, calls Gemini once with a JSON `responseSchema`), writes the response file, deletes the request file, and commits with `[skip ci]` (so its own commit doesn't re-trigger itself).

**This is deliberate, not incidental complexity — do not "simplify" it back to a direct client-side fetch or a Cloudflare Worker proxy.** A Cloudflare Worker version was built first and abandoned: Cloudflare Workers execute from arbitrary global edge PoPs on the free plan (no jurisdiction pinning outside Enterprise), and Google's Gemini API geo-blocks some of those regions, so calls failed consistently with `FAILED_PRECONDITION: User location is not supported`, unfixable for free. GitHub Actions runners don't have this problem. If Gemini integration needs to change, keep the request/response-file pattern.

`GEMINI_MODEL` is set in the workflow env (currently `gemini-2.5-flash`). Google's free-tier model lineup changes often and old models get hard-deprecated (e.g. `gemini-2.0-flash` was shut down 2026-03, `gemini-2.5-flash-lite` is closed to new users) — a `429`/`404` here is often just a stale model name, not a real quota problem. Check https://aistudio.google.com/rate-limit before assuming code is broken.

### No separate admin auth system

"Admin" == "has a GitHub PAT with write access to this repo," checked once against `GET /repos/{owner}/{repo}` in `verifyAdminToken()` (`auth.js`). Pages under `admin/` self-guard by checking `isAdminLoggedIn()` and redirecting to `login.html`. There's intentionally no separate secret/allowlist for who can trigger the Gemini workflow — anyone who can write to the repo already has full admin capability anyway.

### Path/config gotchas specific to this deployment

- Pages under `admin/` use `../assets/...` and `../index.html`; root pages use `./assets/...`. GitHub Pages serves this repo at a subpath (`/tarot-spread/`), so absolute paths (`/assets/...`) break — always relative.
- `assets/js/config.js` holds `githubOwner`/`githubRepo`/`githubBranch` plus AI polling timing constants — it's the one place deployment-specific values live.
- `.nojekyll` must stay at repo root (no build step needed; without it GitHub Pages' Jekyll processing can mangle `_`-prefixed paths, which matters here because `data/_requests/` and `data/_responses/` start with `_`).
- New JSON files (spreads, readings) must Base64-encode with `btoa(unescape(encodeURIComponent(json)))`, not plain `btoa`, or Korean text corrupts.
