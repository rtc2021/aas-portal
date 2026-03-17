# Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 9 pipeline pages with a 3-step billing flow (Triage Board, Billing Workbench, Ledger) with proper parts mapping, rendered invoice preview, and full edit capability.

**Architecture:** Three new HTML pages consume backend API endpoints defined in `docs/DROPLET-PIPELINE-CONTRACT.md`. Each page uses the portal's existing auth pattern (`window.onPageReady`), snippet-injected CSS/JS (tokens.css, nav.css, auth.js, theme.js, copilot.js), and the AAS design system (Outfit/Plus Jakarta Sans, sapphire palette, glassmorphism). Pipeline proxy (`pipeline.mts`) handles RBAC — all pipeline pages are admin-only.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step for pages), Netlify snippet injection, Auth0 SPA, existing pipeline.mts proxy to droplet backend.

**Spec:** `docs/superpowers/specs/2026-03-15-pipeline-redesign-design.md`
**Backend Contract:** `docs/DROPLET-PIPELINE-CONTRACT.md`

**XSS Safety Note:** All dynamic content rendering MUST use DOM API methods (createElement, textContent, appendChild). The only exception is the invoice preview panel which renders controlled data from API responses — use a dedicated buildPreviewDOM() function that constructs elements safely. Never set element content from user input without sanitization.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `portal/pipeline/triage/index.html` | Step 1: Kanban triage board — classify, drag, quick-ship |
| `portal/pipeline/edit/index.html` | Step 2: Billing workbench — edit task, preview invoice, send to QB |
| `portal/pipeline/ledger/index.html` | Step 3: Ledger — post-billing tracking, holds, exports |

### Modified Files
| File | Change |
|------|--------|
| `netlify/functions/qb.mts:126` | Fix `"Admin"` to `"admin"` role check |
| `netlify/functions/pipeline.mts:117-122` | Verify PATCH method in CORS headers |
| `netlify.toml:166-212` | Add 3 new routes, change 5 redirects for deleted pages |
| `portal/pipeline/index.html` | Rebuild as launchpad linking to 3 steps + config |
| 16 files with nav panels | Update nav links (remove old pipeline links, add new) |

### Deleted Files (after redirects verified)
| File | Redirect To |
|------|-------------|
| `portal/pipeline/preview/index.html` | `/pipeline/triage/` |
| `portal/pipeline/review/index.html` | `/pipeline/triage/` |
| `portal/pipeline/estimates/index.html` | `/pipeline/edit/` |
| `portal/pipeline/log/index.html` | `/pipeline/ledger/` |
| `portal/pipeline/status/index.html` | `/pipeline/ledger/` |

---

## Chunk 1: Prerequisites & Foundation

### Task 1: Fix qb.mts Role Normalization Bug

**Files:**
- Modify: `netlify/functions/qb.mts:41,126`

**Context:** Auth0 roles are normalized to lowercase in `auth.js`, `pipeline.mts` (line 30), and `copilot.mts`. But `qb.mts` has two problems: (1) `getRolesFromToken()` at line 41 returns raw Auth0 roles without lowercasing, and (2) `requiresAdmin()` at line 126 checks for capital `"Admin"`. Fix the root cause, not just the symptom.

- [ ] **Step 1: Read current qb.mts to confirm both locations**

Read `netlify/functions/qb.mts`. Find `getRolesFromToken()` (line ~41) and the role check (line ~126).

- [ ] **Step 2: Fix getRolesFromToken to normalize roles (ROOT CAUSE)**

At line 41, change:
```typescript
return payload[`${namespace}/roles`] || [];
```
to:
```typescript
const rawRoles: string[] = payload[`${namespace}/roles`] || [];
return rawRoles.map((r: string) => r.toLowerCase());
```

This matches the pattern already used in `pipeline.mts` line 30.

- [ ] **Step 3: Fix the role comparison**

At line 126, change `"Admin"` to `"admin"` (now matches normalized output).

