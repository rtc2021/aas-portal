# AAS Copilot v10 Deployment

## What's Included
- `portal/public/copilot.js` - Self-contained UI (button says "AAS Copilot")
- `netlify/functions/copilot.mts` - Claude function with all tools
- `netlify.toml` - Netlify config

---

## Required Environment Variables

Set these in **Netlify Dashboard → Site settings → Environment variables**:

### Required
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `LIMBLE_CLIENT_ID` | Limble API client ID |
| `LIMBLE_CLIENT_SECRET` | Limble API client secret |

### Optional (with defaults)
| Variable | Default | Description |
|----------|---------|-------------|
| `PORTAL_BASE_URL` | https://aas-portal.netlify.app | Portal URL |
| `DROPLET_URL` | http://134.199.203.192:8000 | Qdrant/FastAPI server |
| `PARTS_SHEET_ID` | 1VEC9a... | Google Sheet for parts |
| `MANUALS_SHEET_ID` | (none) | Google Sheet for manuals database |

---

## Google Sheets Setup

Both sheets must be publicly viewable:
1. Open sheet in Google Sheets
2. Click **Share** (top right)
3. Change "General access" to **"Anyone with the link"** → **Viewer**
4. Copy Sheet ID from URL: `docs.google.com/spreadsheets/d/[SHEET_ID]/edit`

### Parts Sheet Columns
`key, manufacturer, mfg_part, description, image_path, qr_payload, match_status, image_id`

### Manuals Sheet Columns
`Manufacturer, ProductLine, DoorType, Controller, Model, FileName, DriveLink, Tags`

---

## Deploy Steps

```powershell
cd C:\Users\rurbi_7znoraw\Downloads
Expand-Archive -Path "aas-copilot-ui-v10.zip" -DestinationPath "aas-portal-update" -Force
cd aas-portal-update
git add .
git commit -m "Copilot v10"
git push
```

### One-Time: Enable Snippet Injection
Netlify Dashboard → Site settings → Build & deploy → Post processing → Snippet injection

Add snippet **before `</body>`**:
```html
<script src="/copilot.js" defer></script>
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `search_playbooks` | Technical docs from Qdrant droplet |
| `search_manuals` | PDF manuals from Google Sheet |
| `search_parts` | Parts inventory from Google Sheet |
| `get_work_orders` | Limble tasks (with date filtering) |
| `get_technicians` | Limble users |
| `get_service_history` | Service history by asset |
| `get_door_info` | Door registry lookup |
| `search_doors` | Find doors by customer/location |

---

## Changes in v10
- ✅ Button text changed to "AAS Copilot"
- ✅ Parts search uses correct columns (key, mfg_part, manufacturer, description, image_id)
- ✅ Added `search_manuals` tool for PDF manual database
- ✅ Date filtering by calendar day (today, yesterday, this_week)
- ✅ Anti-hallucination instructions in system prompt
- ✅ Technical accuracy note: MC521 works for BOTH slide AND swing doors
- ✅ Env vars for sheet IDs (easy to reconfigure)
