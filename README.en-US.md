# NestFund

[🇵🇹 Português](README.md) · **🇺🇸 English**

Self-hosted personal finance web app: plan your salary, fixed costs, leisure, emergency fund, house down payment and long-term ETF investing — plus manual expense tracking so you don't need to check your banking apps for every purchase.

> ⚠️ NestFund only shows simulations and records. **It is not financial advice.**

## Features

- **Monthly dashboard** — "you can still spend", saved this month, house down payment fund, ETF value, per-account balances, spending by category, budget vs. actual and negative-budget alerts.
- **Purpose-driven accounts** — every transaction belongs to an account, with separate balances, movements and statistics:

  | Account | Purpose |
  |---|---|
  | **Banco CTT** | Salary, day-to-day spending, transfers |
  | **Revolut** | Leisure and personal purchases (leisure envelope) |
  | **Trading 212** | Long-term ETF only — never counted as spending money |
  | **Trade Republic** | Untouchable savings: emergency fund + house down payment (interest-bearing) |
  | **Meal card** | Food only — shown in statistics, never in available money |
  | Cash / Other | Everything else |

- **Budget** editable per month, with lines that have start/end months (e.g. Muay Thai from January), 1,750 € vs 1,800 € comparison, planned vs. actual and a base profile.
- **Transactions** — purchase, expense, payment, income and **transfer** between accounts; category/subcategory, method (card, MB Way, direct debit…), store, notes, attachment (image/PDF), monthly/quarterly/yearly recurrence; filters, search, CSV export and import.
- **Categories** — built-in (translated) and custom, with a monthly budget.
- **Goals** with target, monthly contribution, target date and progress. Goals linked to an account use its real balance — Trade Republic fills the emergency fund first and the rest counts toward the house.
- **Simulators** — house down payment (monthly compounding, tiered rate 3% up to 50,000 € and 2.5% above, **interest net of 28% Portuguese IRS**, 3/5/7/10-year milestones) and ETF (nominal projection, returns not guaranteed).
- **Portfolio** — Trading 212 (value, invested, unrealized gain/loss, %), Trade Republic (balance and estimated net interest) and balance check-ins for all accounts.
- **History** — month-by-month budgets, monthly and cumulative savings, ETF and house-account evolution, spending by category.
- **pt-PT / en-US** with a header switcher (pt-PT default), **dark mode by default**, responsive design with a quick "+" button on mobile.

### How the numbers work

- **Available to assign** = income − every planned budget line.
- **You can still spend** (actually available) = income − fixed − ETF − savings − logged variable spending.
- The **meal card** never counts as available money; **transfers** are never spending.
- Fixed costs logged as transactions in the fixed line's category (e.g. gym) are **not counted twice**.
- Income in the **Salary** category replaces the month's planned salary with the real amount.
- **Account balance** = last recorded balance (Portfolio → Record balance) + later movements.
- **Savings rate** = (planned ETF + savings) ÷ income.

## Run locally

Requirements: Node.js 20+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:777
```

Other commands:

```bash
npm test           # tests (compound interest, savings rate, goals, categories, accounts…)
npm run typecheck
npm run build && npm start
```

Data lives in `./data/nestfund.db` (SQLite) and attachments in `./data/uploads`. Realistic sample data is loaded on the first run (disable with `SEED_SAMPLE_DATA=false`). To start over, delete the `data/` folder.

## Deploy with Docker Compose (NAS)

1. Copy `docker-compose.yml` and `.env.example` (as `.env`) to a folder on the NAS.
2. Set `NESTFUND_IMAGE` to `<your-docker-hub-user>/nestfund:latest`.
3. Start it:

```bash
docker compose up -d
```

The app is served at `http://<nas-ip>:777`. Data persists in the `nestfund-data` volume (mounted at `/data`).

| Variable | Default | Description |
|---|---|---|
| `NESTFUND_IMAGE` | `mwmiao/nestfund:latest` | Docker image |
| `NESTFUND_PORT` | `777` | Host port |
| `TZ` | `Europe/Lisbon` | Timezone ("today", recurrences) |
| `SEED_SAMPLE_DATA` | `true` | Sample data on first run |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | empty | Optional HTTP Basic Auth |

**Bind mount instead of a volume:** if you prefer a NAS folder (e.g. `/volume1/docker/nestfund:/data`), give the container user (UID 1000) access: `sudo chown -R 1000:1000 /volume1/docker/nestfund`.

**Backup:** copy `nestfund.db` (and `uploads/`) while the container is stopped, or run `sqlite3 nestfund.db ".backup backup.db"`.

### Automatic updates with Watchtower

The service carries the `com.centurylinklabs.watchtower.enable=true` label. With Watchtower running on the NAS, every new `:latest` image is pulled and the container is recreated automatically — data stays in the volume. Database schema changes are applied on startup (`PRAGMA user_version`), with no manual steps.

If your Watchtower only updates labelled containers, run it with `--label-enable`; otherwise the label is ignored and all containers are watched.

## Publish via GitHub Actions

The workflow [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) runs the tests, then builds **multi-arch (linux/amd64 + linux/arm64)** and pushes to Docker Hub using the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets.

| Event | Published tags |
|---|---|
| Push to `main` | `latest`, `sha-<commit>` |
| Tag `v1.0.0` | `1.0.0`, `1.0`, `sha-<commit>` |
| Pull request | Build only, no push |

To release a version:

```bash
git tag v1.0.0
```

```bash
git push origin v1.0.0
```

## Expose with Cloudflare Tunnel

With `cloudflared` already set up, add an ingress rule pointing at NestFund:

```yaml
# cloudflared config.yml
ingress:
  - hostname: nestfund.your-domain.com
    service: http://<nas-ip>:777   # or http://nestfund:777 if cloudflared shares the Docker network
  - service: http_status:404
```

Or, in the Zero Trust dashboard → Networks → Tunnels → *Public Hostname*: hostname `nestfund.your-domain.com`, service `HTTP`, URL `<nas-ip>:777`.

**Protect access.** The app has no user accounts. Recommended: **Cloudflare Access** (Zero Trust → Access → Applications → Self-hosted) with a policy that only allows your e-mail. Alternatively (or additionally), set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`. `/api/health` always stays open for the healthcheck.

Note: keep the original `Host` header (don't set `httpHostHeader`) so Next.js server actions validate the origin correctly.

## Structure

```
src/
  app/            pages (dashboard, budget, transactions, goals, simulators, portfolio, history), API and server actions
  components/     reusable components (UI, charts, forms, accounts, layout)
  i18n/           translation system + locales/pt-PT.json and locales/en-US.json
  lib/            pure calculations (calc.ts), database, repository, CSV, dates, formatting, seed
tests/            Vitest tests
```

## License

Personal use.