- [ ] **Step 4: Verify no other capital role checks exist in qb.mts**

Search for any other `"Admin"`, `"Tech"`, `"Customer"` string literals. Fix any found.

- [ ] **Step 5: Commit**

```bash
git checkout -b pipeline-redesign
git add netlify/functions/qb.mts
git commit -m "fix: qb.mts role normalization — lowercase like pipeline.mts"
```

---

### Task 2: Verify Pipeline Proxy Supports PATCH Method

**Files:**
- Modify (if needed): `netlify/functions/pipeline.mts`

**Context:** New endpoints use PATCH method (draft, classify). Pipeline proxy CORS headers must include PATCH.

- [ ] **Step 1: Read pipeline.mts CORS headers**

Find the `access-control-allow-methods` header value.

- [ ] **Step 2: Confirm PATCH is included**

If the header already includes `PATCH`, no change needed. If not, add it.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add netlify/functions/pipeline.mts
git commit -m "fix: ensure pipeline proxy CORS allows PATCH method"
```

---

### Task 3: Add Netlify Routes for New Pages

**Files:**
- Modify: `netlify.toml:166-212`

- [ ] **Step 1: Read current netlify.toml pipeline section**

Read `netlify.toml` starting from line 166 to see the current redirect/rewrite pattern.

- [ ] **Step 2: Add new page routes BEFORE the old ones**

Add these routes in the pipeline section:
```toml
[[redirects]]
  from = "/pipeline/triage"
  to = "/pipeline/triage/index.html"
  status = 200

[[redirects]]
  from = "/pipeline/triage/*"
  to = "/pipeline/triage/index.html"
  status = 200

[[redirects]]
  from = "/pipeline/edit"
  to = "/pipeline/edit/index.html"
  status = 200

[[redirects]]
  from = "/pipeline/edit/*"
  to = "/pipeline/edit/index.html"
  status = 200

[[redirects]]
  from = "/pipeline/ledger"
  to = "/pipeline/ledger/index.html"
  status = 200

[[redirects]]
  from = "/pipeline/ledger/*"
  to = "/pipeline/ledger/index.html"
  status = 200
```

- [ ] **Step 3: Do NOT delete old routes yet**

Old pages stay accessible during build. Redirects come in Task 20.

- [ ] **Step 4: Commit**

```bash
git add netlify.toml
git commit -m "feat: add netlify routes for triage, edit, ledger pages"
```

---

## Chunk 2: Triage Board

### Task 4: Create Triage Board Page Shell

**Files:**
- Create: `portal/pipeline/triage/index.html`

**Context:** Follow the exact same HTML structure as existing pipeline pages. Use `portal/pipeline/index.html` as template for the shell (DOCTYPE, head, meta, snippet injection points, auth overlay, nav panel, floating user, page content container).

- [ ] **Step 1: Create directory**

```bash
mkdir -p portal/pipeline/triage
```

- [ ] **Step 2: Read portal/pipeline/index.html for the page shell template**

Copy the HTML structure: DOCTYPE, head, meta, auth overlay, nav panel, floating user.

- [ ] **Step 3: Write triage/index.html with page shell**

Requirements:
- Title: "AAS Pipeline — Triage Board"
- NO hardcoded script/link tags for auth.js/theme.js/copilot.js/tokens.css/nav.css (snippet-injected)
- `#authOverlay` div (standard auth pattern)
- Nav panel (copy from existing pipeline page, update links per Task 18 pattern)
- Floating user pill
- `#pageContent` wrapper with `data-admin-only` attribute
- `#triageBoard` container inside pageContent
- `window.onPageReady` checks `roles.includes('admin')`, redirects non-admins to `/tech/parts/`

- [ ] **Step 4: Add page-level CSS**

