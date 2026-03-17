# Droplet Backend Contract — Pipeline & Parts Endpoints

> **Purpose:** This document defines the exact API contracts the portal frontend expects.
> All backend work on main.py MUST conform to these specifications.
> The portal frontend (Netlify) and backend (droplet) are developed separately —
> this contract keeps them aligned.

## Context: What We're Building

A 3-step billing pipeline:
1. **Triage Board** — Kanban view of classified tasks (invoice-ready, estimate, split, hold, needs-review, skip)
2. **Billing Workbench** — Per-task editor (labor, parts, rate, customer, doc type) with rendered invoice preview, sends to QB
3. **Ledger** — Post-billing tracking, holds, pending estimates, customer breakdown, export

Three frontend consumers share parts infrastructure:
- **Parts Finder** (`/tech/parts/`) — Tech/Admin searches parts catalog, adds parts to Limble tasks
- **Copilot** (`copilot.mts`) — AI assistant searches parts, future: writes parts to tasks
- **Billing Workbench** (`/pipeline/edit/`) — Admin adds/edits parts with QB pricing before invoicing

**All parts writes go through the same endpoint.** QB is source of truth for pricing. Limble is source of truth for task/part assignment. `part_map` table bridges the two.

---

## CRITICAL BUG FIX: Parts Write to Limble

### Current (BROKEN)
`POST /pipeline/v2/task/{id}/parts` writes parts to task **comments/notes**, NOT to the Limble parts section.

### Required Fix
Write parts to the **Limble parts tab** using the Limble API:

```
POST https://api.limblecmms.com/v2/tasks/{taskID}/parts
Authorization: Basic <base64(CLIENT_ID:CLIENT_SECRET)>
Content-Type: application/json

{
  "partID": <limble_part_id>,   // from part_map lookup, if mapped
  "usedCount": <quantity>
}
```

If the part doesn't exist in Limble's parts inventory, you may need to:
1. Create the part first: `POST /v2/parts` with `{ "name": "<part_name>" }`
2. Then associate: `POST /v2/tasks/{taskID}/parts` with the new partID

**Fallback:** If Limble parts API write fails, still return success with `wrote_to_limble: false` so the frontend knows. Do NOT fall back to writing comments.

---

## Endpoint Contracts

### 1. POST /pipeline/v2/task/{id}/parts

**Consumers:** Parts Finder, Billing Workbench, Copilot (future)
**Auth:** Tech + Admin (via pipeline.mts RBAC)

**Request:**
```json
{
  "parts": [
    {
      "part_name": "BEA 10MS31",
      "part_number": "218848-41",
      "manufacturer": "BEA",
      "quantity": 1,
      "qb_item_id": "optional-string"  // if Workbench already resolved from QB search
    }
  ]
}
```

**Response (REQUIRED schema — frontend depends on these exact fields):**
```json
{
  "status": "ok",
  "task_id": 5247,
  "parts_written": 1,
  "mapping_status": [
    {
      "part_name": "BEA 10MS31",
      "limble_part_id": 456,           // null if not in Limble
      "wrote_to_limble": true,          // MUST be true when written to parts tab
      "qb_mapped": true,               // looked up in part_map
      "qb_item_id": "QB-789",          // from part_map or request
      "qb_item_name": "BEA 10MS31 Motion Sensor",
      "qb_unit_price": 142.50          // from part_map
    }
  ]
}
```

**Backend logic:**
1. Receive parts array
2. For each part:
   a. Lookup in `part_map` by part_name or part_number → get qb_item_id, qb_unit_price
   b. Lookup or create in Limble parts inventory → get limble_part_id
   c. Write to Limble task parts tab: `POST /v2/tasks/{taskID}/parts`
   d. Return mapping_status with all fields populated
3. If qb_item_id was passed in request (from Workbench QB search), use it and update part_map

---

### 2. GET /pipeline/v2/task-context/{id}

**Consumers:** Parts Finder, Billing Workbench
**Auth:** Tech + Admin

