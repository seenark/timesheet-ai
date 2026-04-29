# Product Requirements Document (PRD)

## AI-Powered Evidence-Backed Semi-Timesheet System

---

## 1. Overview

This product is a **work tracking and reporting system** that collects activity from multiple platforms, maps those activities to internal users and projects, and generates a **daily manager-facing productivity summary** at **20:00 every day**.

The system is designed to solve the weakness of manual timesheets by replacing self-reported work logs with **evidence-backed activity records** from engineering tools such as Git, Plane, and Discord.

The output is a **semi-timesheet system powered by AI**:

- AI estimates what each person worked on
- AI estimates hours per project
- users/admins can adjust hours manually
- final reports use adjusted hours as source of truth

---

## 2. Product Goal

### Primary Goal

Provide a **manager-facing daily report** that answers:

- **who did what**
- **on which project**
- **with what kind of work**
- **for how long**
- in a format that is readable, structured, and evidence-backed

### Secondary Goals

- reduce dependence on manual timesheet entry
- create a trustworthy cross-checking system for HR/management
- support per-user and per-project breakdown
- support extensible integrations via plugins

---

## 3. Target Users

### Primary Users

- Engineering managers
- Team leads
- HR / operations reviewers
- Admins managing integrations and mappings

### Secondary Users

- Individual contributors reviewing their own daily activity
- Developers adjusting estimated hours into actual hours

---

## 4. Success Criteria

The system is successful if it can:

1. Collect activity from supported sources reliably
2. Correctly map external identities to internal users
3. Associate events with the correct projects
4. Generate clear daily summaries per user and project
5. Estimate working hours with reasonable accuracy
6. Allow manual adjustment without losing AI-generated values
7. Produce final reports at 20:00 daily
8. Support adding future sources through a plugin architecture

---

## 5. Scope

## In Scope

- Git repo ingestion via clone/fetch/log parsing
- Plane ingestion via API
- Discord ingestion via webhook
- custom plugin framework for future integrations
- user identity mapping across systems
- project mapping across systems
- event normalization and storage
- cross-source merging into coherent work units
- AI-generated daily summaries
- AI-based hour estimation
- manual hour adjustment
- admin UI for managing integrations and mappings
- daily scheduled report generation at 20:00

## Out of Scope (initial version)

- payroll integration
- attendance / clock-in clock-out
- deep employee performance scoring
- public marketplace for third-party plugins
- fully autonomous identity mapping without admin review
- mobile app

---

## 6. Supported Data Sources

### 6.1 Git

The system will:

- clone the full repository initially
- perform incremental fetches afterward
- parse git history/logs to detect user activities
- use author email/name and commit metadata for identity mapping
- extract changed files and diff statistics for enrichment

### 6.2 Plane

The system will collect:

- issue updates
- status changes
- comments
- related project metadata

### 6.3 Discord

The system will receive:

- real-time webhook events for messages

Rules:

- store immediately on receipt
- only store messages from mapped users
- ignore messages from unmapped users
- collect every mapped user message
- optionally filter low-signal noise during processing, not ingestion

### 6.4 Custom Plugins

The system will support additional platforms through a controlled plugin interface that transforms source data into standardized events.

---

## 7. Reporting Requirements

### Report Type

The report is a combination of:

- **team productivity summary**
- **manager-facing high-level report**

### Report Structure

The daily report must:

- be generated at **20:00 local configured time**
- separate output **by person**
- nest work **by project**
- support users working across **multiple projects in one day**
- provide **1–2 paragraphs per project**
- classify work into categories such as:
    - feature
    - fix
    - debug
    - ops

### Time Reporting

Each report entry must include:

- AI-estimated hours
- manually adjusted hours, if provided
- final effective hours = adjusted hours if present, otherwise AI estimate

---

## 8. Functional Requirements

## 8.1 Data Ingestion

### FR-1 Git Ingestion

The system shall:

- clone configured git repositories
- fetch updates on a schedule
- parse git logs since last sync
- extract commit metadata:
    - commit hash
    - author name
    - author email
    - timestamp
    - commit message
    - changed files
    - additions/deletions

### FR-2 Plane Ingestion

The system shall:

- fetch Plane activity on a schedule
- collect issue changes, status changes, and comments
- map Plane project references to internal projects

### FR-3 Discord Webhook Ingestion

The system shall:

- expose webhook endpoints for Discord events
- validate incoming webhook payloads
- store events immediately for mapped users only

### FR-4 Plugin-Based Ingestion

The system shall:

