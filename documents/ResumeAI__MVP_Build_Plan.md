# ResumeAI — MVP Backend Technical Implementation Blueprint

**Sections 2 · 3 · 4 | Version 1.0**
*Backend Architecture · Database Schema · Developer WBS · Folder Structure*

---

## Table of Contents

1. [Section 2 — Backend Architecture, Data Flows & Database Schema](#section-2)
   - [2.1 High-Level Architecture](#21-high-level-architecture)
   - [2.2 Request Lifecycle — Data Flow Engine](#22-request-lifecycle--data-flow-engine)
   - [2.3 Database Schema](#23-database-schema)
2. [Section 3 — Two-Developer WBS & Parallelisation Plan](#section-3)
   - [3.1 Phase 1 — Foundation](#31-phase-1--foundation-sequential-both-developers)
   - [3.2 Phase 2 — Parallel Sprints](#32-phase-2--parallel-sprints)
   - [3.3 Phase 3 — Integration & Testing](#33-phase-3--integration--testing)
3. [Section 4 — Enterprise Folder Structure](#section-4)
   - [4.1 Root Directory Tree](#41-root-directory-tree)
   - [4.2 Services, Templates, Data & Utilities](#42-services-templates-data--utilities)
   - [4.3 Module Internal Structure Convention](#43-module-internal-structure-convention)
   - [4.4 Key Technical Dependencies](#44-key-technical-dependencies)

---

---

<a name="section-2"></a>
## Section 2 — Backend Architecture, Data Flows & Database Schema

---

### 2.1 High-Level Architecture

```
+------------------------------------------------------------------+
|              CLIENT  (Next.js / Figma Design Frontend)           |
|                      REST API over HTTPS                         |
+-----------------------------+------------------------------------+
                              |
+-----------------------------v------------------------------------+
|                      FASTIFY API SERVER                          |
|  +---------------+  +--------------+  +---------------------+   |
|  | Auth          |  | Middleware   |  | Route Handlers      |   |
|  | Middleware    |  | (Rate Limit, |  | (Controllers)       |   |
|  | (JWT verify)  |  |  Zod Valid.) |  |                     |   |
|  +---------------+  +--------------+  +-----------+---------+   |
|                                                    |             |
|  +-------------------------------------------------v-----------+ |
|  |                    SERVICE LAYER                            | |
|  |  AuthService    ProfileService    ResumeService            | |
|  |  DocumentService   AIOrchestrationService                  | |
|  |  ATSService    GapAdvisorService    StorageService         | |
|  +----------+----------------------------------+--------------+ |
+--------------+----------------------------------+----------------+
               |                                  |
  +------------v------------+   +-----------------v--------------+
  |    PostgreSQL 16         |   |      External Services        |
  |    (Supabase)            |   |                               |
  |                          |   |  Groq API  (Llama 3.1 8B)    |
  |  - users                 |   |  Gemini 1.5 Flash             |
  |  - portfolio_items       |   |  AWS S3 (PDF + doc storage)   |
  |  - job_targets           |   |  Puppeteer (PDF rendering)    |
  |  - resume_versions       |   |                               |
  |  - cover_letters         |   +-------------------------------+
  |  - gap_analyses          |
  +--------------------------+
```

> **MVP Simplification:** The MVP architecture deliberately omits BullMQ async queues and WebSocket connections from the full blueprint. In their place, the generation pipeline runs as a synchronous `async/await` chain and a polling endpoint (`GET /resume/generate/status/:jobId`) delivers stage progress to the frontend. These are promoted to V2 when load requires it.

---

### 2.2 Request Lifecycle — Data Flow Engine

#### Flow 1: Authentication

> **Developer A** owns `POST /auth/register` and `POST /auth/login`.

```
POST /auth/register
    |
    v
Zod schema validation  (name, email, password, confirmPassword)
    |
    v
Check email uniqueness --> users table
    |
    +-- Exists --> 409 Conflict response
    |
    v
bcrypt.hash(password, 12)
    |
    v
INSERT into users table
    |
    v
jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })
    |
    v
Return { token, user: { id, name, email } }


POST /auth/login
    |
    v
Zod validation --> find user by email
    |
    +-- Not found --> 401 Unauthorized
    |
    v
bcrypt.compare(password, hash)
    |
    +-- No match --> 401 Unauthorized
    |
    v
jwt.sign({ userId, email }) --> Return token + user object
```

---

#### Flow 2: Onboarding / Profile Creation

```
POST /profile/personal          (Step 1)
POST /portfolio/experience      (Step 2a -- repeatable)
POST /portfolio/education       (Step 2b -- repeatable)
POST /portfolio/skills          (Step 3a)
POST /portfolio/certifications  (Step 3b -- repeatable)
POST /portfolio/projects        (Step 4a -- manual entry)
POST /portfolio/upload          (Step 4b -- document)
    |
    v  (each route follows this pattern)
JWT middleware --> extract userId
    |
    v
Zod schema validation per resource type
    |
    v
Service layer business logic
    |
    v
INSERT into portfolio_items (type-specific fields via JSONB)
    |
    v
For document uploads:
    +-- Upload file to S3
    +-- Store S3 key in portfolio_items.document_s3_key
    +-- Call DocumentParserService.parse(uploadedBuffer, mimetype, filename)
    |     +-- Extract text (pdf-parse or mammoth)
    |     +-- POST extracted text to NVIDIA NIM
    |     |   with structured extraction prompt
    |     +-- Validate and create portfolio_item records in PostgreSQL from AI output
    +-- Return { extractedItems[], documentId }
    |
    v
PATCH /onboarding/status --> update users.onboarding_step
    |
    v
Return created/updated resource
```

---

#### Flow 3: Resume Generation Pipeline (Core MVP Flow)

> **Developer B** owns this entire orchestration flow inside `src/modules/resume/orchestrator.service.ts`.

```
POST /resume/generate
    |
    v
JWT middleware --> extract userId
    |
    v
Zod validation: { jobTitle, companyName, jobDescription,
                  templateId, pageLength }
    |
    v
INSERT job_targets record --> get jobTargetId
    |
    v
-- ORCHESTRATION SERVICE START ------------------------------------

STAGE 1: JD Analysis  (Agent 1)
  POST to Groq API: Llama 3.1 8B
  Prompt: Extract { requiredSkills[], preferredSkills[],
                    techStack[], roleSeniority, roleCategory }
  Output: Structured JSON --> stored in job_targets.extracted_entities
  Status update: generation_status = 'analyzing_jd'

STAGE 2: Portfolio Scoring  (Agent 2 -- MVP keyword-based)
  Fetch all portfolio_items WHERE user_id = userId
  For each item compute composite score:
    keyword_score  = matched JD keywords / total JD keywords
    impact_score   = presence of quantified metrics (0 or 1)
    recency_score  = exp(-0.05 x months_since_date)
    type_weight    = { project: 1.0, experience: 0.9,
                       education: 0.6, certification: 0.5 }
    composite      = (keyword_score x 0.50)
                   + (impact_score  x 0.25)
                   + (recency_score x 0.15)
                   + (type_weight   x 0.10)
  Sort descending --> greedy select top items within page budget
  Status update: generation_status = 'scoring_portfolio'

STAGE 3: Content Generation  (Agent 3)
  POST to Gemini 1.5 Flash
  Prompt: selected items + JD entities + template config
  Output: Structured JSON resume content
    { summary, experience[], projects[], skills{},
      education[], certifications[], ats_keywords_used[] }
  Status update: generation_status = 'generating_content'

STAGE 4: PDF Rendering
  Inject JSON content into HTML template (templateId lookup)
  Puppeteer: HTML --> PDF Buffer
  Upload PDF to S3: users/{userId}/resumes/{uuid}.pdf
  Status update: generation_status = 'rendering_pdf'

STAGE 5: ATS Scoring  (Agent 4 -- deterministic)
  Compare resume text vs extracted JD keywords
  Apply skills-taxonomy.json for synonym matching
  Compute: ats_score, found_keywords[], missing_keywords[],
           suggestions[]
  Status update: generation_status = 'completed'

-- ORCHESTRATION SERVICE END --------------------------------------
    |
    v
INSERT resume_versions record:
  { userId, jobTargetId, templateId, versionLabel,
    selectedItemIds[], atsScore, atsFeedback{},
    pdfS3Key, status: 'draft' }
    |
    v
Return:
  { resumeVersionId, versionLabel, pdfSignedUrl,
    atsScore, atsFeedback, generationStatus: 'completed' }
```

---

#### Flow 4: Generation Status Polling

> **MVP alternative to WebSocket:** The frontend polls this endpoint every 2 seconds until `status = 'completed'` or `'failed'`. WebSocket real-time streaming is promoted to V2.

```
GET /resume/generate/status/:jobId
    |
    v
JWT middleware --> userId
    |
    v
SELECT generation_status, current_stage, progress_percent
FROM   resume_generation_jobs
WHERE  id = jobId AND user_id = userId
    |
    v
Return { status, currentStage, progressPercent, errorMessage? }
```

---

#### Flow 5: Cover Letter Generation

```
POST /resume/:resumeId/cover-letter
Body: { whyCompany, tone, highlightNote? }
    |
    v
JWT middleware --> fetch resume_versions record
Validate: resume belongs to userId
    |
    v
Fetch linked job_target  --> JD + company + role
Fetch selected_item_ids  --> portfolio items content
    |
    v
POST to Gemini 1.5 Flash:
  Input: { selectedItems, jobDescription, companyName,
           roleName, whyCompany, tone, highlightNote }
  Output: Full cover letter text
    |
    v
Generate PDF via Puppeteer --> upload to S3
INSERT cover_letters record
UPDATE resume_versions.cover_letter_id
    |
    v
Return { coverLetterId, pdfSignedUrl }
```

---

#### Flow 6: Gap Advisor Analysis

```
POST /gap-analysis/run   (or GET /gap-analysis/latest)
    |
    v
JWT middleware --> userId
Fetch users.career_goal
    |
    v
Fetch all portfolio_items WHERE user_id = userId
Extract all tech_stack[], skills[], certification names
    |
    v
POST to Gemini 1.5 Flash:
  Input: { careerGoal, portfolioSummary: {
             skills[], techStack[],
             projectDomains[], experienceSummary } }
  Prompt: Identify missing skills, suggest projects,
          return structured JSON
  Output: { missingSkills[], suggestedProjects[],
            learningResources[], priorityLevel[] }
    |
    v
UPSERT gap_analyses record
  (one row per user, overwrites previous on re-run)
    |
    v
Return gap analysis result
```

---

### 2.3 Database Schema

> **Schema Design Notes:** All tables use UUID primary keys generated server-side via `gen_random_uuid()`. A single `portfolio_items` table with a `type` enum handles all asset categories, avoiding five separate tables and the join complexity that would follow. JSONB columns are used for AI output fields that have flexible, evolving shapes.

---

#### Table: `users`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT | `gen_random_uuid()` |
| `full_name` | TEXT | NOT NULL | |
| `email` | TEXT | UNIQUE, NOT NULL | Lowercased before insert |
| `password_hash` | TEXT | NOT NULL | bcrypt, 12 rounds |
| `university` | TEXT | NULL | |
| `graduation_year` | SMALLINT | NULL | e.g. 2025 |
| `target_role_category` | TEXT | NULL | e.g. "Software Engineering" |
| `career_goal` | TEXT | NULL | Free-text career goal statement |
| `onboarding_step` | SMALLINT | DEFAULT 1 | 1–5, tracks wizard progress |
| `onboarding_complete` | BOOLEAN | DEFAULT FALSE | Set to TRUE after Step 5 |
| `profile_photo_s3_key` | TEXT | NULL | S3 object key for avatar |
| `notif_gap_digest` | BOOLEAN | DEFAULT TRUE | Weekly email preference |
| `notif_gen_complete` | BOOLEAN | DEFAULT FALSE | Generation email preference |
| `notif_sync_complete` | BOOLEAN | DEFAULT TRUE | Sync notification preference |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Updated via trigger |

---

#### Table: `portfolio_items`

> **Unified asset table:** A single `portfolio_items` table handles all five asset types (project, experience, education, skill, certification) using a `type` ENUM column. Type-specific columns are `NULL` for irrelevant types. This avoids five separate tables and over-normalisation at MVP scale.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK, NOT NULL | → users.id ON DELETE CASCADE |
| `type` | ENUM | NOT NULL | project / experience / education / skill / certification |
| `source` | ENUM | DEFAULT 'manual' | manual / upload / github (V2) |
| `title` | TEXT | NOT NULL | Primary display name |
| `description` | TEXT | NULL | Rich text description |
| `start_date` | DATE | NULL | Used by project, experience, education |
| `end_date` | DATE | NULL | NULL when `is_current = TRUE` |
| `is_current` | BOOLEAN | DEFAULT FALSE | Disables end_date display |
| `tech_stack` | TEXT[] | DEFAULT '{}' | Project: array of technology tags |
| `project_url` | TEXT | NULL | Project: GitHub / demo URL |
| `impact_metrics` | TEXT | NULL | Project: quantified results |
| `domain_category` | TEXT | NULL | Project: Web / ML / Mobile / etc. |
| `company_name` | TEXT | NULL | Experience: employer name |
| `employment_type` | TEXT | NULL | Experience: Internship / Full-time etc. |
| `location` | TEXT | NULL | Experience: city or Remote |
| `degree` | TEXT | NULL | Education: degree name |
| `field_of_study` | TEXT | NULL | Education: discipline |
| `institution_name` | TEXT | NULL | Education: university/college |
| `gpa` | TEXT | NULL | Education: GPA or percentage |
| `achievements` | TEXT | NULL | Education: Dean's List, medals etc. |
| `issuing_org` | TEXT | NULL | Certification: issuing organisation |
| `cert_url` | TEXT | NULL | Certification: verification URL |
| `expiry_date` | DATE | NULL | Certification: NULL if no_expiry |
| `no_expiry` | BOOLEAN | DEFAULT FALSE | Certification: no expiry toggle |
| `skill_name` | TEXT | NULL | Skill: single skill tag value |
| `document_s3_key` | TEXT | NULL | Upload: S3 object key of source doc |
| `document_filename` | TEXT | NULL | Upload: original filename |
| `validation_score` | NUMERIC(5,2) | NULL | Rule-based score 0–100 |
| `extra` | JSONB | DEFAULT '{}' | Overflow / future fields |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

*Indexes: `(user_id)`, `(user_id, type)`, `(source)`*

---

#### Table: `job_targets`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK, NOT NULL | → users.id ON DELETE CASCADE |
| `job_title` | TEXT | NOT NULL | |
| `company_name` | TEXT | NOT NULL | |
| `job_description` | TEXT | NOT NULL | Full JD text from user input |
| `source_url` | TEXT | NULL | V2: populated by browser extension |
| `ingested_via` | TEXT | DEFAULT 'manual' | manual / extension (V2) |
| `extracted_entities` | JSONB | DEFAULT '{}' | Agent 1 output: skills, seniority, etc. Shape: `{ requiredSkills[], preferredSkills[], techStack[], roleSeniority, roleCategory }` |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

*Index: `(user_id)`*

---

#### Table: `resume_generation_jobs`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK | → users.id ON DELETE CASCADE |
| `job_target_id` | UUID | FK, NULL | → job_targets.id |
| `status` | ENUM | DEFAULT 'queued' | queued / analyzing_jd / scoring_portfolio / generating_content / rendering_pdf / completed / failed |
| `current_stage` | TEXT | NULL | Human-readable stage label |
| `progress_percent` | SMALLINT | DEFAULT 0 | 0–100 for polling display |
| `error_message` | TEXT | NULL | Set on failure |
| `started_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `completed_at` | TIMESTAMPTZ | NULL | Set when status = completed |

*Index: `(user_id)`*

---

#### Table: `resume_versions`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK, NOT NULL | → users.id ON DELETE CASCADE |
| `job_target_id` | UUID | FK, NULL | → job_targets.id |
| `generation_job_id` | UUID | FK, NULL | → resume_generation_jobs.id |
| `version_label` | TEXT | NULL | Auto-generated e.g. "SWE-Google-v1" |
| `template_id` | TEXT | NOT NULL | modern / academic / minimal |
| `page_length` | TEXT | DEFAULT '1-page' | 1-page or 1.5-page |
| `selected_item_ids` | UUID[] | DEFAULT '{}' | Ordered array of portfolio item UUIDs |
| `generated_content` | JSONB | DEFAULT '{}' | Agent 4 output: full resume JSON |
| `ats_score` | NUMERIC(5,2) | NULL | 0–100 |
| `ats_feedback` | JSONB | DEFAULT '{}' | `{ foundKeywords[], missingKeywords[], suggestions[] }` |
| `pdf_s3_key` | TEXT | NULL | S3 object key for generated PDF |
| `cover_letter_id` | UUID | FK, NULL | → cover_letters.id ON DELETE SET NULL |
| `status` | ENUM | DEFAULT 'draft' | draft / submitted / archived |
| `submitted_at` | TIMESTAMPTZ | NULL | Set when status → submitted |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

*Indexes: `(user_id)`, `(user_id, status)`, `(job_target_id)`*

---

#### Table: `cover_letters`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK, NOT NULL | → users.id ON DELETE CASCADE |
| `resume_version_id` | UUID | FK, NOT NULL | → resume_versions.id ON DELETE CASCADE |
| `why_company` | TEXT | NULL | Context form input |
| `tone` | TEXT | DEFAULT 'balanced' | formal / balanced / conversational |
| `highlight_note` | TEXT | NULL | Optional highlight context |
| `content_text` | TEXT | NULL | Full generated cover letter text |
| `pdf_s3_key` | TEXT | NULL | S3 object key for cover letter PDF |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

*Index: `(resume_version_id)`*

---

#### Table: `gap_analyses`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK, UNIQUE | → users.id — one row per user |
| `career_goal` | TEXT | NOT NULL | Snapshotted at analysis time |
| `missing_skills` | JSONB | DEFAULT '[]' | `[{ skill, priority, reason }]` |
| `suggested_projects` | JSONB | DEFAULT '[]' | `[{ projectType, description, skillsAddressed[] }]` |
| `learning_resources` | JSONB | DEFAULT '[]' | `[{ resource, url, skillAddressed }]` |
| `generated_at` | TIMESTAMPTZ | DEFAULT NOW() | Used for 7-day staleness check |

---

#### Entity Relationship Summary

```
users ---------------------------------------------------------+
  |                                                            |
  +--< portfolio_items          (1:many, CASCADE delete)       |
  |                                                            |
  +--< job_targets              (1:many, CASCADE delete)       |
  |         |                                                  |
  |         +--< resume_generation_jobs   (1:many)            |
  |                     |                                      |
  |                     +--< resume_versions      (1:1)        |
  |                               |                            |
  |                               +--< cover_letters (0:1)     |
  |                                                            |
  +--< gap_analyses  (1:1 UNIQUE, upserted on re-run) ---------+
```

---

---

<a name="section-3"></a>
## Section 3 — Two-Developer WBS & Parallelisation Plan

> **Developer Assignment:** **Developer A** owns the Auth, Profile, Portfolio & Storage domain (Zones 1, 2, 4, 7). **Developer B** owns the AI Pipeline, Generation Engine & Analytics domain (Zones 5, 6). Both developers collaborate on Phase 1 foundation work.

---

### 3.1 Phase 1 — Foundation (Sequential, Both Developers)

> **Duration: 3–4 Days.** Must complete before any parallel work begins. Developer A leads implementation; Developer B reviews all Phase 1 PRs. Neither developer begins their Phase 2 sprint until all Phase 1 tasks are merged to `develop`.

| # | Task | Branch | Deliverable / Done When |
|---|---|---|---|
| 1.1 | Repository setup + tooling | `feature/repo-setup` | tsconfig, eslint, prettier, .env.example committed. Both developers can clone and run. |
| 1.2 | Fastify server scaffold | `feature/server-scaffold` | `GET /health` returns 200. Plugin chain (cors, helmet, rate-limit, Pino logger) registered. |
| 1.3 | Database schema + migrations | `feature/database-schema` | All 7 migration files applied. Tables verified on Supabase. pg connection pool connects cleanly. |
| 1.4 | Shared middleware | `feature/shared-middleware` | JWT verify middleware rejects unauthenticated requests with 401. Zod validator returns 422 on bad input. Error class hierarchy in `src/utils/errors.ts`. |
| 1.5 | S3 storage utility | `feature/storage-service` | `uploadFile()`, `getSignedUrl()`, `deleteFile()` tested with a sample file against S3. |
| 1.6 | Environment configuration | `feature/env-config` | Zod-parsed `src/config/env.ts`. Server refuses to start with missing required keys. |

**Phase 1 Complete When:**
- `GET /health` returns 200
- All DB tables exist and accept test inserts
- JWT middleware correctly rejects unauthenticated requests
- S3 upload/download tested end-to-end
- Both developers run the server locally without errors

---

### 3.2 Phase 2 — Parallel Sprints

> **Duration: 10–12 Days.** Full parallel execution after Phase 1 merge. Developer A and Developer B touch completely separate files, tables, and service modules. The only shared files (`db/client.ts`, `middleware/auth.ts`, `src/types/`) are read-only from this point.

---

#### Developer A Sprint — Auth, Profile & Portfolio

> **Domain:** All user identity, onboarding, portfolio management, document upload, and settings endpoints. Developer A's modules are the data foundation that Developer B's generation pipeline reads from.

| Sprint | Branch | Files Owned | Endpoints |
|---|---|---|---|
| **A-1** Days 1–2 | `feature/auth-endpoints` | `src/modules/auth/*` | `POST /auth/register` `POST /auth/login` `GET /auth/me` |
| **A-2** Days 2–5 | `feature/profile-onboarding` | `src/modules/profile/*` | `PATCH /profile/personal` `PATCH /profile/career-goal` `GET /profile/me` `PATCH /profile/onboarding-step` `GET /profile/completeness` |
| **A-3** Days 3–7 | `feature/portfolio-crud` | `src/modules/portfolio/*` | Full CRUD for `/portfolio/projects`, `/portfolio/experience`, `/portfolio/education`, `/portfolio/skills`, `/portfolio/certifications` |
| **A-4** Days 6–8 | `feature/document-upload` | `src/modules/documents/*` `src/services/document-parser.service.ts` | `POST /portfolio/upload` → S3 upload → text extraction → NVIDIA NIM parse → portfolio items |
| **A-5** Days 8–9 | `feature/settings` | `src/modules/settings/*` | `PATCH /settings/profile` `PATCH /settings/career-goal` `PATCH /settings/notifications` `DELETE /settings/account` |

---

#### Developer B Sprint — AI Pipeline, Generation & Analytics

> **Domain:** All AI service wrappers, resume generation orchestrator, cover letter engine, ATS scoring, and Gap Advisor. Developer B's modules depend on portfolio data written by Developer A's endpoints.

| Sprint | Branch | Files Owned | Deliverable |
|---|---|---|---|
| **B-1** Days 1–3 | `feature/ai-clients` | `src/services/groq.service.ts` `src/services/gemini.service.ts` `src/services/pdf-renderer.service.ts` `src/services/ats-scorer.service.ts` | Groq + Gemini API wrappers. Puppeteer PDF renderer. Deterministic ATS keyword scorer. Skills taxonomy JSON. |
| **B-2** Days 2–4 | `feature/jd-analysis` | `src/modules/ai/jd-analyzer.service.ts` `src/modules/ai/portfolio-scorer.service.ts` `src/modules/ai/item-selector.service.ts` `src/modules/ai/prompts/*` | JD entity extraction via Groq. 4-layer portfolio scoring. Greedy item selector with category caps. All prompt templates versioned. |
| **B-3** Days 3–7 | `feature/resume-generation` | `src/modules/resume/*` | `POST /resume/generate` `GET /resume/generate/status/:jobId` `GET /resume/versions` `GET /resume/versions/:id` `POST /resume/versions/:id/duplicate` `PATCH /resume/versions/:id/status` `DELETE /resume/versions/:id` |
| **B-4** Days 6–8 | `feature/cover-letter` | `src/modules/cover-letter/*` | `POST /resume/:resumeId/cover-letter` `GET /resume/:resumeId/cover-letter` Gemini generation + Puppeteer PDF + S3 |
| **B-5** Days 7–10 | `feature/analytics` | `src/modules/analytics/*` | `GET /analytics/ats/:resumeVersionId` `POST /analytics/gap-analysis` `GET /analytics/gap-analysis` |

---

### 3.3 Phase 3 — Integration & Testing

> **Duration: 4–5 Days. Both streams converge.** The primary test path is: Register → Onboard → Add Projects → Generate Resume → View ATS Score.

| Day | Focus | Activities |
|---|---|---|
| **Day 1** | API Contract Verification | Both developers together: verify all endpoints accept tokens from Auth module. Verify generation pipeline reads `portfolio_items` written by Portfolio module. Test cross-module happy path. Fix type mismatches in shared JSONB field shapes. |
| **Day 2** | Integration Tests | Write integration tests: `POST /auth/register` + `POST /resume/generate` (full flow) · Portfolio round-trip · Document upload → extracted items appear · Cover letter linked to resume version · ATS score populated on resume card. |
| **Day 3** | Error Path Coverage | Test all 401 / 403 / 404 / 422 / 500 response paths · Groq API failure returns graceful error · Gemini 429 returns retry-friendly response · S3 failure rolls back DB record · User isolation: user A cannot access user B's resources. |
| **Day 4** | Security & Performance Audit | Rate limiting on auth endpoints (max 10/min) · File upload size enforced (10MB hard limit) · Signed URL expiry verified (15 minutes) · All queries parameterised (no raw SQL interpolation) · Expired JWT tokens rejected. |
| **Day 5** | Staging Deployment | Deploy to Railway staging · Run full end-to-end flow against staging DB · Verify Puppeteer PDF renders on Railway · Deliver API base URL + Postman collection to frontend team. |

---

---

<a name="section-4"></a>
## Section 4 — Enterprise Folder Structure

> **Design Principles:** Every module under `src/modules/` is a self-contained vertical slice: routes, controller, service, schema (Zod), and test in one directory. Infrastructure singletons (database, S3, NVIDIA NIM, Groq, Gemini) live in `src/services/` and `src/db/`. No module imports from another module's internals — only from `src/services/`, `src/db/`, `src/types/`, and `src/utils/`.

---

### 4.1 Root Directory Tree

```
resumeai-backend/
|
+-- src/
|   +-- app.ts                    # Fastify instance, plugin registration
|   +-- server.ts                 # Entry point -- listens on PORT
|   |
|   +-- config/
|   |   +-- env.ts                # Zod-parsed env validation (fails at startup
|   |   |                         # if required keys are missing)
|   |   +-- constants.ts          # JWT_EXPIRY, S3_BUCKET, RATE_LIMITS, etc.
|   |
|   +-- db/
|   |   +-- client.ts             # pg Pool singleton (shared read-only import)
|   |   +-- index.ts              # Re-exports client + typed query helper
|   |   +-- migrations/
|   |       +-- 001_create_users.sql
|   |       +-- 002_create_portfolio_items.sql
|   |       +-- 003_create_job_targets.sql
|   |       +-- 004_create_generation_jobs.sql
|   |       +-- 005_create_resume_versions.sql
|   |       +-- 006_create_cover_letters.sql
|   |       +-- 007_create_gap_analyses.sql
|   |
|   +-- middleware/
|   |   +-- auth.ts               # JWT verify --> attaches req.user to context
|   |   +-- validate.ts           # Zod body/query/param validation factory
|   |   +-- rate-limit.ts         # Per-route rate limit config objects
|   |   +-- upload.ts             # Multipart file handling (fastify-multipart)
|   |
|   +-- modules/
|   |   |
|   |   +-- auth/                          [DEV A]
|   |   |   +-- auth.routes.ts
|   |   |   +-- auth.controller.ts
|   |   |   +-- auth.service.ts
|   |   |   +-- auth.schema.ts             # Zod schemas: RegisterInput, LoginInput
|   |   |   +-- auth.test.ts
|   |   |
|   |   +-- profile/                       [DEV A]
|   |   |   +-- profile.routes.ts
|   |   |   +-- profile.controller.ts
|   |   |   +-- profile.service.ts
|   |   |   +-- profile.schema.ts
|   |   |   +-- profile.test.ts
|   |   |
|   |   +-- portfolio/                     [DEV A]
|   |   |   +-- portfolio.routes.ts
|   |   |   +-- portfolio.controller.ts
|   |   |   +-- portfolio.service.ts
|   |   |   +-- portfolio.schema.ts        # Zod per type: ProjectInput, etc.
|   |   |   +-- portfolio.test.ts
|   |   |
|   |   +-- documents/                     [DEV A]
|   |   |   +-- documents.routes.ts
|   |   |   +-- documents.controller.ts
|   |   |   +-- documents.service.ts       # Calls document-parser.service
|   |   |   +-- documents.test.ts
|   |   |
|   |   +-- settings/                      [DEV A]
|   |   |   +-- settings.routes.ts
|   |   |   +-- settings.controller.ts
|   |   |   +-- settings.service.ts
|   |   |   +-- settings.schema.ts
|   |   |
|   |   +-- ai/                            [DEV B]
|   |   |   +-- jd-analyzer.service.ts
|   |   |   +-- portfolio-scorer.service.ts
|   |   |   +-- item-selector.service.ts
|   |   |   +-- prompts/
|   |   |       +-- jd-extraction.prompt.ts
|   |   |       +-- resume-generation.prompt.ts
|   |   |       +-- cover-letter.prompt.ts
|   |   |       +-- gap-advisor.prompt.ts
|   |   |       +-- document-parser.prompt.ts
|   |   |
|   |   +-- resume/                        [DEV B]
|   |   |   +-- resume.routes.ts
|   |   |   +-- resume.controller.ts
|   |   |   +-- resume.service.ts
|   |   |   +-- resume.schema.ts
|   |   |   +-- orchestrator.service.ts    # Coordinates Stages 1-5
|   |   |   +-- resume.test.ts
|   |   |
|   |   +-- cover-letter/                  [DEV B]
|   |   |   +-- cover-letter.routes.ts
|   |   |   +-- cover-letter.controller.ts
|   |   |   +-- cover-letter.service.ts
|   |   |   +-- cover-letter.schema.ts
|   |   |
|   |   +-- analytics/                     [DEV B]
|   |       +-- analytics.routes.ts
|   |       +-- analytics.controller.ts
|   |       +-- ats.service.ts
|   |       +-- gap-advisor.service.ts
|   |       +-- analytics.test.ts
```

---

### 4.2 Services, Templates, Data & Utilities

```
|   +-- services/                 # Shared infrastructure singletons
|   |   +-- storage.service.ts           [DEV A] S3 upload/download/signedUrl
|   |   +-- document-parser.service.ts   [DEV A] pdf-parse + mammoth + NIM extraction
|   |   +-- nvidia-nim.service.ts        [SHARED] NVIDIA NIM structured response wrapper
|   |   +-- groq.service.ts              [DEV B] Groq API wrapper + error handling
|   |   +-- gemini.service.ts            [DEV B] Gemini API wrapper + 429 retry
|   |   +-- pdf-renderer.service.ts      [DEV B] Puppeteer HTML -> PDF buffer
|   |   +-- ats-scorer.service.ts        [DEV B] Deterministic keyword matcher
|   |
|   +-- templates/                [DEV B] HTML resume templates for Puppeteer
|   |   +-- modern.html
|   |   +-- academic.html
|   |   +-- minimal.html
|   |
|   +-- data/
|   |   +-- skills-taxonomy.json  [DEV B] Synonym map: "ML" <-> "Machine Learning"
|   |
|   +-- types/
|   |   +-- index.ts              # Re-exports all types
|   |   +-- user.types.ts         # User, AuthPayload, JWTUser
|   |   +-- portfolio.types.ts    # PortfolioItem, PortfolioItemType
|   |   +-- resume.types.ts       # ResumeVersion, GenerationJob, CoverLetter
|   |   +-- ai.types.ts    [DEV B] ExtractedEntities, ScoredItem,
|   |                      #        SelectedItem, ATSResult, GapAnalysis
|   |
|   +-- utils/
|       +-- errors.ts             # AppError, NotFoundError, UnauthorizedError,
|       |                         # ValidationError, ConflictError
|       +-- response.ts           # success(data, status) + error(msg, status)
|       +-- logger.ts             # Pino logger instance (structured JSON logs)
|       +-- jwt.ts                # signToken(payload) + verifyToken(token)
|       +-- crypto.ts             # AES-256-GCM encrypt/decrypt (tokens, V2)
|       +-- version-label.ts      # Auto-generate "SWE-Google-v1" labels
|       +-- pagination.ts         # limit/offset query helper
|
+-- tests/
|   +-- integration/
|   |   +-- auth.integration.test.ts
|   |   +-- portfolio.integration.test.ts
|   |   +-- resume-generation.integration.test.ts
|   |   +-- cover-letter.integration.test.ts
|   +-- unit/
|   |   +-- portfolio-scorer.unit.test.ts
|   |   +-- ats-scorer.unit.test.ts
|   |   +-- item-selector.unit.test.ts
|   |   +-- version-label.unit.test.ts
|   +-- fixtures/
|       +-- mock-user.ts
|       +-- mock-portfolio-items.ts
|       +-- mock-jd.ts
|
+-- .env                          # NEVER committed -- in .gitignore
+-- .env.example                  # Committed -- all keys listed, no values
+-- .gitignore
+-- .eslintrc.json
+-- .prettierrc
+-- tsconfig.json
+-- package.json
+-- pnpm-lock.yaml
+-- Dockerfile
+-- docker-compose.yml            # Local dev: postgres service + api service
+-- README.md
```

---

### 4.3 Module Internal Structure Convention

Every module under `src/modules/` follows the same four-file pattern. This convention must be maintained consistently for all modules regardless of size.

| File | Responsibility |
|---|---|
| `*.routes.ts` | Registers the Fastify route tree for this module. Applies middleware (auth, validate, rate-limit) per route. Calls controller functions only — no business logic here. |
| `*.controller.ts` | Handles HTTP concerns only: read from `request.body` / `params` / `query`, call service functions, return formatted response via `src/utils/response.ts`. No SQL. No AI calls. |
| `*.service.ts` | Contains all business logic, database queries, and calls to `src/services/*`. This is the only layer that talks to the database or AI clients. Pure TypeScript functions with typed inputs and outputs. |
| `*.schema.ts` | Zod validation schemas for all request bodies and response shapes in this module. Imported by both `validate.ts` middleware and the service layer for type inference. |
| `*.test.ts` | Unit and integration tests for this module. Tests call service functions directly for unit tests, and make HTTP requests via Fastify's `inject()` for integration tests. |

---

### 4.4 Key Technical Dependencies

| Package | Version | Purpose |
|---|---|---|
| `fastify` | 4.x | HTTP server framework |
| `@fastify/cors` | 9.x | CORS headers plugin |
| `@fastify/helmet` | 11.x | Security headers |
| `@fastify/rate-limit` | 9.x | Per-route rate limiting |
| `@fastify/multipart` | 8.x | File upload handling |
| `zod` | 3.x | Schema validation + TypeScript inference |
| `pg` | 8.x | PostgreSQL client (node-postgres) |
| `bcrypt` | 5.x | Password hashing (12 rounds) |
| `jsonwebtoken` | 9.x | JWT sign and verify |
| `@aws-sdk/client-s3` | 3.x | S3 upload, download, presigned URLs |
| `groq-sdk` | 0.x | Groq API client (Llama 3.1 8B) |
| `@google/generative-ai` | 0.x | Gemini 1.5 Flash + embedding |
| `puppeteer` | 22.x | Headless Chrome PDF rendering |
| `pdf-parse` | 1.x | Extract text from PDF uploads |
| `mammoth` | 1.x | Extract text from DOCX uploads |
| `pino` | 9.x | Structured JSON logger |
| `vitest` | 1.x | Unit + integration test runner |
| `typescript` | 5.x | Language + type checking |
| `tsx` | 4.x | TypeScript execution for dev |

---

*ResumeAI MVP Backend Technical Blueprint · Version 1.0*
*Sections 2 (Architecture & Schema) · 3 (Developer WBS) · 4 (Folder Structure)*
*This document is the authoritative backend engineering reference for the MVP build.*
