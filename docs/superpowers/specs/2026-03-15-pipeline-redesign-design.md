# Pipeline Redesign — Design Specification

**Date:** 2026-03-15
**Status:** Approved
**Scope:** Replace 9 pipeline pages with 3-step billing flow + fix parts infrastructure

---

## 1. Problem Statement

The AAS Portal billing pipeline has 9 pages with overlapping functionality, no edit capability, raw HTML previews, broken parts writes, and fragmented parts mapping. Techs and admins lack a clear workflow for processing completed Limble tasks into QuickBooks invoices/estimates.

### Current Pain Points
- **Preview + Review** do the same thing (redundant code)
- **No edit capability** — can't adjust labor, parts, rates, or customer before sending to QB
- **Raw preview** — invoice shown as HTML/JSON, not rendered
- **Splits and estimates** have no preview or insight
- **Parts write to comments** — backend bug writes to task notes, not Limble parts section
- **Parts mapping fragmented** — Google Sheet, Limble, QB use same part numbers but with different column names
- **Pipeline parts page** has wrong column mappings
- **Parts search matching** is poor on the tech Parts Finder page

---

## 2. Architecture

### 2.1 Three-Step Billing Flow

Three pages replace nine. Each page is one step in the billing lifecycle.

| Step | Page | Route | Replaces |
|------|------|-------|----------|
| 1 | **Triage Board** | `/pipeline/triage/` | Preview, Review, Status |
| 2 | **Billing Workbench** | `/pipeline/edit/?task={id}` | Estimates, Preview detail rows |
| 3 | **Ledger** | `/pipeline/ledger/` | Log, Status |

**Navigation flow:** Dashboard → Triage Board → click task → Billing Workbench → approve & send → appears in Ledger

### 2.2 Pages Kept (Config/Admin)

| Page | Route | Changes |
|------|-------|---------|
| Dashboard | `/pipeline/` | Rebuild as launchpad linking to 3 steps + config |
| Customers | `/pipeline/customers/` | No changes — setup/config page |
| Parts Mapping | `/pipeline/parts/` | Fix column mappings, enhance QB search |
| Rates | `/pipeline/rates/` | Wire existing edit buttons |

### 2.3 Pages Deleted

| Page | Route | Reason |
|------|-------|--------|
| Preview | `/pipeline/preview/` | Replaced by Triage Board + Workbench |
| Review | `/pipeline/review/` | Redundant with Preview |
| Estimates | `/pipeline/estimates/` | Replaced by Workbench doc type toggle |
| Log | `/pipeline/log/` | Merged into Ledger |
| Status | `/pipeline/status/` | Merged into Ledger |

### 2.4 Tech Parts Finder

