# AI Prompt — Build Srilatha Art (Full System)

## Mission
Review the supplied **frontend**, **backend**, and **admin panel** feature requirements for **Srilatha Art** (a handmade Indian folk-art e-commerce store — resin art, Lippan art, dot mandala, Kolam, wedding decoratives — shipping across India in INR) and build the complete, production-ready application that satisfies all of them.

The two accompanying feature specifications are the source of truth for *what* to build:
- Customer storefront frontend features
- Backend API + admin panel features

## Your responsibility
- **You decide the entire application stack** for both frontend and backend — frameworks, languages, libraries, patterns. Make sensible, modern, well-justified choices. Do not ask me to pick.

## Hard constraints (non-negotiable)
1. **Infrastructure is Azure-only.** Core compute and data must be: Azure Functions, Storage Account, Table Storage, and Queue Storage (plus Blob within the same Storage Account for files/images). Supporting services that are free or negligibly cheap at low volume are also allowed — specifically **Azure Key Vault** (secrets) and **Application Insights** (monitoring), plus similar low-cost Azure services that stay within free/near-free tiers (we will not exceed those limits). Do **not** introduce any separate compute service or any database beyond Table Storage.
2. **No Cosmos DB.**
3. **No Azure SQL Server** (or any relational database server).
4. **Mobile-first web application** — design and build for mobile screens first, then scale up to desktop. Mobile experience is the priority, not an afterthought.
5. **Strictly cost-efficient** — every choice must minimise running cost. Prefer serverless/consumption pricing, free or always-free tiers, and zero idle cost. Avoid any service or pattern that incurs fixed or standing charges. Where a feature can be achieved more cheaply, choose the cheaper path.

## Expectations
- Honour 100% of the feature requirements in the two specs; do not drop features to cut cost — instead find the cost-efficient way to deliver them.
- Keep the data model fitting Table + Queue storage (key/partition design, queue-driven async work) rather than relational assumptions.
- Deliver the customer storefront, the backend API, and the admin panel as one coherent system.

## Deliverable
A complete, working, mobile-first Srilatha Art web application — storefront, backend, and admin panel — running entirely on Azure Functions + Storage Account (Table, Queue, Blob), cost-optimised. Briefly state and justify your chosen stack up front, then build it.
