---
name: artbee-picbee
description: Maintain, debug, run, and deploy the ArtBee PicBee visual index web app. Use when Codex works on ArtBee, PicBee, FrameScout, the ArtStation collector, collection failures, 403 or timeout errors, Clash/VPN proxy or TUN setup, LAN sharing, NAS/cloud deployment, liquid-glass UI changes, accounts, comments, favorites, or recovery of collected image data.
---

# ArtBee PicBee

## Locate The Active Project

- Verify the project root before editing. A valid root normally contains `server.js`, `package.json`, `outputs/app.js`, and `outputs/index.html`.
- Do not assume the current working directory is the active app. The user has used both `C:\Users\26345\Documents\Codex\new-chat-fast-search` and `C:\Users\26345\Documents\Codex\2026-06-28\new-chat`.
- If the browser shows `127.0.0.1:8791`, check the launch script and running folder before changing files.

## Preserve User Data

- Never delete or overwrite `data/artbee-library.json`, `data/artbee-users.json`, or `data/artbee-comments.json` unless the user explicitly asks.
- Treat collected images, users, comments, and favorites as user data. Back up or inspect before migrations.
- If images seem to disappear, check whether the browser is using a different project folder, port, storage key, or data directory before assuming data loss.

## Run And Verify

- Prefer the Node server entry point: `node server.js`.
- LAN mode should start the full backend, not only static files. `outputs/start-artbee-lan.cmd` should eventually run `node server.js`.
- Use `PORT=8791` and `HOST=0.0.0.0` for local/LAN testing when matching the user's current browser URL.
- Validate edits with `node --check server.js`. For frontend-only changes, inspect `outputs/app.js` and `outputs/index.html` for missing elements or stale ids.
- Run `scripts/healthcheck.ps1` from this skill when orientation is needed.

## ArtStation Collector

- Default to fast search mode. Use ArtStation public search result payloads for title, artist, likes, cover image, and source URL.
- Do not reintroduce broad project-detail crawling into normal collection. Detail JSON and original-image lookup often return 403 or time out through proxies.
- Keep each click bounded: small page count, short per-request timeout, and continue pagination on the next click.
- When a user-provided HTTP proxy is present, prefer it and avoid trying many fallback ports in sequence. Trying `7897`, `7890`, `7891`, `7899`, `10809`, then direct can consume the entire scan timeout.
- A 403 usually means ArtStation blocked the node/proxy session, not that the app UI is broken. Suggest changing to another global node, waiting, or using browser-assisted import only if the user wants it.
- The user asked to remove the manual import panel from the visible sidebar. Do not add it back unless explicitly requested.
- Read `references/collector.md` before changing scan behavior.

## UI Direction

- Keep the product name `ArtBee PicBee`.
- Match the light liquid-glass style: soft translucent panels, rounded glass surfaces, Gemini-like pastel gradient background, and a blue accent.
- Keep the main app visually consistent with the login/home screen.
- Prefer compact thumbnail grids. The user has asked for smaller thumbnails and fewer always-visible labels; show detailed title, author, likes, tags, comments, and source actions in the detail view.
- Keep composition guide lines out of thumbnails unless the user explicitly asks to restore them.
- Use clear Chinese UI text where the existing interface is Chinese.

## Deployment Guidance

- For other devices on the same Wi-Fi, use LAN mode and the host machine IPv4 address with port `8791`.
- For friends outside the LAN, prefer a small cloud server or a tunnel over exposing a home PC. NAS deployment can work, but remote NAS management adds friction when the NAS is physically elsewhere.
- Do not store or redistribute original ArtStation images as if owned. Preserve source links and use public preview metadata for indexing.
- Read `references/deployment.md` before advising on NAS, Alibaba Cloud, or lightweight public deployment.

## Editing Rules

- Keep fixes scoped. Avoid unrelated UI redesign while debugging collection.
- When changing collection, update error messages so they match the actual timeout and proxy behavior.
- After backend changes, remind the user to close and reopen the server command window; refreshing the browser alone does not reload `server.js`.
