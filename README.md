# Quality Platform

An independent product-quality control plane for web, mobile, API, DevOps, and Figma-driven products.

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run dev:api
npm run dev
```

Dashboard: `http://localhost:3000`; API: `http://localhost:4100`.

## Architecture

- `apps/dashboard`: quality dashboard and project setup
- `apps/api`: orchestration API, health endpoints, and audit lifecycle
- `packages/contracts`: shared domain contracts and validation
- `packages/database`: PostgreSQL schema and repository boundary

Audit workers are provider-neutral. Web browser, mobile device, Figma, API, security, and infrastructure runners submit normalized findings through the same contracts.

## Quality gates

Every finding contains severity, category, evidence, reproduction guidance, and ownership. A run is release-blocking when it contains a critical issue or violates a configured category threshold.