**Response (REQUIRED schema):**
```json
{
  "task": {
    "task_id": 5247,
    "id": 5247,
    "name": "Replace sensor at Manning ED Entrance",
    "statusID": 2,
    "completedDate": "2026-03-10T14:30:00Z",
    "completedBy": "Jonas",
    "description": "Task completion notes from tech"
  },
  "customer": {
    "id": 3,
    "name": "Manning Medical Center",
    "qb_customer_id": "QB-123",
    "qb_customer_name": "Manning Medical Center",
    "mapping_status": "verified"
  },
  "asset": {
    "id": 1234,
    "name": "MH-1.81"
  },
  "labor": {
    "hours": 2.5,
    "rate_tier": "standard",
    "rate_amount": 85.00
  },
  "parts_on_task": [
    {
      "part_name": "BEA 10MS31",
      "part_number": "218848-41",
      "quantity": 1,
      "limble_part_id": 456,
      "qb_mapped": true,
      "qb_item_id": "QB-789",
      "qb_unit_price": 142.50
    }
  ],
  "asset_parts_history": [
    {
      "part_name": "BEA 10MS31",
      "count": 3,
      "part_number": "218848-41",
      "manufacturer": "BEA"
    }
  ],
  "classification": {
    "type": "invoice",
    "signals": ["single_visit", "parts_mapped", "customer_verified"],
    "confidence": 0.95
  }
}
```

**IMPORTANT:** Always return both `task_id` AND `id` with the same value. Frontend normalizes but both must be present.

**IMPORTANT:** `customer` object must include `qb_customer_id` and `mapping_status` so the Workbench can show/resolve customer mapping inline.

**IMPORTANT:** `labor` object must include current rate tier and dollar amount so the Workbench can pre-fill and allow editing.

**IMPORTANT:** `classification` object tells the Triage Board which column this task belongs in.

---

### 3. POST /pipeline/v2/classify (Triage Board)

**Consumer:** Triage Board
**Auth:** Admin only

**Request:**
```json
{
  "limit": 200,
  "offset": 0,
  "force_refresh": false
}
```

**Response:**
```json
{
  "tasks": [
    {
      "task_id": 5247,
      "name": "Replace sensor at Manning ED Entrance",
      "customer_name": "Manning Medical Center",
      "completed_date": "2026-03-10",
      "tech_name": "Jonas",
      "classification": "invoice",
      "signals": ["single_visit", "parts_mapped", "customer_verified"],
      "total_estimate": 355.00,
      "has_unmapped_parts": false,
      "has_unmapped_customer": false,
      "visit_count": 1
    }
  ],
  "counts": {
    "invoice": 12,
    "estimate": 5,
    "split": 3,
    "hold": 8,
    "skip": 2,
    "needs_review": 4
  },
  "last_sync": "2026-03-15T04:00:00Z"
}
```

**Classification types (exhaustive):**
- `invoice` — ready to bill, all mappings resolved
- `estimate` — quote-request or customer needs approval first
- `split` — multiple visits/techs, needs billing decision per visit
- `hold` — waiting on parts, approval, or information
- `skip` — already billed, warranty, internal, or not billable
- `needs_review` — classifier uncertain, admin must decide

---

### 4. PATCH /pipeline/v2/task/{id}/classify

**Consumer:** Triage Board (drag-and-drop re-categorize)
**Auth:** Admin only

**Request:**
```json
{
  "classification": "invoice",
  "reason": "admin_override — or freetext like 'waiting on parts from supplier'"
}
```

**Response:**
```json
{
  "status": "ok",
  "task_id": 5247,
  "old_classification": "needs_review",
  "new_classification": "invoice"
}
```

---

### 5. POST /pipeline/v2/task/{id}/send

**Consumer:** Billing Workbench (approve & send to QB)
**Auth:** Admin only