CSS custom properties under `#triageBoard` with `--tb-` prefix:
- Kanban layout: `.tb-board` with `display: flex; gap: 16px; overflow-x: auto;`
- Column: `.tb-column` with glassmorphism surface, min-width 240px
- Column header: `.tb-column-header` with count badge
- Card: `.tb-card` with glass-card styling, hover state, cursor pointer
- Card meta, flags, quick-ship button styles
- Summary bar, sync button
- `body.light-theme` overrides for all elements
- AAS design system: sapphire accents, Outfit headings, glassmorphism

- [ ] **Step 5: Commit**

```bash
git add portal/pipeline/triage/index.html
git commit -m "feat: triage board page shell with auth and Kanban CSS"
```

---

### Task 5: Triage Board — Data Loading & Card Rendering

**Files:**
- Modify: `portal/pipeline/triage/index.html`

**Context:** Calls `POST /api/pipeline/v2/classify` to get classified tasks. Renders cards in Kanban columns. All DOM content built with createElement/textContent (XSS-safe).

- [ ] **Step 1: Add syncAndClassify function**

Calls `/api/pipeline/v2/classify` with POST, body `{ limit: 200, offset: 0, force_refresh: false }`. Shows loading state on sync button.

- [ ] **Step 2: Add renderBoard function**

Updates column counts from `data.counts`. Filters `data.tasks` by `classification` field. Clears each column container and populates with cards.

- [ ] **Step 3: Add buildCard function (DOM API only)**

Builds each card with:
- Task name (textContent)
- Customer + date row
- Tech + total row
- Flag badges (unmapped parts=amber, unmapped customer=red, multi-visit=blue)
- Quick-ship button on invoice-ready cards with no flags
- Click handler → navigates to `/pipeline/edit/?task={id}`
- `draggable="true"` attribute and `data-task-id` attribute

- [ ] **Step 4: Add HTML structure for board columns**

6 column divs in `#triageBoard`, each with `data-classification` attribute and card container ID (`tbCards_invoice`, etc).

- [ ] **Step 5: Wire onPageReady to auto-load**

```javascript
window.onPageReady = function(user, roles) {
  if (!roles.includes('admin')) { window.location.href = '/tech/parts/'; return; }
  document.getElementById('pageContent').classList.remove('hidden');
  syncAndClassify();
};
```

- [ ] **Step 6: Commit**

```bash
git add portal/pipeline/triage/index.html
git commit -m "feat: triage board data loading and card rendering"
```

---

### Task 6: Triage Board — Drag-and-Drop Re-categorize

**Files:**
- Modify: `portal/pipeline/triage/index.html`

- [ ] **Step 1: Add drag event handlers**

Setup dragover/dragleave/drop on column bodies. dragstart on cards sets task ID in dataTransfer.

- [ ] **Step 2: Add reclassifyTask function**

Calls `PATCH /api/pipeline/v2/task/{id}/classify` with `{ classification, reason: 'admin_override' }`. On success, moves card DOM element to target column and updates counts.

- [ ] **Step 3: Add CSS for drag states**

`.tb-card[draggable]:active { opacity: 0.4; }` and `.tb-column-body.tb-drop-target { border: 2px dashed rgba(79,140,255,0.3); }`

- [ ] **Step 4: Call setupDragDrop() in onPageReady**

- [ ] **Step 5: Commit**

```bash
git add portal/pipeline/triage/index.html
git commit -m "feat: triage board drag-and-drop re-categorize"
```

---

### Task 7: Triage Board — Quick Ship

**Files:**
- Modify: `portal/pipeline/triage/index.html`

- [ ] **Step 1: Add quickShip function**

1. Confirm with user
2. Fetch task-context: `GET /api/pipeline/v2/task-context/{id}`
3. Check all mappings resolved (customer QB ID exists, no unmapped parts)
4. If any unresolvable → redirect to workbench
5. Auto-assemble send payload from context defaults
6. Call `POST /api/pipeline/v2/task/{id}/send`
7. Show success with QB doc ID
8. Remove card from board

