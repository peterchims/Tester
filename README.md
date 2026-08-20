# Quality Platform

An independent product-quality control plane for web, mobile, API, DevOps, and Figma-driven products.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev:api # terminal 1
npm run dev     # terminal 2
```

Dashboard: `http://localhost:3000`; API: `http://localhost:4100`.

Or run the complete stack with `docker compose up --build`.

## Current audit engine

An audit is an asynchronous run with bounded checks for availability, response time, browser security headers, responsive viewport support, page titles, and document language. Findings use a normalized contract and produce a deterministic quality score.

Targets are resolved before execution; loopback, link-local, credential-bearing, and private-network destinations are rejected to protect the runner from SSRF. Browser journeys (Playwright), Lighthouse, API collections, and Appium-backed mobile workers are planned as isolated queue consumers rather than work inside the public API process.

## Architecture

- `apps/dashboard`: quality dashboard and project setup
- `apps/api`: orchestration API, health endpoints, and audit lifecycle
- `packages/contracts`: shared domain contracts and validation
- `packages/database`: PostgreSQL schema and repository boundary

Audit workers are provider-neutral. Web browser, mobile device, Figma, API, security, and infrastructure runners submit normalized findings through the same contracts.

## Quality gates

Every finding contains severity, category, evidence, reproduction guidance, and ownership. A run is release-blocking when it contains a critical issue or violates a configured category threshold.
