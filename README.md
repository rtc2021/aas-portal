# AAS Portal + AI Copilot

Monorepo for Automatic Access Solutions portal and AI-powered technician copilot.

## Structure

```
aas-portal/
  portal/       # Netlify static site (Vite build)
  ai/           # Droplet stack (FastAPI + Ollama + Qdrant)
  contracts/    # JSON Schemas + OpenAPI (shared truth)
```

## Portal (Netlify Frontend)

```bash
cd portal
npm install
npm run dev      # Local dev server
npm run build    # Production build → dist/
```

## AI Backend (DigitalOcean Droplet)

```bash
cd ai
cp .env.example .env
# Edit .env with secrets
docker compose up -d
```

## Routes

| URL | Description |
|-----|-------------|
| `/` | Homepage |
| `/tech/command` | Command Center |
| `/tech/parts` | Parts Finder |
| `/tech/doors` | Door Browser |
| `/tech/manuals` | Tech Manuals Hub |
| `/tech/summary` | Work Summary |
| `/door?id=` | Door Detail (fire inspections) |
| `/service?id=` | Service Detail (all doors) |

## Deployment

- **Portal**: Auto-deploys via Netlify on push to `main`
- **AI Backend**: Manual deploy via `docker compose up -d` on droplet