- [ ] **Step 2: Commit**

```bash
git add portal/pipeline/triage/index.html
git commit -m "feat: triage board quick-ship for clean invoices"
```

---

## Chunk 3: Billing Workbench

### Task 8: Create Workbench Page Shell

**Files:**
- Create: `portal/pipeline/edit/index.html`

- [ ] **Step 1: Create directory and write page shell**

```bash
mkdir -p portal/pipeline/edit
```

Same HTML shell as triage (auth, nav, floating user). Container `#billingWorkbench` with `--bw-*` prefix.

- [ ] **Step 2: Add split-panel CSS**

`.bw-split` with `display: grid; grid-template-columns: 1fr 1fr; gap: 24px;`. Left = `.bw-editor`, Right = `.bw-preview`. Task info bar at top. Action bar at bottom. Responsive: stack vertically on narrow screens. AAS design system throughout.

- [ ] **Step 3: Add onPageReady with task loading from URL param**

Read `?task=` from URL, call `loadTask(taskId)`.

- [ ] **Step 4: Commit**

```bash
git add portal/pipeline/edit/index.html
git commit -m "feat: billing workbench page shell with split-panel layout"
```

---

### Task 9: Workbench — Load Task Context & Populate Fields

**Files:**
- Modify: `portal/pipeline/edit/index.html`

- [ ] **Step 1: Add loadTask function**

Fetches `/api/pipeline/v2/task-context/{id}`, normalizes task.id, stores in `window._task`, calls `populateFields()` and `renderPreview()`.

- [ ] **Step 2: Add form field HTML**

In `.bw-editor`:
- Doc type toggle (Invoice/Estimate radio buttons)
- Labor hours input
- Labor rate input (dollar amount, pre-filled from tier)
- Rate tier dropdown (Standard, LCMC, Ochsner, Emergency, After Hours, Warranty, Service Charge)
- Parts list container
- Customer display with change button
- Notes textarea
- All inputs call `renderPreview()` on change

- [ ] **Step 3: Add populateFields function**

Fills all form fields from task-context response data.

- [ ] **Step 4: Commit**

```bash
git add portal/pipeline/edit/index.html
git commit -m "feat: workbench task loading and field population"
```

---

### Task 10: Workbench — Parts Management

**Files:**
- Modify: `portal/pipeline/edit/index.html`

- [ ] **Step 1: Add parts list rendering**

Render parts_on_task as list with name, qty, QB status badge, price, remove button. DOM API only.

- [ ] **Step 2: Add QB product search for adding parts**

`searchQBProducts(query)` calls `GET /api/qb/products?search=`. Shows results as clickable rows. On click, adds to parts array and re-renders.

- [ ] **Step 3: Add removePart and inline search UI**

- [ ] **Step 4: Commit**

```bash
git add portal/pipeline/edit/index.html
git commit -m "feat: workbench parts management with QB item search"
```

---

### Task 11: Workbench — Customer Resolution

**Files:**
- Modify: `portal/pipeline/edit/index.html`

- [ ] **Step 1: Show customer mapping status and "Change Customer" button**

- [ ] **Step 2: Add QB customer search function**

`searchQBCustomers(query)` calls `GET /api/qb/customers?search=`. Shows results, click to select.

- [ ] **Step 3: Wire customer change to preview update**

- [ ] **Step 4: Commit**

```bash
git add portal/pipeline/edit/index.html
git commit -m "feat: workbench customer resolution with QB search"
```

---

### Task 12: Workbench — Rendered Invoice Preview

**Files:**
- Modify: `portal/pipeline/edit/index.html`

**Context:** Clean, AAS-branded preview. NOT vanilla. NOT raw HTML/JSON. Built entirely with DOM API from controlled API data.

- [ ] **Step 1: Add renderPreview function**

