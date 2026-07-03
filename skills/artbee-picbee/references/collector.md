# ArtStation Collector Reference

## Goal

Keep collection responsive and recoverable. A click on "开始采集" should return quickly with useful results or a clear reason why ArtStation blocked the request.

## Fast Collection Pattern

- Use `GET /api/scan-artstation`.
- Keep the server-side scanner on public search result payloads.
- Convert each result into an ArtBee shot with preview image, title, artist, source URL, likes, tags, freshness score, and inferred composition tags.
- Save library data through the app's persistence path instead of browser-only temporary state.

## Bounded Request Strategy

- Prefer `DEFAULT_SCAN_PAGES = 1` for each user click.
- Keep proxy and direct request timeouts near 10 seconds.
- Let the next click continue pagination with `nextPage`.
- If the user supplies a proxy, try that proxy first and direct second. Avoid long fallback lists during a single request.

## Proxy Notes

- Clash Verge HTTP proxy commonly uses `http://127.0.0.1:7897`.
- SOCKS-only addresses are not enough for the current HTTP CONNECT helper.
- TUN mode can help browser traffic, but Node requests still need either system routing support or an explicit HTTP proxy.
- 403 from ArtStation means the request reached ArtStation and was refused. It is different from local server failure.

## Errors To Preserve

- Local server missing: tell the user to start ArtBee PicBee and use `127.0.0.1:8791` or the printed LAN URL.
- Proxy unreachable: mention the proxy address and suggest checking Clash system proxy, HTTP port, or node health.
- ArtStation 403: say the current node/session is blocked by ArtStation and suggest a different global node or retry later.
- Timeout: say the search endpoint is slow and the next click can continue, after verifying the timeout matches actual constants.

## Do Not

- Do not scrape, store, or redistribute original ArtStation images as normal behavior.
- Do not add hidden long-running loops that make the front end look frozen.
- Do not remove existing collected data while testing.