- treat Git, Plane, Discord, and future sources as plugins
- support both:
    - pull-based plugins
    - push-based plugins
- require plugins to emit standardized normalized events

---

## 8.2 Identity Mapping

### FR-5 User Identity Resolution

The system shall support one internal user having multiple external identities across:

- git author emails
- GitHub usernames if later added
- Discord IDs
- Plane IDs
- plugin-specific identities

### FR-6 Identity Confidence

The system shall support mapping confidence levels and verification state.

### FR-7 Mapping Workflow

The system shall:

- auto-match high-confidence identities
- store unmapped identities separately
- provide admin UI for manual linking

### FR-8 Discord Mapping Constraint

The system shall not store Discord messages from unmapped users.

---

## 8.3 Project Mapping

### FR-9 Project Mapping

The system shall support mapping projects to:

- git repositories
- Plane project IDs
- future plugin project references

### FR-10 Multi-Project Support

The system shall support one user contributing to 2–3 or more projects in one day.

---

## 8.4 Event Storage and Normalization

### FR-11 Raw Event Storage

The system shall store source payloads as immutable raw events.

### FR-12 Normalized Event Storage

The system shall transform source-specific records into a standard event model.

### FR-13 Deduplication

The system shall prevent duplicate events based on source and external ID.

---

## 8.5 Git Parsing and Enrichment

### FR-14 Noise Filtering

The system shall support filtering low-signal commits such as:

- merge commits
- auto-generated commits
- trivial version bumps
- very short meaningless messages

### FR-15 Commit Enrichment

The system shall enrich commit records into structured work signals using:

- message classification
- keyword detection
- file/module hints
- optional lightweight AI classification

### FR-16 Commit Grouping

The system shall group related commits into logical work blocks before summarization.

---

## 8.6 Cross-Source Merging

### FR-17 Daily Grouping

The system shall group events by:

- user
- project
- date

### FR-18 Session Detection

The system shall split events into work sessions using time gap heuristics.

### FR-19 Work Unit Clustering

The system shall merge related Git, Plane, and Discord events into coherent work units using:

- issue/ticket ID matching
- keyword similarity
- module/file similarity
- time proximity

### FR-20 Separate Unrelated Work

The system shall avoid over-merging unrelated work and prefer multiple smaller work units when confidence is low.

---

## 8.7 AI Processing

### FR-21 Summary Generation

For each `(user, project, date)` group, the system shall generate a 1–2 paragraph professional summary.

### FR-22 Classification

The system shall classify work into one or more tags:

- feature
- fix
- debug
- ops

### FR-23 Time Estimation

The AI shall estimate hours per user-project-day based on activity complexity and volume.

### FR-24 Confidence Score

The system should store AI confidence scores where available.

### FR-25 Non-Destructive AI

The system shall never overwrite manual time adjustments with newly generated AI estimates.

---

## 8.8 Manual Time Adjustment

### FR-26 Editable Hours

Users/admins shall be able to edit AI-estimated hours.

### FR-27 Source of Truth

Final report hours shall use:
`adjusted_hours ?? ai_estimated_hours`

### FR-28 Audit Log

The system should store time adjustment history including:

- previous value
- new value
- optional reason
- updated by
- updated at

---

## 8.9 Scheduling and Reporting

### FR-29 Ingestion Schedules

The system shall support scheduled ingestion jobs for pull-based plugins.

### FR-30 Daily Processing Schedule

The system shall run pre-report AI processing before the report deadline.

### FR-31 Daily Report Schedule

The system shall generate final daily reports at **20:00** each day.

### FR-32 Recompute

The system shall support recomputing summaries for a specific user, project, and date.

---

## 8.10 Admin and Management UI

### FR-33 Admin Dashboard

The system shall provide an admin page to manage:

- users
- identity mappings
- projects
- git repositories
- Discord webhooks
- Plane configurations
- custom plugins

### FR-34 Debug Visibility

The system shall provide visibility into:

- raw events
- normalized events
- work units
- summaries
- mapping confidence
- unmapped identities

---

## 9. Non-Functional Requirements

### NFR-1 Architecture

The system shall be implemented as a **single Rust service** with clear internal modules.

### NFR-2 Tech Stack

Frontend:

- React
- Tailwind CSS
- shadcn/ui

Backend:

- Rust
- Axum

Database:

- SurrealDB

Deployment:

- Docker

### NFR-3 Extensibility

The architecture must allow future data sources without major changes to the core system.

### NFR-4 Reliability

Webhook ingestion and scheduled syncs must be idempotent and resilient to retries.