`renderPreview()` reads all current form values + parts array + customer info. Builds a preview DOM tree using createElement/textContent exclusively:
- White background container (document-like appearance)
- Company header (AAS name, address)
- "INVOICE" or "ESTIMATE" label based on doc type toggle
- Bill-to section (customer name)
- Date and task reference
- Line items table (description, qty, rate, amount) — labor row + part rows
- Unmapped parts shown in muted style with "unmapped" note
- Totals row
- Service notes section
- "DRAFT" watermark

- [ ] **Step 2: Add preview CSS**

White background even in dark mode (it's a document). Professional typography. AAS branding colors for accents. Clean table styling.

- [ ] **Step 3: Verify live update**

Changing any field re-renders preview immediately.

- [ ] **Step 4: Commit**

```bash
git add portal/pipeline/edit/index.html
git commit -m "feat: workbench rendered invoice preview with live updates"
```

---

### Task 13: Workbench — Send, Draft, Hold Actions

**Files:**
- Modify: `portal/pipeline/edit/index.html`

- [ ] **Step 1: Add sendToQB function**

Collects edited fields, builds send payload, calls `POST /api/pipeline/v2/task/{id}/send`. Confirmation dialog before sending. Supports `replacing_doc_id` from URL param for corrections.

- [ ] **Step 2: Add saveDraft function**

Calls `PATCH /api/pipeline/v2/task/{id}/draft`. Shows success feedback.

- [ ] **Step 3: Add holdTask function**

Prompts for reason text, calls `PATCH /api/pipeline/v2/task/{id}/classify` with `classification: "hold"` and reason.

- [ ] **Step 4: Wire action buttons in HTML**

Three buttons: Approve & Send (primary green), Save Draft (secondary), Hold (muted).

- [ ] **Step 5: Commit**

```bash
git add portal/pipeline/edit/index.html
git commit -m "feat: workbench send, draft, and hold actions"
```

---

## Chunk 4: Ledger

### Task 14: Create Ledger Page Shell

**Files:**
- Create: `portal/pipeline/ledger/index.html`

- [ ] **Step 1: Create directory and write page shell**

```bash
mkdir -p portal/pipeline/ledger
```

Container `#billingLedger` with `--bl-*` prefix. Layout: summary stats bar, tab bar, filter bar, data table, pagination, print/export toolbar.

- [ ] **Step 2: Add all CSS**

Glass cards for stats, tabbed interface, table with hover rows, status badges (color-coded), filter bar styling, `@media print` rules, `body.light-theme` overrides. AAS design system.

- [ ] **Step 3: Commit**

```bash
git add portal/pipeline/ledger/index.html
git commit -m "feat: ledger page shell with stats, tabs, filters CSS"
```

---

### Task 15: Ledger — Data Loading & Document Table

**Files:**
- Modify: `portal/pipeline/ledger/index.html`

- [ ] **Step 1: Add loadLedger function**

Calls `GET /api/pipeline/v2/ledger` with filter query params. Renders summary stats, document rows, pagination.

- [ ] **Step 2: Add renderDocuments (DOM API)**

Table rows: doc #, customer, task, type badge, amount, date, status badge, edit flag. Click row opens workbench with `?task={id}&replacing={doc_id}`.

- [ ] **Step 3: Add filter handlers**

Search, type, date range, status dropdowns trigger reload.

- [ ] **Step 4: Commit**

```bash
git add portal/pipeline/ledger/index.html
git commit -m "feat: ledger document table with filters"
```

---

### Task 16: Ledger — By Customer Tab & Features

**Files:**
- Modify: `portal/pipeline/ledger/index.html`

- [ ] **Step 1: Add loadByCustomer function**

Calls `GET /api/pipeline/v2/ledger/by-customer`. Renders customer summary table.

- [ ] **Step 2: Add tab switching logic**

- [ ] **Step 3: Add CSV export function**

Builds CSV from visible data, creates download link.

- [ ] **Step 4: Add print button and @media print CSS**

- [ ] **Step 5: Add edit audit trail display**

Amber flag on `edited_after_send` documents with tooltip showing history.

- [ ] **Step 6: Commit**

```bash
git add portal/pipeline/ledger/index.html
git commit -m "feat: ledger by-customer, export, print, audit trail"
```

---

## Chunk 5: Dashboard, Nav, Cleanup

### Task 17: Update Nav Links Across All Pages

**Files:**
- Modify: 16 files with nav panels

- [ ] **Step 1: Search for all files with nav-panel__link**

- [ ] **Step 2: Replace pipeline nav section in all files**

New pipeline links:
```html
<a href="/pipeline/" class="nav-panel__link" data-admin-only>Pipeline</a>
<a href="/pipeline/triage/" class="nav-panel__link" data-admin-only>Triage Board</a>
<a href="/pipeline/ledger/" class="nav-panel__link" data-admin-only>Billing Ledger</a>
```

**IMPORTANT:** Workbench (`/pipeline/edit/`) is NOT in nav — it's accessed by clicking a task from Triage or Ledger. Do NOT add a nav link for it.

Remove old: Pipeline Status, Billing Review links.

Note: After deleting 5 old pipeline pages (Task 19), there will be ~15 files with nav panels to update (12 existing + 3 new pages). Count may vary — search for `nav-panel__link` to get the exact list.

- [ ] **Step 3: Commit**

```bash
git add portal/
git commit -m "feat: update nav links — add triage/ledger, remove old pipeline links"
```

---

### Task 18: Rebuild Pipeline Dashboard

**Files:**
- Modify: `portal/pipeline/index.html`

- [ ] **Step 1: Read current dashboard, redesign as launchpad**

Three prominent cards for 3-step flow + config section with smaller links. Stats bar at top. Container `#pipelineDashboard` with `--pd-*` prefix. AAS design system.

- [ ] **Step 2: Commit**

```bash
git add portal/pipeline/index.html
git commit -m "feat: rebuild pipeline dashboard as 3-step launchpad"
```

---

### Task 19: Add Redirects and Delete Old Pages

**Files:**
- Modify: `netlify.toml`
- Delete: 5 HTML files + 5 directories

- [ ] **Step 1: Change old routes to 301 redirects**

preview → triage, review → triage, estimates → edit, log → ledger, status → ledger.

- [ ] **Step 2: Delete old page files and directories**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete old pipeline pages, add 301 redirects"
```

---

### Task 20: Fix Pipeline Parts Mapping Page

**Files:**
- Modify: `portal/pipeline/parts/index.html`

- [ ] **Step 1: Read and identify column mapping issues**

- [ ] **Step 2: Fix column names to match part_map table fields**

- [ ] **Step 3: Commit**

```bash
git add portal/pipeline/parts/index.html
git commit -m "fix: pipeline parts mapping page column names"
```

---

### Task 21: Wire Rates Page Edit Buttons

**Files:**
- Modify: `portal/pipeline/rates/index.html`

- [ ] **Step 1: Read current rates page and find edit button handlers**

- [ ] **Step 2: Wire click handlers to inline edit form**

Each rate card's Edit button should toggle to an inline edit mode: inputs replace display values, Save/Cancel buttons appear. Save calls `PATCH /api/pipeline/rates/{tier}` (if endpoint exists) or stores locally.

- [ ] **Step 3: Commit**

```bash
git add portal/pipeline/rates/index.html
git commit -m "feat: wire rates page edit buttons with inline editing"
```

---

### Task 22: Fix Tech Parts Finder task.id Bug

**Files:**
- Modify: `portal/tech/parts/index.html`

**Context:** The task.id normalization was partially fixed in a previous hotfix but may still have edge cases. Backend returns `task_id` not `id`.

- [ ] **Step 1: Read current parts page task loading code**

- [ ] **Step 2: Ensure robust normalization**

After fetching task-context, normalize: `task.id = task.id || task.task_id || taskId`. Ensure the normalized ID is used in all subsequent API calls (parts write, etc).

- [ ] **Step 3: Commit**

```bash
git add portal/tech/parts/index.html
git commit -m "fix: parts finder task.id normalization edge cases"
```

---

### Task 23: Ledger — On Hold and Pending Estimates Tabs

**Files:**
- Modify: `portal/pipeline/ledger/index.html`

**Context:** Spec requires "On Hold" and "Pending Estimates" as separate tabs, not just the "All Documents" and "By Customer" tabs.

- [ ] **Step 1: Add On Hold tab content**

Clicking "On Hold" tab calls `loadLedger({ status: 'hold' })` and shows filtered results. Each row shows hold reason and days waiting.

- [ ] **Step 2: Add Pending Estimates tab content**

Clicking "Pending Estimates" tab calls `loadLedger({ doc_type: 'estimate', status: 'pending' })`. Shows estimates not yet approved/converted.

- [ ] **Step 3: Add aging calculation and display**

For holds and estimates, calculate days since creation. Show aging badges:
- Green: < 14 days (holds) / < 30 days (estimates)
- Amber: 14-30 days (holds) / 30-60 days (estimates)
- Red: > 30 days (holds) / > 60 days (estimates)

- [ ] **Step 4: Calculate "Needs Follow-Up" count**

Per spec: estimates older than 30 days + holds older than 14 days. Display in summary stats bar.

- [ ] **Step 5: Commit**

```bash
git add portal/pipeline/ledger/index.html
git commit -m "feat: ledger On Hold, Pending Estimates tabs with aging"
```

---

### Task 24: Backend Dependencies Note

**No files to modify — this is a dependency tracking note.**

The following tasks depend on backend endpoints being implemented on the droplet (per `docs/DROPLET-PIPELINE-CONTRACT.md`). If the endpoint doesn't exist yet, the frontend task can still be built with mock data, but will not function live until the backend is deployed.

| Plan Task | Backend Dependency | Contract Step |
|-----------|-------------------|---------------|
| Task 5 (Triage data loading) | `POST /pipeline/v2/classify` | #4 |
| Task 6 (Drag re-categorize) | `PATCH /pipeline/v2/task/{id}/classify` | #4 |
| Task 7 (Quick ship) | `POST /pipeline/v2/task/{id}/send` + task-context enhancements | #3, #6 |
| Task 9 (Workbench load) | `GET /pipeline/v2/task-context/{id}` (enhanced) | #3 |
| Task 10 (Parts management) | `POST /pipeline/v2/task/{id}/parts` (fixed) | #1 |
| Task 13 (Send/Draft/Hold) | `POST /send` + `PATCH /draft` + `PATCH /classify` | #5, #6 |
| Task 15 (Ledger loading) | `GET /pipeline/v2/ledger` | #7 |
| Task 16 (By Customer) | `GET /pipeline/v2/ledger/by-customer` | #8 |

**Database migrations** (backend prerequisites for Tasks 16 and 20):
- `part_map`: Add `aas_catalog_key` column (contract step #9)
- `documents`: Add `edited_after_send`, `edit_history` columns (contract step #10)
- New `task_drafts` table for draft storage (contract step #10)

**Search improvements** (backend, contract step #9):
- Improve Qdrant `/search-parts` fuzzy matching — benefits Tech Parts Finder and Copilot

---

### Task 25: Final Verification

- [ ] **Step 1: All 3 new pages load with auth, admin-only access**
- [ ] **Step 2: Nav links correct across all pages**
- [ ] **Step 3: All 5 redirects work (301)**
- [ ] **Step 4: Dark + light theme on all new pages**
- [ ] **Step 5: Non-admin redirected from pipeline pages**
- [ ] **Step 6: Create PR**

```bash
git push origin pipeline-redesign
gh pr create --title "Pipeline redesign: 3-step billing flow" --body "..."
```
