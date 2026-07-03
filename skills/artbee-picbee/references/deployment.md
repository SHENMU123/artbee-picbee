# Deployment Reference

## Local And LAN

- Use `outputs/start-artbee-lan.cmd` when the user wants another computer or phone on the same Wi-Fi to open the app.
- The script should bind `HOST=0.0.0.0`, use `PORT=8791`, print local IPv4 URLs, and run `node server.js`.
- If another device cannot open it, check Windows Firewall private-network permission and whether both devices are on the same network.

## Lightweight Public Sharing

- For a small group of friends, a low-cost cloud server is usually simpler than a remote NAS.
- Deploy the Node app with persistent `data/` storage, a reverse proxy, HTTPS, and environment variables for admin credentials/session secret.
- Keep ArtStation collection on the server only if the server network can reach ArtStation. Otherwise, collect locally and sync the `data/` JSON files.

## NAS Option

- NAS is reasonable when the user can configure Docker/Node, port forwarding, and HTTPS.
- If the NAS is in another city, prefer remote management tools or a tunnel. Avoid changes that require physical access unless someone near the NAS can help.
- For private family/friend use, Tailscale or a similar private network is often easier and safer than exposing ports directly.

## Data Files

- `data/artbee-library.json`: collected visual index.
- `data/artbee-users.json`: accounts and profile data.
- `data/artbee-comments.json`: comments.
- Back these up before migration.
