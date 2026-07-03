# ArtBee PicBee

ArtBee PicBee is a local/LAN visual index web app for collecting, filtering, saving, and discussing environment concept art references.

## What is included

- Node.js backend for accounts, shared library data, comments, and ArtStation search collection.
- Liquid-glass front end in `outputs/`.
- LAN startup scripts for Windows.
- Deployment notes and a reusable Codex skill for maintaining this project.

## Local start

Install Node.js 18 or newer, then run:

```bash
npm start
```

Default local URL:

```text
http://127.0.0.1:8787/
```

LAN mode on Windows:

```text
outputs/start-artbee-lan.cmd
```

## Privacy note

Runtime data files such as `data/artbee-library.json`, `data/artbee-users.json`, and `data/artbee-comments.json` are intentionally not committed. They may contain personal collection data, accounts, profile settings, and comments.