### NFR-5 Observability

The system should log:

- ingestion runs
- sync cursors
- mapping failures
- AI generation outcomes
- recompute jobs

### NFR-6 Explainability

The system should allow admins to trace summaries back to underlying work units and events.

### NFR-7 Recomputability

Work units and summaries should be recomputable as algorithms improve.

---

## 10. High-Level Architecture

```text
Plugins
 ├── Git
 ├── Plane
 ├── Discord
 └── Custom Plugins
        ↓
Plugin Interface / SDK
        ↓
Raw Event Store
        ↓
Identity Resolver
        ↓
Normalized Events
        ↓
Feature Extraction
        ↓
Session Split
        ↓
Cross-Source Clustering
        ↓
Work Units
        ↓
AI Summarization + Hour Estimation
        ↓
Daily Reports
        ↓
Admin/UI/API
```

---

## 11. Plugin Architecture

### Principle

All sources, including Git, Plane, and Discord, are treated as plugins.

### Plugin Responsibilities

Each plugin must:

1. fetch or receive data
2. transform data into standard event format
3. emit normalized events
4. maintain sync cursor if pull-based

### Plugin Types

#### Pull-Based Plugins

- Git
- Plane
- future REST/API systems

#### Push-Based Plugins

- Discord
- future webhook-driven systems

### Standard Event Contract

Each plugin should emit data in a shape conceptually equivalent to:

```json
{
    "source": "github",
    "external_id": "unique-source-id",
    "type": "commit | message | issue | pr",
    "user": {
        "external_id": "source-user-id",
        "email": "optional@email.com",
        "username": "optional_username"
    },
    "project": "source-project-ref",
    "timestamp": "2026-04-29T10:00:00Z",
    "content": {
        "title": "event title",
        "body": "event body",
        "metadata": {}
    }
}
```

---

## 12. Data Model

## 12.1 Users

```text
user
- id
- name
- primary_email
- is_active
```

## 12.2 User Identities

```text
user_identity
- id
- user_id
- provider
- external_id
- email
- username
- confidence
- verified
- created_at
```

## 12.3 Projects

```text
project
- id
- name
- github_repos[] / git_repos[]
- plane_project_ids[]
```

## 12.4 Raw Events

```text
event_raw
- id
- source
- external_id
- payload
- timestamp
```

## 12.5 Normalized Events

```text
event
- id
- user_id
- project_id
- source
- type
- title
- description
- metadata
- timestamp
```

## 12.6 Event Features

```text
event_features
- event_id
- keywords
- issue_ids
- file_paths
- type_weight
```

## 12.7 Sessions

```text
session
- id
- user_id
- project_id
- start_time
- end_time
```

## 12.8 Work Units

```text
work_unit
- id
- session_id
- user_id
- project_id
- start_time
- end_time
- topic
- tags
- confidence_score
```

## 12.9 Work Unit Events

```text
work_unit_events
- work_unit_id
- event_id
```

## 12.10 Daily Reports / Summaries

```text
daily_report
- id
- date
- user_id
- project_id
- summary_text
- tags[]
- ai_estimated_hours
- adjusted_hours
- confidence_score
- version
- created_at
- updated_at
```

## 12.11 Time Adjustment Log

```text
time_adjustment
- id
- report_id
- old_value
- new_value
- reason
- updated_by
- updated_at
```

---

## 13. Identity Mapping Rules

### Auto-Match Priority

1. exact primary email match
2. exact known external identity match
3. known email in identity table
4. heuristic username/display-name similarity
5. unknown/unmapped identity

### Admin Review

Low-confidence matches must require admin review.

### Unmapped Identities

Unmapped identities must be stored for later manual linking.

---

## 14. Git Processing Strategy

### Git Sync

- clone once
- fetch incrementally
- parse commits since last cursor

### Extracted Git Fields

- author name
- author email
- timestamp
- commit message
- changed files
- additions/deletions

### Git Preprocessing

Before AI, the system should:

- filter noise
- classify commit type
- infer scope/module
- group commits into work blocks

### Design Principle

The pipeline is not:
`git -> AI`

It is:
`git -> clean work narrative -> AI`

---

## 15. Cross-Source Merging Strategy

### Core Principle

Do not merge by time alone. Merge by **intent + context**.

### Merge Signals

- issue ID match
- keyword overlap
- file/module references
- temporal proximity
- shared project mapping

### Output

Merged output becomes **work units**, which are the main input to AI summarization.

### Guardrails

- avoid over-merging
- prefer small coherent stories
- keep unrelated items separate
- filter low-signal Discord chatter during summarization stage if needed

