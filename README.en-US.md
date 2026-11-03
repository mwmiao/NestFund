<div align="center">

<img src="public/icon.svg" width="72" alt="NestFund" />

# NestFund

**Your personal finances in one place — budget, spending, goals and investing.**

[![Build](https://github.com/mwmiao/NestFund/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/mwmiao/NestFund/actions/workflows/docker-publish.yml)
[![Docker](https://img.shields.io/docker/v/eazyeight/nestfund?label=docker&sort=semver)](https://hub.docker.com/r/eazyeight/nestfund)

[🇵🇹 Português](README.md) · 🇺🇸 English

<img src="docs/screenshots/dashboard.png" alt="NestFund dashboard" width="900" />

</div>

NestFund is a self-hosted personal finance dashboard. Plan your salary, log every purchase in seconds and track your savings, house down payment and ETF investing — without opening your banking apps. Your data stays on your own server.

## Features

- **Clear dashboard** — total net worth, what you can still spend this month, and quick actions.
- **Purpose-driven accounts** — Banco CTT, Revolut, Trading 212, Trade Republic and a meal card, each with its own balance and activity.
- **Fast logging** — purchase, expense, income or transfer in a few taps, with attachments and recurring entries.
- **Monthly budget** — fixed costs, leisure, ETF and savings, planned vs. actual.
- **Goals** — emergency fund, house down payment and financial independence, with automatic progress.
- **Automatic Trading 212** — value, invested capital and positions synced every 6 hours (read-only).
- **Simulators** — house down payment with tiered interest, net of Portuguese tax; ETF projection.
- **History and CSV** — month-by-month evolution, export and import.
- **Portuguese / English**, dark mode, built for mobile.

<div align="center">
  <img src="docs/screenshots/mobile.png" alt="Dashboard on mobile" width="270" />
  &nbsp;
  <img src="docs/screenshots/quick-add.png" alt="Logging a purchase" width="270" />
</div>

<p align="center"><img src="docs/screenshots/simulators.png" alt="House down payment simulator" width="900" /></p>

> NestFund shows simulations and records — it is not financial advice.

## Install with Docker Compose

```yaml
services:
  nestfund:
    image: eazyeight/nestfund:latest
    container_name: nestfund
    restart: unless-stopped
    ports:
      - "777:777"
    environment:
      TZ: Europe/Lisbon
    sysctls:
      - net.ipv4.ip_unprivileged_port_start=0
    volumes:
      - nestfund-data:/data
    labels:
      - com.centurylinklabs.watchtower.enable=true

volumes:
  nestfund-data:
```

```bash
docker compose up -d
```

Open `http://<server-ip>:777` and follow **Setup** to enter your balances, salary, fixed costs and goals. You can skip it and come back later.

Data (SQLite and attachments) lives in the `/data` volume. To back up, copy `nestfund.db` while the container is stopped.

## Port 777 and Cloudflare Tunnel

The app listens on port **777**. To change the host port, edit only the left side: `"8080:777"`.

To expose it through Cloudflare Tunnel, add a *Public Hostname* (Zero Trust → Networks → Tunnels):

| Field | Value |
|---|---|
| Hostname | `nestfund.your-domain.com` |
| Service | `HTTP` → `<server-ip>:777` |

The app has no user accounts — protect it with **Cloudflare Access** (a policy that only allows your e-mail). Alternatively, set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`.

## Connect Trading 212

1. In the Trading 212 app: **Settings › API (Beta)** › generate a key with read-only permissions (*Account data* and *Portfolio*).
2. In NestFund: **Settings › Connections** › paste the API key and secret.

NestFund only reads the account summary and positions — it never places orders. The key is stored encrypted (AES-256-GCM); set `NESTFUND_SECRET` to use your own encryption key. If the connection fails, the app keeps the last values.

## Automatic updates with Watchtower

The `com.centurylinklabs.watchtower.enable=true` label lets Watchtower update the container whenever a new `latest` image is published. Your data is kept and the database is migrated automatically on startup.

## Development

```bash
npm install
npm run dev     # http://localhost:777
npm test
```

Every push to `main` publishes `eazyeight/nestfund:latest` (amd64 + arm64). A `v1.2.0` tag also publishes `1.2.0`.

## License

Personal project by [@mwmiao](https://github.com/mwmiao). Built with Next.js, Tailwind CSS and SQLite.