**Request:**
```json
{
  "doc_type": "invoice",
  "replacing_doc_id": null,
  "customer": {
    "qb_customer_id": "QB-123"
  },
  "labor": {
    "hours": 2.5,
    "rate": 85.00,
    "description": "Service Labor — Standard"
  },
  "parts": [
    {
      "qb_item_id": "QB-789",
      "name": "BEA 10MS31 Motion Sensor",
      "quantity": 1,
      "unit_price": 142.50
    }
  ],
  "notes": "Replaced motion sensor at ED entrance. Tested operation.",
  "tags": ["@Billed"]
}
```

**Fields:**
- `doc_type`: `"invoice"` or `"estimate"` — backend routes to correct QB API (invoice/create vs estimate/create)
- `replacing_doc_id`: If re-sending a correction, pass the original QB doc ID. Backend voids the original before creating the new one. Null for first-time sends.
```

**Response:**
```json
{
  "status": "ok",
  "task_id": 5247,
  "doc_type": "invoice",
  "qb_doc_id": "INV-1047",
  "qb_doc_number": "1047",
  "total": 355.00,
  "line_items": [
    { "description": "Service Labor — Standard", "amount": 212.50 },
    { "description": "BEA 10MS31 Motion Sensor", "amount": 142.50 }
  ],
  "tagged": true
}
```

**Backend logic:**
1. Build QB invoice/estimate from request fields (NOT from cached classifier data — use what the admin edited)
2. Create in QB via API
3. Tag task in Limble with `@Billed` or `@Estimated`
4. Record in `documents` table for ledger
5. Return QB doc ID and details
6. If `replacing_doc_id` is set: void original in QB first, record void in documents table, then create new

---

### 5b. PATCH /pipeline/v2/task/{id}/draft

**Consumer:** Billing Workbench (save without sending)
**Auth:** Admin only

**Request:**
```json
{
  "doc_type": "invoice",
  "labor": { "hours": 2.5, "rate": 85.00 },
  "parts": [
    { "part_name": "BEA 10MS31", "qb_item_id": "QB-789", "quantity": 1, "unit_price": 142.50 }
  ],
  "customer": { "qb_customer_id": "QB-123" },
  "notes": "Replaced motion sensor at ED entrance."
}
```

**Response:**
```json
{
  "status": "ok",
  "task_id": 5247,
  "draft_saved": true
}
```

**Backend logic:**
1. Store draft as JSON in a `task_drafts` table or JSONB column on existing task tracking
2. Draft is retrieved by `GET /pipeline/v2/task-context/{id}` (include `draft` field if exists)
3. Draft is overwritten on each save, deleted when task is sent to QB

---

### 6. GET /pipeline/v2/ledger

**Consumer:** Ledger page
**Auth:** Admin only

**Request (query params):**
```
?doc_type=invoice|estimate|all
&status=sent|paid|hold|pending|all
&customer=<name or qb_id>
&date_from=2026-03-01
&date_to=2026-03-15
&search=<free text>
&offset=0
&limit=50
&sort=-date
```

**Response:**
```json
{
  "documents": [
    {
      "qb_doc_id": "INV-1047",
      "doc_type": "invoice",
      "customer_name": "Manning Medical Center",
      "task_id": 5247,
      "task_name": "Replace sensor at Manning ED Entrance",
      "amount": 355.00,
      "date_created": "2026-03-10",
      "date_sent": "2026-03-10",
      "status": "sent",
      "edited_after_send": false,
      "edit_history": []
    }
  ],
  "summary": {
    "total_billed_period": 12450.00,
    "total_pending_estimates": 3200.00,
    "count_on_hold": 8,
    "count_invoices_sent": 47,
    "count_needs_followup": 3
  },
  "pagination": {
    "total": 58,
    "offset": 0,
    "limit": 50
  }
}
```

---

### 7. GET /pipeline/v2/ledger/by-customer

**Consumer:** Ledger "By Customer" tab
**Auth:** Admin only

**Request (query params):**
```
?date_from=2026-03-01
&date_to=2026-03-15
```

**Response:**
```json
{
  "customers": [
    {
      "customer_name": "Manning Medical Center",
      "qb_customer_id": "QB-123",
      "total_billed": 4200.00,
      "total_pending_estimates": 1200.00,
      "open_holds": 2,
      "invoices_sent": 12,
      "invoices_paid": 8,
      "last_invoice_date": "2026-03-10"
    }
  ]
}
```

---

### 8. GET /api/qb/products (VERIFY EXISTS)

**Consumer:** Billing Workbench (part search when adding parts)
**Auth:** Admin only

**Request:** `?search=BEA+10MS31`

**Response:**
```json
{
  "items": [
    {
      "qb_item_id": "QB-789",
      "name": "BEA 10MS31 Motion Sensor",
      "sku": "218848-41",
      "unit_price": 142.50,
      "type": "Inventory",
      "active": true
    }
  ]
}
```

---

### 9. POST /search-parts (IMPROVE MATCHING)

**Consumer:** Parts Finder, Copilot search_parts tool
**Auth:** Open (called from droplet internally, not exposed to public)

**Current issues:**
- Poor fuzzy matching on MFG part numbers (e.g. "218848-41" should match "218848")
- Keyword scoring misses common abbreviations
- Manufacturer filter sometimes too strict

**Improvements needed:**
- Add fuzzy matching on `mfg_part` field (strip dashes, allow prefix match)
- Add common abbreviation expansion (BEA ↔ "BEA Sensors", etc.)
- Reduce minimum vector score threshold for partial matches when keyword match exists

**Do NOT change the response schema** — it already works:
```json
{
  "exactMatches": [...],
  "closeMatches": [...],
  "partialMatches": [...]
}
```

---

## Database Changes

### part_map table — ADD COLUMN
```sql
ALTER TABLE part_map ADD COLUMN aas_catalog_key VARCHAR(100);
-- Cross-reference to Google Sheet "key" column
-- Allows linking: Sheet part ↔ Limble part ↔ QB item
```

### documents table — ADD COLUMNS
```sql
ALTER TABLE documents ADD COLUMN edited_after_send BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN edit_history JSONB DEFAULT '[]';
-- edit_history: [{ "timestamp": "...", "field": "...", "old": "...", "new": "...", "user": "..." }]
```

---

## Environment & Auth

- Limble API: Basic Auth via `LIMBLE_CLIENT_ID:LIMBLE_CLIENT_SECRET`
- QB API: OAuth tokens at `/home/aasadmin/ai/api/qb_tokens.json` — refresh before use
- 1Password: `op run --environment 6bfe72vc4ltgxvewtbkdqhip4q`
- All endpoints receive requests from Netlify pipeline.mts proxy with header `x-internal-key`
- RBAC is handled by pipeline.mts — droplet trusts proxied requests

## What NOT to Change

- Do NOT modify existing search endpoints (/search, /search-nfpa*, /search-ansi*) — they work
- Do NOT modify /get-door or /door-info — they work
- Do NOT change the parts_v1 Qdrant collection schema — only improve search scoring
- Do NOT change the classifier's category names — frontend hardcodes them
- Do NOT remove any existing endpoints — only add new ones or fix broken ones
- Do NOT change QB token storage path — other scripts depend on it

## Execution Order

1. **Fix parts write bug** (comments → Limble parts API) — unblocks everything
2. **Verify GET /api/qb/products works** — Workbench needs this
3. **Add classification + labor + customer QB fields to task-context response** — Triage Board + Workbench
4. **Add PATCH /pipeline/v2/task/{id}/classify** — Triage Board re-categorize (with reason field)
5. **Add PATCH /pipeline/v2/task/{id}/draft** — Workbench save draft
6. **Add POST /pipeline/v2/task/{id}/send** — Workbench send to QB (with replacing_doc_id for corrections)
7. **Add GET /pipeline/v2/ledger + /ledger/by-customer** — Ledger page
8. **Improve /search-parts matching** — Parts Finder quality
9. **Add aas_catalog_key to part_map** — cross-reference linking
10. **Add edit tracking columns to documents + task_drafts table** — Ledger audit trail + draft storage
