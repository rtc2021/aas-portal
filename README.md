# AAS Service Portal

Monorepo for Automatic Access Solutions — customer portals, technician tools, and AI copilot.

## Structure

```
aas-portal/
  netlify/functions/   # Copilot serverless function (V21)
  portal/              # Shared portal components
  mannings/            # Manning customer portal
  westbank/            # Westbank customer portal
  tech/                # Technician portal
  src/                 # Shared source files
  public/              # Static assets
```

## Architecture

```
Netlify (frontend + copilot function)
  → DigitalOcean Droplet :8000 (FastAPI retrieval gateway + Qdrant)
  → Limble CMMS API (work orders, assets)
  → Google Sheets (parts, manuals index, door registry)
  → Claude API (AI responses via copilot function)
```

## Routes

| URL | Description |
|-----|-------------|
| `/` | Homepage |
| `/command-center` | Command Center |
| `/parts-finder` | Parts Finder |
| `/tech-manuals` | Tech Manuals Hub |
| `/worksummary` | Work Summary |
| `/door?id=` | Door Detail |
| `/service?id=` | Service History |
| `/westbank/` | Westbank Customer Portal |
| `/mannings/` | Manning Customer Portal |

## Deployment

- **Portal**: Auto-deploys via Netlify on push to `main`
- **Copilot**: `netlify/functions/copilot.mts` — deployed with site
- **Droplet**: FastAPI + Qdrant on DigitalOcean (manual deploy)
