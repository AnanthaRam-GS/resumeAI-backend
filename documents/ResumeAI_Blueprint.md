# ResumeAI
## Technical Blueprint & Engineering Reference
**Version 1.0 — Requirements Frozen**  
**Team Size: 2 Engineers**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete Technology Stack](#2-complete-technology-stack)
3. [Complete System User Flow](#3-complete-system-user-flow)
4. [System Architecture Diagram](#4-system-architecture-diagram)
5. [Database Schema Reference](#5-database-schema-reference)
6. [AI Multi-Agent Pipeline](#6-ai-multi-agent-pipeline)
7. [Key Architectural Decisions](#7-key-architectural-decisions)
8. [Work Split — Two-Engineer Execution Plan](#8-work-split--two-engineer-execution-plan)
9. [Parallel Development Timeline](#9-parallel-development-timeline)
10. [Integration Touchpoints & Coordination Protocol](#10-integration-touchpoints--coordination-protocol)

---

## 1. Executive Summary

ResumeAI is a Smart Resume & Cover Letter Generation SaaS platform purpose-built for university students. The core problem it solves is the time and cognitive overhead of manually tailoring resumes for every job application. The platform aggregates a student's complete professional portfolio — from GitHub repositories, uploaded documents, and manual entries — into a unified asset pool. When a user targets a specific role, an AI pipeline automatically selects the most relevant experiences, rewrites them for maximum impact and ATS compatibility, and generates a production-ready PDF resume in seconds.

The system is built on a zero-cost AI infrastructure using free-tier LLMs and embedding models, a multi-agent pipeline architecture for modularity and cost control, and a production-grade web stack designed for a two-engineer team to ship and maintain efficiently.

---

## 2. Complete Technology Stack

### Frontend

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | Next.js | 15.x | App Router, SSR/SSG hybrid |
| Language | TypeScript | 5.x | Type safety across codebase |
| Styling | Tailwind CSS | 3.x | Utility-first, no CSS files |
| Component Library | shadcn/ui | Latest | Accessible, unstyled primitives |
| State Management | Zustand | 4.x | Lightweight global state |
| Server State | TanStack Query | 5.x | Caching, background sync |
| PDF Preview | react-pdf / pdfjs-dist | 7.x | In-browser PDF rendering |
| Forms | React Hook Form + Zod | 7.x / 3.x | Validation + type-safe forms |
| Animations | Framer Motion | 11.x | UI polish and transitions |

### Browser Extension

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | Plasmo | Latest | Chrome + Firefox unified build |
| Language | TypeScript | 5.x | Consistent with main codebase |
| Communication | REST to Backend API | — | Posts scraped JD data |

### Backend

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Runtime | Node.js | 20.x LTS | Long-term stability |
| Framework | Fastify | 4.x | 2–3× faster throughput than Express |
| Language | TypeScript | 5.x | Type safety |
| Validation | Zod | 3.x | Shared schema with frontend |
| Job Queue | BullMQ | 5.x | Async AI pipeline job management |
| PDF Generation | Puppeteer | 22.x | HTML-to-PDF via headless Chrome |
| GitHub Client | Octokit REST SDK | 20.x | Official GitHub API integration |
| Document Parsing | pdf-parse + mammoth | 1.x / 1.x | PDF and DOCX text extraction |
| Real-time | WebSockets (ws library) | 8.x | Pipeline progress + ATS streaming |

### Authentication

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Auth Provider | Clerk | Latest | OAuth + Email/Password, JWT management |
| Supported OAuth | Google, GitHub | — | Primary sign-in methods |

### Database & Storage

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Primary Database | PostgreSQL | 16.x | Via Supabase (managed, RLS built-in) |
| Vector Extension | pgvector | 0.7.x | Embedding storage and cosine search |
| Cache Layer | Redis | 7.x | Via Upstash (serverless, pay-per-use) |
| File Storage | AWS S3 | — | PDFs, uploaded documents |
| CDN | AWS CloudFront | — | Fast global PDF delivery |

### AI & ML Models

| Agent | Model | Tier | Purpose |
|---|---|---|---|
| Agent 1 — JD Extractor | Groq → Llama 3.1 8B Instruct | Free | Fast entity extraction from JD |
| Agent 1 — Fallback | Gemini 1.5 Flash | Free | Rate-limit overflow |
| Agent 2 — Embeddings | Gemini text-embedding-004 | Free | 768-dim semantic vectors |
| Agent 2 — Fallback | Nomic Embed Text v1.5 (Ollama) | Self-hosted | Last-resort embedding |
| Agent 3 — Selection | TypeScript Business Logic | N/A | Deterministic scoring algorithm |
| Agent 4 — Generator | Gemini 1.5 Flash | Free | Resume + cover letter generation |
| Agent 4 — Fallback | Groq → Llama 3.3 70B Instruct | Free | Rate-limit overflow |
| Agent 5A — ATS Scorer | Deterministic + Groq Llama 3.1 8B | Free | Keyword gap analysis |
| Agent 5B — Gap Advisor | Gemini 1.5 Flash (async) | Free | Career delta analysis |

### Infrastructure & DevOps

| Layer | Technology | Rationale |
|---|---|---|
| Frontend Hosting | Vercel | Native Next.js, edge middleware |
| Backend Hosting | Railway | Managed Node.js, Redis, auto-deploy |
| CI/CD | GitHub Actions | Lint, type-check, deploy on push |
| Error Tracking | Sentry | Frontend + backend error capture |
| Analytics | PostHog | Product analytics, feature flags |
| Secret Management | Railway Env Vars + Vercel | No secrets in codebase |

### Shared Tooling

| Tool | Version | Purpose |
|---|---|---|
| Monorepo | Turborepo 2.x | Shared types, utils, config packages |
| Package Manager | pnpm 9.x | Workspace support, fast installs |
| Linting | ESLint + Prettier | Code consistency enforcement |
| Git Strategy | GitHub Flow | Feature branches + PR reviews |
| API Contracts | Zod schemas (shared package) | Frontend/backend type parity |

---

## 3. Complete System User Flow

### Stage 1 — Authentication & Onboarding

```
User arrives at landing page
        │
        ▼
Clicks "Sign Up"
        │
        ├──── Google OAuth ──────────────────────┐
        ├──── GitHub OAuth ──────────────────────┤
        └──── Email + Password ──────────────────┤
                                                 │
                                     Clerk handles auth flow
                                                 │
                                                 ▼
                                   User record created in DB
                                   (users table, clerk_id linked)
                                                 │
                                                 ▼
                              ┌──────────────────────────────────┐
                              │     ONBOARDING WIZARD (4 Steps)  │
                              │                                  │
                              │  Step 1: Personal Details        │
                              │    Name, university, graduation  │
                              │    year, target role category    │
                              │    Career goal statement         │
                              │                                  │
                              │  Step 2: Experience & Education  │
                              │    Work experience (manual)      │
                              │    Education history (manual)    │
                              │                                  │
                              │  Step 3: Skills & Certifications │
                              │    Skill tags (manual entry)     │
                              │    Certification name + URL      │
                              │                                  │
                              │  Step 4: Projects (Choose path)  │
                              │    ┌─────────────────────────┐   │
                              │    │ Option A: Link GitHub   │   │
                              │    │ Option B: Upload Doc    │   │
                              │    │ Option C: Manual Entry  │   │
                              │    └─────────────────────────┘   │
                              └──────────────────────────────────┘
                                                 │
                                                 ▼
                                        Redirect to Dashboard
```

---

### Stage 2 — Data Ingestion & AI Enrichment

#### Path A: GitHub Linking

```
User authorizes GitHub OAuth
        │
        ▼
Backend receives + encrypts access token (AES-256-GCM)
        │
        ▼
[BullMQ] github-sync job enqueued
        │
        ▼
Worker: Octokit fetches all public repos
  → Per repo: name, description, README (base64 decoded),
    languages, stars, forks, commit count, last commit date
        │
        ▼
Per repo → Agent 1 (Groq Llama 3.1 8B)
  → Generates standardized project description
  → Input: raw README + repo metadata
  → Output: structured project summary (JSON)
        │
        ▼
Project Validation Score calculated (JD-independent, stored permanently)
  → README quality score    (depth, sections, code blocks)
  → Impact metric detection (quantified results via regex + LLM)
  → Recency score           (commit date decay function)
  → Domain relevance signal (language/tech tier assessment)
  → Real-world applicability (AI-assessed from description)
  Composite → stored as validation_score (0–100)
        │
        ▼
Agent 2: Gemini text-embedding-004
  → Generates 768-dim embedding per project
  → Stored in portfolio_items.embedding (pgvector)
        │
        ▼
Upsert into portfolio_items table
  → New repos:     inserted with score + embedding
  → Changed repos: updated + embedding nulled + re-embed queued
  → Unchanged repos: skipped (delta sync)
        │
        ▼
github_sync_status → "idle"
WebSocket event → Frontend: "GitHub sync complete. 12 projects imported."
```

#### Path B: Document Upload (Non-IT Track)

```
User uploads PDF or DOCX file(s)
        │
        ▼
File uploaded to S3 via presigned URL
        │
        ▼
[BullMQ] document-parse job enqueued
        │
        ▼
Worker: pdf-parse (PDF) or mammoth (DOCX) extracts raw text
        │
        ▼
Agent 1 (Groq Llama 3.1 8B)
  → Parses unstructured text into structured portfolio_item records
  → Identifies: project title, description, methods/tech used,
    outcomes, timeframe
        │
        ▼
Project Validation Score + Embedding generated
(same pipeline as Path A from this point forward)
```

#### Path C: Manual Entry

```
User fills structured form per portfolio item
        │
        ▼
Record written directly to portfolio_items table
        │
        ▼
Project Validation Score calculated from provided fields
Gemini embedding generated immediately (synchronous, fast)
```

---

### Stage 3 — Workspace Dashboard

```
User lands on centralized dashboard
        │
        ▼
Dashboard displays:
  → All generated resume versions (version cards)
    ├── Version label       (e.g. SWE-Google-v2)
    ├── Company + role title
    ├── Date generated
    ├── ATS score badge     (0–100 + grade)
    └── Status tag          (Draft / Submitted / Archived)

  → Quick actions per card:
    View PDF | Download | Duplicate | Rename | Mark as Submitted | Archive

Sidebar widgets:
  → Profile completeness meter
  → GitHub sync status + "Sync Now" button
  → Total portfolio item count
  → Career goal display (editable)

Primary CTA: "Generate New Resume" button
```

---

### Stage 4 — Tailoring & Generation Engine

```
User clicks "Generate New Resume"
        │
        ▼
┌─────────────────────────────────────────┐
│       GENERATION INPUT FORM             │
│                                         │
│  Job Title          [text field]        │
│  Company Name       [text field]        │
│  Job Description    [large textarea]    │
│  Template           [visual selector]   │
│                                         │
│  ── OR ──                               │
│  [Use Chrome Extension to auto-fill]    │
└─────────────────────────────────────────┘
        │
        ▼
System checks generation readiness:
  ✓ Portfolio has ≥ 1 item with a valid embedding?
  ✓ No active GitHub sync in progress?
  ✓ Valid JD + role + company entered?
  If not ready → contextual tooltip shown, button disabled
        │
        ▼
User submits → job_target record created in DB
        │
        ▼
[BullMQ] resume-generate job enqueued
        │
        ▼
PIPELINE EXECUTION (WebSocket progress events to frontend):
```

```
"Analyzing job description..."
┌────────────────────────────────────────────────────────┐
│  PARALLEL EXECUTION (Promise.all)                      │
│                                                        │
│  Agent 1 (Groq Llama 3.1 8B)        Agent 2           │
│  Extracts from JD:                  Gemini Embeddings  │
│  - Required skills                  - Embed JD text    │
│  - Preferred skills                 - Retrieve all     │
│  - Tech stack keywords                portfolio item   │
│  - Role seniority level               embeddings from  │
│  - Role category                      pgvector         │
│  - Company culture signals                             │
└──────────────────────┬─────────────────────┬───────────┘
                       └──────────┬──────────┘
                                  │
"Ranking your experiences..."
┌─────────────────────▼──────────────────────────────────┐
│  Agent 3 — Selection Algorithm (Pure TypeScript)       │
│                                                        │
│  Per portfolio item, compute composite score:          │
│                                                        │
│  Layer 1: Semantic Similarity    (weight: 40%)         │
│    cosine(item_embedding, jd_embedding)                │
│                                                        │
│  Layer 2: Keyword Match Score    (weight: 25%)         │
│    NER keywords vs item tech stack + description       │
│    Exact match + synonym taxonomy resolution           │
│                                                        │
│  Layer 3: Project Validation Score (weight: 20%)       │
│    Pre-calculated at ingestion — used directly here    │
│                                                        │
│  Layer 4: Recency Decay Score    (weight: 10%)         │
│    exp(−0.05 × months_since_completion)                │
│                                                        │
│  Layer 5: Seniority Alignment    (weight: 5%)          │
│    Role level vs item framing signals                  │
│                                                        │
│  composite = Σ(layer_score × weight)                  │
│  Sort descending → greedy select within page budget   │
│  → Category caps enforced (max projects/exp/certs)    │
│  → Override: item scoring > 0.85 bumps lowest in cat  │
└─────────────────────┬──────────────────────────────────┘
                      │
"Writing your resume..."
┌─────────────────────▼──────────────────────────────────┐
│  Agent 4 — Content Generator (Gemini 1.5 Flash)        │
│                                                        │
│  Input:                                                │
│  - Selected portfolio items (ordered, with scores)     │
│  - JD entities from Agent 1                           │
│  - Template configuration                             │
│  - User personal details                              │
│                                                        │
│  Output (structured JSON):                             │
│  - Professional summary   (role-specific, 2–3 lines)  │
│  - Experience bullets     (rewritten, action verbs)   │
│  - Project bullets        (rewritten, impact-focused) │
│  - Skill groupings        (ATS-optimized)             │
│  - Education + certs      (formatted)                 │
│                                                        │
│  Fallback: Groq → Llama 3.3 70B (rate-limit overflow) │
└─────────────────────┬──────────────────────────────────┘
                      │
"Rendering PDF..."
┌─────────────────────▼──────────────────────────────────┐
│  Template Renderer                                     │
│  JSON content → HTML template injection                │
│  → Puppeteer (headless Chrome) → PDF                  │
│  → Upload to AWS S3                                   │
│  → Generate 15-minute pre-signed URL                  │
└─────────────────────┬──────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────┐
│  Version Control Record Created                        │
│                                                        │
│  resume_versions row:                                  │
│  - version_label:    auto-generated "SWE-Google-v1"   │
│    format: {RoleAbbr}-{Company}-v{N}                  │
│  - selected_items:   ordered UUID array               │
│  - pdf_s3_key:       stored for permanent access      │
│  - status:           "draft"                          │
│  - ats_score:        calculated post-generation       │
└─────────────────────┬──────────────────────────────────┘
                      │
                      ▼
        PDF preview rendered in browser (react-pdf)
        Download available via signed URL
        "Mark as Submitted" action available
```

---

### Stage 4B — Cover Letter Generation (Optional, Separate)

```
User views a generated resume version
        │
        ▼
Clicks "Generate Cover Letter" (per-version CTA)
        │
        ▼
┌─────────────────────────────────────────┐
│     COVER LETTER CONTEXT FORM (Modal)   │
│                                         │
│  Why this company?   [textarea, 2 lines]│
│  Tone                [Formal /          │
│                       Balanced /        │
│                       Conversational]   │
│  Highlight specific? [textarea, opt.]   │
└─────────────────────────────────────────┘
        │
        ▼
[BullMQ] cover-letter-gen job enqueued
        │
        ▼
Agent 4 (Gemini 1.5 Flash) called with:
  → Resume version's selected_items context
  → JD from linked job_target record
  → Cover letter context form inputs
  → Output: complete cover letter text
        │
        ▼
Rendered as PDF → S3 → linked to resume_version record
Displayed in dashboard alongside resume version
```

---

### Stage 5 — Analytics Layer

#### ATS Scoring (Real-time, runs post-generation)

```
Agent 5A:
  Deterministic keyword matching
  (resume text vs Agent 1 extracted keywords)
  + Groq Llama 8B for synonym resolution edge cases
        │
        ▼
Output stored on resume_version record:
  → ATS Score      (0–100)
  → Grade          (A / B / C / D)
  → Found keywords (green — present in resume)
  → Missing keywords (red — absent from resume)
  → Suggestions    ("Consider adding experience with X")

Delivered to frontend via WebSocket immediately after generation
Displayed as live badge on version card
```

#### Gap Advisor (Async, non-blocking)

```
[BullMQ] gap-analysis job enqueued
(does NOT delay or block resume delivery)
        │
        ▼
Agent 5B (Gemini 1.5 Flash):
  → Embeds user's career goal statement
  → Vector similarity search against portfolio embeddings
  → Identifies skill cluster gaps
  → Maps gaps to:
      - Specific skills to learn
      - Project types to build
      - Domain areas to explore
      - (Future: course/resource suggestions)
        │
        ▼
Results stored in gap_analyses table
Surfaced in dedicated "Gap Advisor" dashboard tab
Cached for 7 days — re-runs only on:
  → Significant portfolio change (new items added)
  → Career goal statement updated
```

---

### Stage 6 — Profile Maintenance & Sync

#### Profile Edit

```
User edits any portfolio item
        │
        ▼
PATCH request → record updated in database
        │
        ▼
embedding column nulled on updated row
[BullMQ] re-embed job enqueued (single item, ~1 second)
        │
        ▼
Validation score recalculated if project fields changed
New 768-dim embedding written back to portfolio_items row
```

#### GitHub Sync (Manual Trigger)

```
User clicks "Sync GitHub" on dashboard
        │
        ▼
System checks: github_sync_status = "idle"?
  If "syncing" → show "Sync already in progress" notice
        │
        ▼
github_sync_status → "syncing"
sync_started_at   → NOW()
        │
        ▼
Delta sync: only repos where pushed_at > last_synced_at
  → New repos:     full enrichment pipeline
  → Changed repos: re-enrich + re-embed
  → Unchanged:     skipped entirely
        │
        ▼
github_sync_status → "idle"
Dashboard notification: "Sync complete. 3 new projects added."
```

---

## 4. System Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        RESUMEAI — SYSTEM ARCHITECTURE                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                  │
│                                                                            │
│  ┌─────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │    Next.js 15 Web Application       │  │  Plasmo Browser Extension  │  │
│  │        (Vercel Edge)                │  │   (Chrome + Firefox)       │  │
│  │                                     │  │                            │  │
│  │  Routes:                            │  │  - Detects job listing     │  │
│  │  /auth       Landing + Auth         │  │    pages (LinkedIn, Indeed,│  │
│  │  /onboard    4-step wizard          │  │    Handshake, Greenhouse)  │  │
│  │  /dashboard  Version vault          │  │  - Scrapes: title, company,│  │
│  │  /generate   Generation engine UI   │  │    JD text, page URL       │  │
│  │  /profile    Portfolio management   │  │  - POST /api/job-targets   │  │
│  │  /gap        Gap advisor            │  │  - Redirects to /generate  │  │
│  │                                     │  └─────────────┬──────────────┘  │
│  │  State:         Zustand             │                │ REST             │
│  │  Server State:  TanStack Query      │                │                  │
│  │  Forms:         RHF + Zod           │                │                  │
│  │  PDF Viewer:    react-pdf           │                │                  │
│  │  Real-time:     WebSocket client    │                │                  │
│  └─────────────────┬───────────────────┘                │                  │
│                    │ REST + WebSocket                    │                  │
└────────────────────┼────────────────────────────────────┼──────────────────┘
                     │                                     │
                     ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY LAYER                                │
│                  Fastify 4.x on Railway (Node.js 20 LTS)                  │
│                                                                            │
│  Middleware Chain:                                                         │
│  [Clerk JWT Verify] → [Rate Limiter] → [Zod Validator] → [Router]        │
│                                                                            │
│  REST Routes:                         WebSocket Endpoints:                │
│  POST   /auth/webhook                 ws://api/ws/pipeline-progress       │
│  GET    /portfolio                    ws://api/ws/ats-score               │
│  POST   /portfolio                                                         │
│  PATCH  /portfolio/:id                BullMQ Workers (same service):      │
│  DELETE /portfolio/:id                - github-sync                       │
│  POST   /github/connect               - document-parse                    │
│  POST   /github/sync                  - resume-generate                   │
│  POST   /job-targets                  - cover-letter-gen                  │
│  GET    /job-targets                  - gap-analysis                      │
│  POST   /resume/generate              - re-embed                          │
│  GET    /resume/versions                                                   │
│  PATCH  /resume/:id                                                        │
│  POST   /resume/:id/cover-letter                                           │
│  GET    /gap-analysis                                                      │
│  POST   /gap-analysis/trigger                                              │
└────────┬───────────────────────┬─────────────────────────┬────────────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐   ┌──────────────────┐    ┌───────────────────────────┐
│  PostgreSQL 16  │   │  Redis (Upstash)  │    │       AWS S3 Bucket       │
│  via Supabase   │   │                  │    │                           │
│                 │   │  - BullMQ queues  │    │  users/{id}/resumes/      │
│  Tables:        │   │  - ATS score      │    │  users/{id}/cover-letters/│
│  users          │   │    cache (1 hr)   │    │  users/{id}/uploads/      │
│  github_        │   │  - JD embed       │    │  templates/               │
│   profiles      │   │    cache (1 hr)   │    │                           │
│  portfolio_     │   │  - Sync status    │    │  CloudFront CDN in front  │
│   items         │   │    flags          │    │  Pre-signed URLs (15 min) │
│   + pgvector    │   │  - Daily token    │    │                           │
│  job_targets    │   │    usage counter  │    └───────────────────────────┘
│  resume_        │   └──────────────────┘
│   versions      │
│  gap_analyses   │
│  pipeline_      │
│   traces        │
└─────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                        AI ORCHESTRATION LAYER                              │
│             Custom Pipeline Runner (inside Fastify service)                │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  AGENT REGISTRY (config-driven — swap models via single config key) │ │
│  │                                                                      │ │
│  │  Agent 1 — JD Extractor                                             │ │
│  │    Primary : Groq API → Llama 3.1 8B Instruct (Free Tier)          │ │
│  │    Fallback: Gemini 1.5 Flash                                       │ │
│  │    Output  : Structured JSON (skills, seniority, tech stack)        │ │
│  │                                                                      │ │
│  │  Agent 2 — Embedding Engine                                         │ │
│  │    Primary : Gemini text-embedding-004 (Free, 768-dim)              │ │
│  │    Fallback: Nomic Embed Text v1.5 via Ollama (self-hosted)         │ │
│  │    Output  : Float[768] stored in pgvector column                   │ │
│  │                                                                      │ │
│  │  Agent 3 — Selection Algorithm                                      │ │
│  │    Implementation: TypeScript deterministic code (zero LLM cost)    │ │
│  │    5-layer weighted scoring → greedy selection → category caps      │ │
│  │    Override rule: score > 0.85 bumps lowest in category             │ │
│  │                                                                      │ │
│  │  Agent 4 — Content Generator                                        │ │
│  │    Primary : Gemini 1.5 Flash (Free, 1M token context window)       │ │
│  │    Fallback: Groq → Llama 3.3 70B Instruct (Free, 6K ctx limit)    │ │
│  │    Output  : Structured JSON resume content / cover letter text     │ │
│  │                                                                      │ │
│  │  Agent 5A — ATS Scorer                                              │ │
│  │    Primary : Deterministic keyword matching (TypeScript)            │ │
│  │    Assist  : Groq Llama 3.1 8B (synonym edge cases only)           │ │
│  │    Output  : Score 0–100, grade A–D, keyword gap list              │ │
│  │                                                                      │ │
│  │  Agent 5B — Gap Advisor                                             │ │
│  │    Primary : Gemini 1.5 Flash (async BullMQ job)                   │ │
│  │    Trigger : Enqueued post-generation, cached 7 days               │ │
│  │    Output  : Skill gaps, project suggestions, learning resources    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  Circuit Breaker : Primary fail ×3 → auto-fallback → 60s lockout         │
│  Parallel Exec   : Agent 1 + Agent 2 run concurrently (Promise.all)      │
│  Observability   : Pipeline trace stored per run (model, latency,        │
│                    tokens used, fallback triggered y/n)                   │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL INTEGRATIONS                             │
│                                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   GitHub    │  │  Groq API    │  │Google Gemini │  │    Clerk      │  │
│  │  REST API   │  │ (Free Tier)  │  │ (Free Tier)  │  │   (Auth)      │  │
│  │ via Octokit │  │ Llama 3.1 8B │  │ Flash +      │  │ Google +      │  │
│  │             │  │ Llama 3.3 70B│  │ Embedding-004│  │ GitHub OAuth  │  │
│  │ OAuth 2.0   │  │              │  │              │  │               │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  └───────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema Reference

### Full Schema

```sql
-- ─────────────────────────────────────────────────────────────
-- Core user identity
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id            TEXT UNIQUE NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  full_name           TEXT,
  university          TEXT,
  graduation_year     INT,
  target_role_category TEXT,
  career_goal         TEXT,           -- "ML Engineer at a FAANG company"
  github_sync_status  TEXT CHECK (github_sync_status IN ('idle','syncing','failed'))
                      DEFAULT 'idle',
  sync_started_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- GitHub integration
-- ─────────────────────────────────────────────────────────────
CREATE TABLE github_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  github_username     TEXT NOT NULL,
  access_token        TEXT NOT NULL,   -- AES-256-GCM encrypted at rest
  last_synced_at      TIMESTAMPTZ,
  raw_data            JSONB            -- cached API response
);

-- ─────────────────────────────────────────────────────────────
-- All portfolio assets (unified table, typed by 'type' column)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE portfolio_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT CHECK (type IN (
                        'project','experience','education',
                        'certification','skill'
                      )),
  title               TEXT NOT NULL,
  description         TEXT,
  tech_stack          TEXT[],
  url                 TEXT,
  start_date          DATE,
  end_date            DATE,
  impact_metrics      TEXT,            -- "Reduced latency by 40%"
  source              TEXT CHECK (source IN ('manual','github','upload')),
  validation_score    NUMERIC(5,2),    -- 0–100, JD-independent, set at ingestion
  embedding           vector(768),     -- pgvector, Gemini text-embedding-004
  metadata            JSONB,           -- stars, forks, readme_score, commit_count
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Job targets (from manual input or browser extension)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE job_targets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  company_name        TEXT NOT NULL,
  role_title          TEXT NOT NULL,
  job_description     TEXT NOT NULL,
  role_category       TEXT,            -- populated by Agent 1
  role_seniority      TEXT,            -- populated by Agent 1
  jd_embedding        vector(768),
  source_url          TEXT,            -- populated by browser extension
  ingested_via        TEXT CHECK (ingested_via IN ('manual','extension')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Generated resume versions (version vault)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE resume_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  job_target_id       UUID REFERENCES job_targets(id),
  template_id         TEXT NOT NULL,
  version_label       TEXT,            -- auto-gen: "SWE-Google-v1", user can rename
  selected_items      UUID[],          -- ordered array of portfolio_item IDs used
  ats_score           NUMERIC(5,2),    -- 0–100
  ats_feedback        JSONB,           -- { found: [], missing: [], suggestions: [] }
  pdf_s3_key          TEXT,
  cover_letter_text   TEXT,            -- populated only if cover letter generated
  cover_letter_s3_key TEXT,
  status              TEXT CHECK (status IN ('draft','submitted','archived'))
                      DEFAULT 'draft',
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Gap advisor analysis results
-- ─────────────────────────────────────────────────────────────
CREATE TABLE gap_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  career_goal         TEXT NOT NULL,
  missing_skills      JSONB,           -- [{ skill, priority, resources[] }]
  suggested_projects  JSONB,
  generated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- AI pipeline observability traces
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pipeline_traces (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  resume_version_id   UUID REFERENCES resume_versions(id),
  pipeline_type       TEXT,            -- 'resume_generate', 'github_sync', etc.
  agent_traces        JSONB,           -- per-agent: model used, tokens, latency, fallback
  total_latency_ms    INT,
  fallback_triggered  BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX idx_portfolio_embedding
  ON portfolio_items USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_portfolio_user       ON portfolio_items(user_id);
CREATE INDEX idx_portfolio_type       ON portfolio_items(user_id, type);
CREATE INDEX idx_resume_versions_user ON resume_versions(user_id);
CREATE INDEX idx_job_targets_user     ON job_targets(user_id);
CREATE INDEX idx_gap_analyses_user    ON gap_analyses(user_id);
```

### Table Summary

| Table | Purpose |
|---|---|
| `users` | Core identity, career goal, sync status flags |
| `github_profiles` | Encrypted OAuth token, sync timestamps |
| `portfolio_items` | All user assets + pgvector embedding + validation score |
| `job_targets` | JD inputs, source URL, JD embedding |
| `resume_versions` | Generated resumes, ATS score, S3 key, selected items, version label, status |
| `gap_analyses` | Async gap advisor results, 7-day cached |
| `pipeline_traces` | Per-run AI observability logs for debugging |

---

## 6. AI Multi-Agent Pipeline

### Task Decomposition & Model Assignment

| Agent | Task | Primary Model | Fallback | Trigger | Cost |
|---|---|---|---|---|---|
| Agent 1 | JD Entity Extraction | Groq: Llama 3.1 8B | Gemini 1.5 Flash | Every generation + doc parse | $0.00 |
| Agent 2 | Embedding Generation | Gemini text-embedding-004 | Nomic Embed (Ollama) | Ingestion + JD embedding | $0.00 |
| Agent 3 | Selection Algorithm | TypeScript code | — | Every generation | $0.00 |
| Agent 4 | Resume Content Generation | Gemini 1.5 Flash | Groq: Llama 3.3 70B | Every generation | $0.00 |
| Agent 4 | Cover Letter Generation | Gemini 1.5 Flash | Groq: Llama 3.3 70B | On user request (separate) | $0.00 |
| Agent 5A | ATS Scoring | Deterministic + Groq 8B | — | Post-generation | $0.00 |
| Agent 5B | Gap Advisor Analysis | Gemini 1.5 Flash | — | Async, cached 7 days | $0.00 |

### 5-Layer Composite Scoring Formula (Agent 3)

```
composite_score = (semantic   × 0.40)
                + (keyword    × 0.25)
                + (validation × 0.20)
                + (recency    × 0.10)
                + (seniority  × 0.05)

Where:
  semantic   = cosine_similarity(item_embedding, jd_embedding)
  keyword    = matched_keywords / total_extracted_keywords
  validation = item.validation_score / 100          ← pre-calculated at ingestion
  recency    = exp(−0.05 × months_since_completion)
  seniority  = alignment score (0.4–1.0) based on role level vs item framing
```

### Project Validation Score Formula (calculated at ingestion)

```
validation_score = (readme_quality    × 0.25)   ← depth, sections, code blocks
                 + (impact_detected   × 0.30)   ← quantified results present
                 + (recency_base      × 0.15)   ← freshness at time of ingestion
                 + (domain_relevance  × 0.20)   ← assessed by Agent 1
                 + (description_depth × 0.10)   ← description length + completeness

Range: 0–100, JD-independent, stored permanently on portfolio_items
```

### Free-Tier Capacity Ceiling

| Provider | Limit | Effective Daily Capacity |
|---|---|---|
| Groq (Llama 3.1 8B) | 14,400 req/day | ~14,400 Agent 1 calls |
| Gemini Flash | ~1M tokens/day | ~333 full resume generations |
| Gemini Embeddings | 100 RPM | Unlimited with batch + cache strategy |
| **Net capacity** | | **~200–250 unique generations/day** |

> Supports approximately 500–800 registered users at normal usage patterns before any infrastructure cost is incurred.

### Rate Limit Mitigation Strategies

| Risk | Mitigation |
|---|---|
| Groq daily quota exhaustion | BullMQ rate-limited workers; per-user daily generation cap |
| Gemini Flash token budget | Input token compression (entities, not raw JD); Redis counter at 90% → fallback |
| Embedding API limits | Batch embedding (up to 100 items/request); persistent storage (never re-embed unchanged items) |
| Model cold start (Ollama) | Keep-alive cron ping every 5 minutes |
| Perceived slowness | WebSocket stage progress events ("Analyzing JD..." → "Writing resume...") |

---

## 7. Key Architectural Decisions

**Fastify over Express:** Delivers 2–3× higher throughput on the same hardware with first-class TypeScript support and a modular plugin architecture.

**BullMQ over inline async:** Every AI operation is non-deterministic in duration. Queuing decouples user-facing request time from AI processing time, enables automatic retry logic, enforces rate limit compliance, and makes the system resilient to third-party API timeouts.

**Custom orchestration over LangChain:** With a two-engineer team, debugging a LangChain chain failure is significantly harder than debugging a typed TypeScript function with clear input/output contracts. The pipeline stages are well-defined enough that abstraction adds cost without benefit.

**Gemini Flash over GPT-4:** Gemini 1.5 Flash has a 1M token context window (critical for large portfolios), strong structured JSON output quality, and is entirely free within our usage tier. GPT-4 Turbo would cost $15–60 per 1M tokens with no free tier.

**pgvector over Pinecone/Weaviate:** Eliminates a separate managed vector database. Portfolio items store both relational data and vectors in one query. At MVP scale (under 100K vectors), pgvector with an IVFFlat index performs equivalently to dedicated vector databases.

**Two-score architecture:** The `validation_score` (JD-independent, calculated at ingestion) is separated from the composite relevance score (JD-dependent, calculated at generation time). This distinction enables the system to distinguish between a high-quality irrelevant project and a low-quality but perfectly relevant one.

**Cover letter as optional, separate action:** Decoupling cover letter generation from resume generation reduces pipeline complexity, gives users explicit control, and allows the cover letter context form to collect company-specific motivation inputs that meaningfully improve output quality.

---

## 8. Work Split — Two-Engineer Execution Plan

The work is divided **module by module** rather than by layer. Each engineer owns a complete vertical slice — database schema, API routes, frontend UI, and AI integration for their assigned modules. This allows full parallel development with minimal blocking dependencies.

---

### Engineer 1 — Identity, Portfolio & Intelligence Core

**Domain:** Everything that builds and enriches the user's asset pool — the foundation all generation depends on.

#### Module 1.1 — Project Infrastructure Setup

- Turborepo monorepo scaffold (pnpm workspaces: `apps/web`, `apps/api`, `apps/extension`, `packages/shared`)
- Shared package: Zod schemas, TypeScript types, utility functions
- Fastify server scaffold (plugins, middleware chain, error handling, health check)
- Clerk webhook handler and JWT verification middleware
- PostgreSQL schema creation (all tables, indexes, RLS policies via Supabase)
- pgvector extension setup and IVFFlat index configuration
- Redis (Upstash) connection and BullMQ queue infrastructure
- GitHub Actions CI/CD pipeline (lint, type-check, test, deploy)
- Railway deployment configuration (backend service)
- Vercel project setup (frontend, environment variables)

#### Module 1.2 — Authentication & Onboarding

**Backend:**
- `POST /auth/webhook` — Clerk `user.created` → DB user record creation
- `GET /users/me` — profile read
- `PATCH /users/me` — profile + career goal update

**Frontend:**
- Landing page (marketing copy + sign-up CTA)
- Sign-in / Sign-up pages (Clerk-hosted UI components)
- 4-step onboarding wizard
  - Step 1: Personal details (name, university, graduation year, target role)
  - Step 2: Work experience + education (manual entry, repeatable fields)
  - Step 3: Skills + certifications (tag input, cert URL entry)
  - Step 4: Project source selector (GitHub / Upload / Manual)
- Onboarding completion → redirect to dashboard

#### Module 1.3 — Portfolio Management

**Backend:**
- `GET /portfolio` — list all items for authenticated user
- `POST /portfolio` — create new item (any type)
- `PATCH /portfolio/:id` — update item (triggers embedding invalidation)
- `DELETE /portfolio/:id` — soft delete
- Embedding invalidation logic on PATCH
- Validation score recalculation trigger on project field change

**Frontend:**
- `/profile` page — portfolio overview with typed item cards
- Add/Edit forms per item type (modal drawer, type-specific fields)
- Validation score badge on project cards
- Portfolio completeness progress meter (sidebar widget)

#### Module 1.4 — GitHub Integration & Document Upload

**Backend:**
- `GET /github/connect` — OAuth initiation redirect
- `POST /github/callback` — token exchange, AES-256-GCM encryption, store
- `POST /github/sync` — enqueue job + set sync status flag
- BullMQ Worker: `github-sync`
  - Octokit repo fetch → Agent 1 enrichment → validation score → embedding → upsert
  - WebSocket progress events; sync status flag management
- `POST /portfolio/upload` — generate S3 presigned upload URL
- BullMQ Worker: `document-parse`
  - `pdf-parse` / `mammoth` text extraction → Agent 1 → portfolio item → score → embed

**Frontend:**
- GitHub connect button + OAuth redirect handling
- Sync status indicator in dashboard sidebar (idle / syncing / failed)
- "Syncing your GitHub..." progress banner (suppresses generation button)
- Document upload zone (drag-and-drop, PDF/DOCX only, file size limit)
- Upload progress indicator with processing state

#### Module 1.5 — AI Agents 1 & 2 Implementation

**Backend (AI Core):**
- Agent 1: Groq Llama 3.1 8B integration
  - JD extraction prompt (structured JSON output contract)
  - Document parsing prompt (portfolio item extraction)
  - Circuit breaker with Gemini Flash fallback
- Agent 2: Gemini text-embedding-004 integration
  - Single item embedding function
  - Batch embedding function (up to 100 items per API call)
  - Embedding cache (Redis, keyed by SHA-256 of content)
  - Fallback: Nomic Embed via Ollama HTTP API
- Project Validation Score calculation function
  - README quality scoring (section detection, code block count, length)
  - Impact metric detection (regex patterns + LLM assist for edge cases)
  - Domain relevance scoring (Agent 1 output field)
  - Recency decay function
- Pipeline trace logging (`pipeline_traces` table writes)

---

### Engineer 2 — Generation Engine, Analytics & Extension

**Domain:** Everything the user experiences after their portfolio exists.

#### Module 2.1 — Generation Engine Core

**Backend:**
- `POST /resume/generate` — validate readiness, create `job_target`, enqueue job
- BullMQ Worker: `resume-generate` (full pipeline orchestration)
  - `Promise.all`: Agent 1 JD extraction + Agent 2 portfolio scoring
  - Agent 3: Full TypeScript implementation
    - `scoreSemanticRelevance()`, `scoreKeywordMatch()`, `scoreImpact()`
    - `scoreRecency()`, `scoreSeniorityAlignment()`
    - `computeCompositeScore()`, `selectOptimalItems()`
  - Agent 4: Gemini 1.5 Flash content generation
    - Resume generation prompt template (versioned in codebase via Git)
    - Token budget management (input compression, truncation strategy)
    - Structured JSON output parsing + Zod validation
    - Groq 70B fallback with context window truncation
  - Template renderer: JSON → HTML injection (3 templates: Modern, Academic, Minimal)
  - Puppeteer: HTML → PDF generation
  - S3 upload + pre-signed URL generation
  - `resume_versions` record creation (auto-label, `selected_items` UUID array)
  - WebSocket progress events per pipeline stage

**Frontend:**
- `/generate` page — generation input form
  - Job title, company name, JD textarea, visual template selector
  - Generation readiness state logic (disabled states + contextual tooltips)
- WebSocket client: pipeline progress bar with stage labels
- PDF preview panel (`react-pdf` inline render)
- Download button (fetches current signed URL)
- Version label display + inline rename

#### Module 2.2 — Version Vault Dashboard

**Backend:**
- Dashboard aggregated data endpoint (versions + stats summary)
- `PATCH /resume/:id/status` — status transitions (draft → submitted → archived)

**Frontend:**
- `/dashboard` — centralized version vault
- Resume version cards (label, company, role, date, ATS badge, status, actions)
- Filter and sort controls (by company, date, ATS score, status)
- "Mark as Submitted", "Archive", "Duplicate" quick actions
- Empty state (first-time user with CTA guidance)

#### Module 2.3 — Cover Letter Generation

**Backend:**
- `POST /resume/:id/cover-letter` — validate context form inputs, enqueue job
- BullMQ Worker: `cover-letter-gen`
  - Agent 4 (Gemini Flash) with dedicated cover letter prompt template
  - Context: `selected_items` from resume version + JD + form inputs
  - Output: cover letter text → Puppeteer → PDF → S3
  - Link `cover_letter_s3_key` to `resume_versions` record

**Frontend:**
- "Generate Cover Letter" CTA button on version card and detail view
- Cover letter context modal:
  - "Why this company?" textarea (1–2 sentences)
  - Tone selector: Formal / Balanced / Conversational
  - "Anything to highlight?" optional textarea
- Cover letter PDF preview (reuses existing PDF viewer component)
- Download cover letter button

#### Module 2.4 — ATS Scoring & Gap Advisor

**Backend:**
- Agent 5A: ATS scoring engine
  - Deterministic keyword matching (Agent 1 keywords vs resume text)
  - Skills taxonomy JSON config file (synonyms, abbreviations)
  - Groq Llama 8B for unresolved synonym edge cases (conditional call only)
  - Output: score, grade, `found_keywords[]`, `missing_keywords[]`, `suggestions[]`
  - Stored on `resume_versions.ats_feedback`
- WebSocket push: ATS score delivered immediately after generation completes
- `GET /gap-analysis` — latest cached result for user
- `POST /gap-analysis/trigger` — manual re-run request
- BullMQ Worker: `gap-analysis`
  - Agent 5B: Gemini Flash career gap analysis prompt
  - Career goal embedding vs portfolio embedding cluster gap detection
  - Output: `missing_skills`, `suggested_projects` JSONB
  - 7-day cache invalidation logic (Redis TTL flag)

**Frontend:**
- ATS score badge component (reusable, used on version cards + detail view)
- ATS score detail panel on resume detail view:
  - Score gauge visualization (0–100 dial)
  - Found keywords (green chips)
  - Missing keywords (red chips + suggestions)
- `/gap` page — Gap Advisor tab:
  - Career goal display (inline editable)
  - Missing skill cluster cards (categorized, prioritized)
  - Suggested project type cards per gap
  - "Last analyzed" timestamp + manual refresh trigger

#### Module 2.5 — Browser Extension

- Plasmo project scaffold (unified Chrome + Firefox manifest)
- Content scripts with URL pattern matching:
  - `linkedin.com/jobs`, `indeed.com`, `handshake.com`
  - `greenhouse.io`, `lever.co`, Workday URL patterns
- DOM scraping: site-specific CSS selectors per supported platform
  - Extracts: job title, company name, full JD text, page URL
- Extension popup UI:
  - "Send to ResumeAI" primary button
  - Auth state check (Clerk JWT present in extension storage?)
  - Success confirmation / error feedback
- Background service worker:
  - `POST` scraped data → `/api/job-targets` (with Clerk JWT in header)
  - Open ResumeAI `/generate` tab on success (pre-populated form)
- Extension build pipeline (Plasmo build → Chrome Web Store ZIP + Firefox XPI)

---

## 9. Parallel Development Timeline

```
WEEK    ENGINEER 1                           ENGINEER 2
────────────────────────────────────────────────────────────────────────
1–2     Monorepo + infra setup               Generation engine scaffold
        DB schema + Supabase config          BullMQ worker infrastructure
        Clerk auth + webhook                 Agent 3 scoring algorithm
        Onboarding wizard UI                 (all 5 layers in TypeScript)

3–4     Portfolio CRUD API + UI              Agent 4 prompt architecture
        GitHub OAuth flow                    3 HTML resume templates
        github-sync BullMQ worker            Puppeteer PDF pipeline
        Document upload (S3 presign)         S3 upload utility functions

5–6     document-parse BullMQ worker         /generate page UI
        Agent 1 (Groq) integration           WebSocket progress client
        Agent 2 (Gemini embed) integration   react-pdf preview integration
        Validation score pipeline            Generation readiness logic

7–8     Profile edit + embedding             Version Vault dashboard UI
          invalidation + re-embed worker     Cover letter worker + UI
        GitHub delta sync                    ATS scoring (Agent 5A)
        Pipeline trace logging               WebSocket ATS push

9–10    Integration testing                  Browser extension (all platforms)
          (E1 APIs consumed by E2 features)  Gap Advisor (Agent 5B + UI)
        Rate limit + circuit breaker impl.   ATS detail panel UI

11–12   Cross-module QA                      PostHog analytics events
        Sentry setup (FE + BE)               End-to-end user flow testing
        RLS policy audit                     Extension store submission prep
        Performance profiling                Free-tier usage monitoring
```

---

## 10. Integration Touchpoints & Coordination Protocol

### Shared Interface Ownership

| Interface | Owner | Consumer |
|---|---|---|
| `portfolio_items` table schema | Engineer 1 | Engineer 2 (scoring in Agent 3) |
| Portfolio CRUD REST endpoints | Engineer 1 | Engineer 2 (generation pre-flight) |
| BullMQ queue names + job payload schemas | Engineer 1 | Engineer 2 (workers) |
| WebSocket event schema | Engineer 2 | Engineer 1 (sync progress events) |
| Zod shared types package | Both | Both |
| Agent 1 output JSON schema | Engineer 1 | Engineer 2 (Agent 3 input contract) |
| Agent 2 embedding function | Engineer 1 | Engineer 2 (cosine scoring) |
| `resume_versions` schema | Engineer 2 | Engineer 1 (dashboard references) |
| S3 presigned URL utility function | Engineer 1 | Engineer 2 (PDF + cover letter upload) |

### Coordination Protocol

> **Schema Change Rule:** Any change to a shared interface requires a PR that updates the Zod schema in the `packages/shared` package first. The consuming engineer reviews and approves before the PR is merged. This prevents the most common two-person coordination failure: silent schema drift.

> **No Self-Merge Policy:** Neither engineer merges their own PR. All merges require one review approval.

> **Weekly Sync:** A brief weekly sync (30 min) to review the integration touchpoint table, unblock dependencies, and confirm the upcoming week's interface contracts before coding begins.

> **Architecture Decision Records:** Any deviation from this blueprint during development is logged as an ADR (Architecture Decision Record) in the repository wiki under `/docs/adr/`.

---

*ResumeAI Technical Blueprint — Version 1.0 — Requirements Frozen*  
*This document is the authoritative reference for all implementation decisions.*