`/tech/parts/` stays as-is structurally — it's a tech reference tool, not billing. Fixes:
- Improve Qdrant search matching (fuzzy MFG#, abbreviation expansion)
- Fix task.id normalization bug
- Parts write goes to Limble parts tab (shared backend fix)

---

## 3. Step 1: Triage Board

### 3.1 Purpose
Quick visual scan of what came through from Limble. Identify what each task is, where it belongs, what's missing, what needs action. Quick-ship clean tasks.

### 3.2 Layout
Kanban-style columns. Each column is a classifier category.

**Columns (left to right):**
1. **Invoice Ready** — clean tasks, all mappings resolved. Can quick-ship directly.
2. **Estimate** — quote-request or needs customer approval first
3. **Split** — multiple visits/techs, needs billing decision per visit
4. **Hold** — waiting on parts, approval, or information
5. **Needs Review** — classifier uncertain, admin must decide
6. **Skip** — already billed, warranty, internal, not billable

### 3.3 Task Cards
Each card shows:
- Task name (truncated)
- Customer name
- Completed date
- Tech name
- Estimated total (if calculable)
- Flags: unmapped parts (amber), unmapped customer (red), multi-visit (blue)

### 3.4 Actions
- **Drag-and-drop** cards between columns to re-categorize (calls `PATCH /pipeline/v2/task/{id}/classify`)
- **Quick-ship** button on Invoice Ready cards → fetches full `task-context`, auto-assembles send payload from defaults (rate tier → rate amount, mapped parts → line items, customer → QB customer), and sends via `POST /pipeline/v2/task/{id}/send`. Only available when task has all mappings resolved (no amber/red flags). If any field can't be auto-resolved, opens Workbench instead.
- **Click card** → opens Billing Workbench (Step 2) with task pre-loaded
- **Sync button** → refreshes from Limble (`POST /pipeline/v2/classify`). Response returns flat task array; frontend filters by `classification` field into Kanban columns (client-side grouping, acceptable for 200 tasks).
- **Column counts** — visible in column headers

### 3.5 API
- `POST /pipeline/v2/classify` — fetch and classify all tasks
- `PATCH /pipeline/v2/task/{id}/classify` — re-categorize single task

---

## 4. Step 2: Billing Workbench

### 4.1 Purpose
Per-task editor. Adjust everything before sending to QB. Live rendered preview updates as you edit. This is where corrections happen and invoices/estimates get approved.

### 4.2 Layout
Split panel:
- **Left:** Editable fields
- **Right:** Rendered invoice/estimate preview (clean, human-readable, AAS-branded — not raw HTML/JSON, not PDF-exact)

### 4.3 Editable Fields

**Doc Type Toggle**
- Switch between Invoice ↔ Estimate (preserves current Needs Review pattern)
- Preview header changes accordingly

**Task Info (read-only context)**
- Task ID, name, completion date, tech name, asset name
- Link to open task in Limble

**Labor**
- Hours — editable numeric input
- Rate — editable dollar amount (pre-filled from rate tier)
- Rate tier — dropdown (Standard, LCMC, Ochsner, Emergency, After Hours, Warranty, Service Charge)
- Changing tier pre-fills rate; rate remains manually adjustable

**Parts**
- List of parts currently on task (from Limble)
- Each part shows: name, quantity, QB mapping status (green=mapped, red=unmapped), QB price
- Remove button per part
- **"+ Add Part" button** → opens inline QB Item search (QB = pricing source of truth)
- When adding from QB search: auto-resolves mapping, price populates
- Unmapped parts show warning badge

**Customer**
- Current customer mapping shown
- If wrong: **"Change Customer"** button → inline QB Customer search
- Resolves customer_map in-place

**Service Notes**
- Textarea for notes that appear on the invoice/estimate
- Pre-filled from Limble task completion notes if available

### 4.4 Invoice Preview (Right Panel)
Clean, human-readable rendered preview. AAS-branded with the portal's design language (sapphire palette, Outfit font, glassmorphism). Not vanilla.

Shows:
- Company header (AAS logo/name/address)
- Bill-to customer
- Date and task reference
- Line items table (description, qty, rate, amount)
- Unmapped parts shown grayed/italicized with "unmapped" note
- Total
- Service notes
- "Draft — Not yet submitted" watermark

**Updates live** as left-panel fields change.

### 4.5 Actions
- **Approve & Send to QB** — creates invoice/estimate in QuickBooks, tags task in Limble (`@Billed` or `@Estimated`), records in documents table. Backend routes to QB invoice or estimate API based on `doc_type` field.
- **Save Draft** — persists edits without sending (can return later). Stores labor, parts, customer, notes, doc_type changes.
- **Hold** — moves task to Hold status with reason (e.g., "waiting on parts from supplier"). Uses classify endpoint with `classification: "hold"` and `reason` field.
- **Re-send (corrections)** — when re-opened from Ledger, sends with `replacing_doc_id` to void original and create new document.

### 4.6 API
- `GET /pipeline/v2/task-context/{id}` — load task with all context (includes classification, labor, customer QB mapping)
- `POST /pipeline/v2/task/{id}/parts` — add parts (shared endpoint, Tech + Admin)
- `PATCH /pipeline/v2/task/{id}/draft` — save draft edits without sending to QB
- `PATCH /pipeline/v2/task/{id}/classify` — hold/re-categorize with reason field
- `GET /api/qb/products?search=` — search QB items for part adds (via qb.mts proxy)
- `GET /api/qb/customers?search=` — search QB customers for customer resolution (via qb.mts proxy)
- `POST /pipeline/v2/task/{id}/send` — approve and send to QB (accepts optional `replacing_doc_id` for corrections)

---

## 5. Step 3: Ledger

### 5.1 Purpose
Post-billing tracking and reporting. What's been billed, what's outstanding, customer breakdowns. Printable. This is the "after" view — holds waiting on parts, estimates pending approval.

### 5.2 Layout

**Summary Stats Bar**
- Billed this month ($)
- Estimates pending ($)
- On hold (count)
- Invoices sent (count)
- Needs follow-up (count)

**Tabs:**
1. **All Documents** — filterable table of all invoices + estimates
2. **On Hold** — tasks waiting on parts or approval
3. **Pending Estimates** — estimates that never got approved
4. **By Customer** — AR summary per customer (total billed, outstanding, open tasks)

**Filters (on All Documents):**
- Search (customer, task, doc #)
- Type (Invoice / Estimate / All)
- Date range (This Month, Last 30 Days, Quarter, Custom)
- Status (Sent, Paid, Overdue, All)

**Table Columns:**
Doc #, Customer, Task, Type, Amount, Date, Status, Edit Flag

### 5.3 Features

**Re-open for Editing**
- Click any document → opens in Billing Workbench (Step 2) for corrections
- After re-send: original voided, new doc created
- Edit-after-send flag tracked with timestamp and note

**Edit Audit Trail**
- Documents modified after being sent show amber flag
- Hover/click flag shows: who edited, when, what changed

**Customer Breakdown (By Customer tab)**
- Per customer: total billed, pending estimates, holds, invoices sent/paid, last invoice date
- QB handles AR aging and email open tracking — don't duplicate

**Export**
- CSV export of filtered results for accounting
- Print-friendly view for reports

**Aging**
- Focus on portal-side: how long holds and estimates have been sitting
- 30/60/90 day buckets for follow-up prioritization
- QB handles AR aging separately

**"Needs Follow-Up" Definition**
- Estimates older than 30 days that haven't been approved or converted
- Holds older than 14 days that haven't been resolved
- Combined count shown in summary stats bar

### 5.4 API
- `GET /pipeline/v2/ledger` — documents with filters, pagination, summary stats
- `GET /pipeline/v2/ledger/by-customer` — AR summary per customer

---

## 6. Parts Strategy

### 6.1 Core Principle
The same physical parts exist across Google Sheet, Limble, and QuickBooks — they're just labeled differently. Part numbers (3-4 digit Addison #, MFG#) are real and shared. The `part_map` table bridges these naming differences.

| System | Part # Field | Description Field | Price |
|--------|-------------|-------------------|-------|
| Google Sheet | `key` (Addison/AAS #) | `description` | — |
| Limble | Part name | Part name | — |
| QuickBooks | SKU or item name | Item description | Unit price |

### 6.2 Three Consumers, One Write Endpoint

All parts writes go through `POST /pipeline/v2/task/{id}/parts` on the droplet.

| Consumer | Search Source | Write Destination | Who |
|----------|-------------|-------------------|-----|
| Parts Finder (`/tech/parts/`) | Qdrant `/search-parts` | Limble parts tab | Tech + Admin |
| Billing Workbench (`/pipeline/edit/`) | QB Items API | Limble parts tab + QB invoice | Admin |
| Copilot | Qdrant `search_parts` tool | Limble parts tab (future) | Tech + Admin |

### 6.3 Google Sheet as Catalog
- Sheet is the AAS parts catalog — manually maintained
- New parts added manually: find part, get photo, add to sheet
- Sheet has a simple ingestion scheme for mass import
- Qdrant `parts_v1` collection indexes the sheet for semantic search
- Sheet grows over time as QB/Limble parts are identified and cataloged
- **No automated sync** — manual additions only

### 6.4 Fixes Required
- **Backend:** Fix parts write from comments to Limble parts API (critical blocker)
- **Backend:** Improve Qdrant `/search-parts` matching (fuzzy MFG#, abbreviation expansion)
- **Frontend:** Fix `/pipeline/parts/` column mappings
- **Database:** Add `aas_catalog_key` column to `part_map` for cross-reference

---

## 7. Permissions

**Pipeline is 100% admin.** Tech has zero access to any pipeline page (triage, workbench, ledger, dashboard, customers, parts mapping, rates). Tech tools are Parts Finder, Manuals, and Copilot.

| Action | Admin | Tech | Customer |
|--------|-------|------|----------|
| All pipeline pages (triage, workbench, ledger, config) | Yes | **No** | No |
| Parts Finder — search parts catalog | Yes | Yes | No |
| Parts Finder — add parts to Limble task | Yes | Yes | No |
| Tech Manuals | Yes | Yes | No |
| Copilot — parts lookup, manuals, troubleshooting | Yes | Yes | No |
| Copilot — customer portal usage | Yes | No | Yes |
| Manage part_map / customer_map / rates | Yes | No | No |

---

## 8. Design Language

**Opposite of vanilla.** Full AAS design treatment on all pipeline pages.

- **Fonts:** Outfit (display/headings), Plus Jakarta Sans (body)
- **Palette:** Sapphire #4f8cff / #6366f1, dark-first with `body.light-theme` overrides
- **Surface:** Glassmorphism — `blur(24px) saturate(180%)` dark, `blur(12px) saturate(120%)` light
- **Cards:** `.glass-card` with backdrop-filter, subtle borders
- **Status colors:** Green (#34d399) success/mapped, Amber (#f59e0b) warning/pending, Red (#ef4444) error/unmapped, Blue (#4f8cff) info/active
- **CSS namespacing:** New container IDs and variable prefixes:
  - `#pipelineDashboard` with `--pd-*` prefix (rebuilt launchpad)
  - `#triageBoard` with `--tb-*` prefix
  - `#billingWorkbench` with `--bw-*` prefix
  - `#billingLedger` with `--bl-*` prefix
- **Responsive:** Dark + light theme. Mobile-aware but desktop-primary (billing is a desktop task)
- **Invoice preview:** AAS-branded clean format. Not PDF-exact, not vanilla. Styled within the design system.

---

## 9. Backend Contract

Full endpoint specifications with request/response JSON schemas are in:
**`docs/DROPLET-PIPELINE-CONTRACT.md`**

### 9.1 Summary

| # | Endpoint | Type | Priority |
|---|----------|------|----------|
| 1 | `POST /pipeline/v2/task/{id}/parts` | Fix bug | Critical |
| 2 | `GET /pipeline/v2/task-context/{id}` | Enhance (add classification, labor, customer QB, draft) | High |
| 3 | `GET /api/qb/products?search=` | Verify (via qb.mts) | High |
| 4 | `POST /pipeline/v2/classify` | New | High |
| 5 | `PATCH /pipeline/v2/task/{id}/classify` | New (with reason) | High |
| 5b | `PATCH /pipeline/v2/task/{id}/draft` | New | High |
| 6 | `POST /pipeline/v2/task/{id}/send` | New (with replacing_doc_id) | High |
| 7 | `GET /pipeline/v2/ledger` | New | Medium |
| 8 | `GET /pipeline/v2/ledger/by-customer` | New | Medium |
| 9 | `POST /search-parts` | Improve | Medium |
| — | `GET /api/qb/customers?search=` | Exists (via qb.mts, no droplet work) | — |

### 9.2 Database Changes
- `part_map`: Add `aas_catalog_key VARCHAR(100)` column
- `documents`: Add `edited_after_send BOOLEAN`, `edit_history JSONB` columns

### 9.3 Critical Blocker
The Limble parts write bug fix (endpoint #1) blocks all parts functionality across Parts Finder, Workbench, and Copilot. Must be fixed first.

---

## 10. What's NOT in Scope

- Automated Google Sheet ↔ QB parts sync (manual process)
- PDF invoice attachment redesign (preserve existing)
- Copilot `write_parts_to_task` tool (future phase)
- Droplet firewall or security hardening
- Customer portal changes
- New Qdrant collections or embeddings changes
- AR aging report (QB handles this)
- Email open tracking (QB handles this)

---

## 11. Migration Plan

### 11.1 Page Transitions
Old pages remain accessible during build. Once new pages are verified:
1. Update nav links across all portal pages (currently 16 files reference pipeline)
2. Add new routes to `netlify.toml` for `/pipeline/triage/`, `/pipeline/edit/`, `/pipeline/ledger/`
3. Add redirects in `netlify.toml`:
   - `/pipeline/preview/` → `/pipeline/triage/`
   - `/pipeline/review/` → `/pipeline/triage/`
   - `/pipeline/estimates/` → `/pipeline/edit/`
   - `/pipeline/log/` → `/pipeline/ledger/`
   - `/pipeline/status/` → `/pipeline/ledger/`
4. Delete old page files after redirect period

### 11.4 Prerequisite Fix: qb.mts Role Normalization
`qb.mts` checks `roles.includes("Admin")` with capital A but `auth.js` now normalizes roles to lowercase. The Workbench calls QB endpoints via `qb.mts` for product/customer search. **Fix qb.mts to normalize roles to lowercase** (same pattern as pipeline.mts) before building the Workbench. Without this, QB search will return 403 for all users.

### 11.2 Build Sequence (Frontend)
1. Triage Board (depends on classify endpoint)
2. Billing Workbench (depends on task-context enhancement + send endpoint)
3. Ledger (depends on ledger endpoints)
4. Dashboard rebuild (links to new pages)
5. Delete old pages + add redirects

### 11.3 Build Sequence (Backend)
See `docs/DROPLET-PIPELINE-CONTRACT.md` execution order (9 steps).

---

## 12. Success Criteria

- [ ] Admin can see all incoming tasks categorized on Triage Board
- [ ] Admin can drag tasks between categories
- [ ] Admin can quick-ship clean invoices from Triage Board
- [ ] Admin can open any task in Workbench and edit labor, parts, rate, customer, notes
- [ ] Invoice/estimate preview renders cleanly (not raw HTML)
- [ ] Preview updates live as fields are edited
- [ ] Admin can approve and send to QB from Workbench
- [ ] Parts added from Workbench resolve to QB items with pricing
- [ ] Parts write to Limble parts tab (not comments)
- [ ] Ledger shows all billed documents with filters
- [ ] Ledger "By Customer" shows AR summary
- [ ] Ledger supports CSV export and print
- [ ] Documents edited after send are flagged with audit trail
- [ ] Holds and pending estimates visible with aging
- [ ] Admin can re-open a sent document for correction
- [ ] Parts Finder search matching is improved
- [ ] Pipeline parts mapping page has correct columns
- [ ] All new pages use AAS design language (not vanilla)
- [ ] Dark + light theme support
- [ ] Save Draft persists edits without sending to QB
- [ ] Hold action moves task with reason text
- [ ] Quick-ship only available on fully-mapped Invoice Ready tasks
- [ ] qb.mts role normalization fixed (lowercase)
- [ ] "Needs follow-up" count defined: estimates older than 30 days + holds older than 14 days
- [ ] Old pages redirect to new equivalents
