# ArtBee PicBee

ArtBee PicBee is a private visual index for collecting and organizing high-like environmental concept art references.

## Run Locally

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run:

```powershell
npm install
npm start
```

The default local address is:

```text
http://127.0.0.1:8787/
```

For LAN access, run:

```text
outputs/start-artbee-lan.cmd
```

## Data

Runtime data is stored in `data/`:

- `artbee-library.json`
- `artbee-users.json`
- `artbee-comments.json`

These files are intentionally ignored by Git so personal accounts, comments, and collected local library data are not uploaded to a public repository.

## Deployment

This is a Node.js app, not a static-only site. GitHub Pages is not enough for the full app because login, comments, shared library, and collection APIs need the backend in `server.js`.

Use a Node hosting service such as Render, Railway, Fly.io, Aliyun ECS, or your own NAS/server.