---

## 16. AI Requirements

### AI Role

The AI acts like a senior engineering manager reviewing a developer’s day.

### AI Inputs

- grouped work units
- event counts
- files changed
- lines added/removed
- active timespan
- Plane updates
- Discord context
- project and user identity

### AI Outputs

Strict structured output should include:

- summary
- tags
- estimated_hours
- confidence

### Prompt Goals

The AI should:

- write clearly and concretely
- avoid raw commit repetition
- infer technical intent
- be conservative in time estimation
- produce professional manager-facing summaries

---

## 17. API Requirements

## Core Endpoints

### GET `/summary`

Fetch daily summary by user, project, and date.

### GET `/work-units`

Debug endpoint showing clustered work units and their underlying events.

### POST `/recompute`

Trigger regeneration of summary/work units for a given user, project, and date.

### Additional Recommended Admin Endpoints

- CRUD users
- CRUD projects
- manage identity mappings
- list unmapped identities
- CRUD repositories
- CRUD plugin configs
- webhook endpoints
- ingestion status / sync history

---

## 18. User Experience Requirements

### Admin Experience

Admins must be able to:

- configure integrations
- map users and projects
- inspect unmatched identities
- inspect work units and summaries
- rerun ingestion/recompute jobs

### User Experience

Users should be able to:

- view their daily summaries
- see project-separated work
- review AI-estimated hours
- adjust hours manually

---

## 19. Risks and Mitigations

### Risk 1: Incorrect Identity Mapping

**Impact:** wrong person gets credit  
**Mitigation:** confidence scoring, manual review, unmapped queue

### Risk 2: Over-Merging Activities

**Impact:** vague bad summaries  
**Mitigation:** conservative clustering, debug work-unit inspection

### Risk 3: Poor Commit Quality

**Impact:** weak summaries  
**Mitigation:** commit enrichment and cross-source context

### Risk 4: Discord Noise

**Impact:** polluted summaries  
**Mitigation:** keep mapped users only, filter low-signal content during processing

### Risk 5: AI Overestimates Time

**Impact:** inaccurate reporting  
**Mitigation:** conservative prompts, manual overrides, audit trail

---

## 20. MVP Definition

The MVP should include:

### Integrations

- Git plugin
- Plane plugin
- Discord webhook plugin

### Core Capabilities

- user mapping
- project mapping
- raw and normalized event storage
- work-unit generation
- AI summary generation
- AI hour estimation
- manual hour adjustment
- 20:00 daily report generation
- admin UI for basic management

### Nice-to-Have but Can Wait

- advanced heuristic matching
- plugin SDK externalization
- multiple summary styles
- sophisticated analytics dashboards

---

## 21. Future Enhancements

- GitHub API enrichment for PRs/reviews/comments
- Jira/Slack/Linear plugins
- project-level dashboards
- timesheet approval flow
- confidence heatmaps
- summary quality evaluation loop
- prompt version comparison
- model selection per team/org
- anomaly detection for suspicious or missing work signals

---

## 22. Open Questions

These should be finalized before implementation:

1. What timezone should define the 20:00 report cutoff for multi-region teams?
2. Should users be allowed to edit summaries or only hours?
3. Should Discord DMs be supported or only specific channels/webhooks?
4. Should project mapping allow one event to map to multiple projects?
5. What retention policy should apply to raw Discord message content?
6. Which AI model/provider will be used first: local Ollama, OpenAI, or configurable?

---

## 23. Recommended Build Order

### Phase 1

- data model
- plugin framework
- Git plugin
- identity mapping basics
- project mapping basics

### Phase 2

- Plane plugin
- Discord webhook plugin
- normalized events
- admin mapping UI

### Phase 3

- session splitting
- work unit clustering
- AI summarization
- estimated hours

### Phase 4

- manual adjustment UI
- daily report job
- recompute/debug APIs
- audit logs

---

## 24. Final Product Statement

This product is an **AI-powered engineering activity intelligence and semi-timesheet system** that turns evidence from Git, Plane, Discord, and future tools into trustworthy, project-based daily work reports.

It is not just a tracker. It is:

- an **event collection platform**
- a **cross-source work understanding system**
- and a **manager-readable reporting layer** built on top of actual engineering signals

---

If you want, I can next convert this into either:

1. **a cleaner one-page startup-style PRD**
2. **a technical PRD + architecture spec**
3. **epics and user stories for implementation**
4. **database schema in SurrealDB format**
5. **Axum API spec + route list**
