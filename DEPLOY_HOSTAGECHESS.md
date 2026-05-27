# HostageChess Deploy Plan (Vercel + VPS)

## Recommended topology

- Frontend: Vercel on `hostagechess.boredgamez.org`
- Backend API + Socket.IO: VPS on `server.hostagechess.boredgamez.org`
- Node app on VPS: HTTP on `127.0.0.1:3000`
- Nginx on VPS: TLS termination + reverse proxy to Node

This avoids Vercel serverless limitations for long-lived Socket.IO and in-memory game timers.

## Frontend changes already done

- Runtime config layer: `public/js/runtime-config.js`
- Socket client now uses runtime config URL/path: `public/js/socket.js`
- Socket.IO client is loaded from CDN: `public/index.html`
- Vercel SPA config: `public/vercel.json`

## Cloudflare DNS records

Add these records in Cloudflare zone for `boredgamez.org`:

1. `hostagechess` `CNAME` -> `cname.vercel-dns.com` (Proxied)
2. `server.hostagechess` `A` -> `<YOUR_VPS_PUBLIC_IP>` (DNS only recommended for first SSL setup; can switch to Proxied after)

Notes:
- If you keep Cloudflare proxied for backend websocket traffic, ensure WebSockets are enabled in Cloudflare settings.
- Avoid exposing backend over plain HTTP from browser if frontend is HTTPS.

## Vercel project setup

1. Create a new Vercel project from this repo.
2. Set **Root Directory** to `public`.
3. Build command: none (static site).
4. Output directory: `.` (root of `public`).
5. Add custom domain: `hostagechess.boredgamez.org`.

Optional runtime overrides (in browser console or by setting `window.__HOSTAGE_ENV__` before app scripts):
- `API_BASE_URL=https://server.hostagechess.boredgamez.org`
- `SOCKET_URL=https://server.hostagechess.boredgamez.org`
- `SOCKET_PATH=/socket.io`

## VPS backend setup with PM2

Example:

```bash
cd /path/to/HostageGame
npm install
pm2 start server.js --name hostagechess-api
pm2 save
pm2 startup
```

## Nginx setup

Use the blocks added in `nginx.conf` for:
- `server.hostagechess.boredgamez.org` on 80 -> redirect to HTTPS
- `server.hostagechess.boredgamez.org` on 443 -> proxy to `127.0.0.1:3000`

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## SSL certificate on VPS

After DNS points to VPS:

```bash
sudo certbot --nginx -d server.hostagechess.boredgamez.org
```

Then test socket endpoint quickly:

```bash
curl -I https://server.hostagechess.boredgamez.org/socket.io/
```

## Backend CORS settings to verify

Your server should allow origin `https://hostagechess.boredgamez.org` for Socket.IO and API requests.

If using `CORS_ORIGINS` env var, include:

```text
https://hostagechess.boredgamez.org
```

## Optional path-based alternative (not recommended now)

`boredgamez.org/hostagechess` is possible, but requires extra reverse-proxy/path-rewrite complexity on both frontend and backend routing. Subdomain is simpler and cleaner for multi-game hosting.
