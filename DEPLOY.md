# AAS Copilot Deployment

## Files Included
```
netlify.toml              <- Replace existing
netlify/
  functions/
    copilot.mts           <- The AI copilot
    package.json          <- Dependencies
```

## Deployment Steps

### 1. Extract this zip to your aas-portal-update folder
This will replace netlify.toml and add/update the netlify/functions folder.

### 2. Push to GitHub
```powershell
cd C:\Users\rurbi_7znoraw\Downloads\aas-portal-update
git add .
git commit -m "Deploy AAS Copilot v3"
git push
```

### 3. Environment Variables (in Netlify Dashboard)
Make sure these are set in Site settings → Environment variables:

| Variable | Value |
|----------|-------|
| ANTHROPIC_API_KEY | sk-ant-... |
| LIMBLE_CLIENT_ID | 9SQW0ZJB9O4C2ZVJAN1NSVJS1W4DYKG8 |
| LIMBLE_CLIENT_SECRET | 2D8ZWE8IHL4F7VQ4Q1NO2OGSKY8NFROL |
| PORTAL_BASE_URL | https://aas-portal.netlify.app |
| DROPLET_URL | http://134.199.203.192:8000 |

### 4. Test
```powershell
Invoke-RestMethod -Uri "https://aas-portal.netlify.app/api/copilot" -Method Post -ContentType "application/json" -Body '{"messages":[{"role":"user","content":"What is b1 on Stanley?"}]}'
```

## What the Copilot Does

- search_playbooks: Searches your droplet's Qdrant database for technical info
- get_door_info: Gets door details from /api/door
- search_doors: Searches doors by customer/location
- search_parts: Searches parts inventory
- get_work_orders: Gets Limble work orders
- get_service_history: Gets service history from Limble
