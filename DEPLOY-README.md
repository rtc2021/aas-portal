# AAS Copilot UI Deployment
## January 29, 2026

---

## WHAT'S IN THIS PACKAGE

```
├── netlify.toml                 ← Updated config (includes copilot routes)
├── netlify/
│   └── functions/
│       ├── copilot.mts          ← Working AI function (unchanged)
│       └── package.json         ← Dependencies
└── portal/
    └── public/
        └── copilot.js           ← NEW: Self-injecting Copilot UI
```

---

## DEPLOYMENT STEPS

### Step 1: Extract to your project folder

**PowerShell:**
```powershell
cd C:\Users\rurbi_7znoraw\Downloads
Expand-Archive -Path "aas-copilot-ui.zip" -DestinationPath "aas-portal-update" -Force
```

### Step 2: Push to GitHub

```powershell
cd C:\Users\rurbi_7znoraw\Downloads\aas-portal-update
git add .
git commit -m "Add Copilot UI"
git push
```

### Step 3: Enable Snippet Injection (ONE TIME)

Go to **Netlify Dashboard** → Your site → **Site settings** → **Build & deploy** → **Post processing** → **Snippet injection**

Click **Add snippet** and configure:
- **Insert before:** `</body>`
- **Script:**
```html
<script src="/copilot.js" defer></script>
```

Click **Save**.

### Step 4: Trigger Redeploy

Go to **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

---

## TEST IT

After deployment:

1. Go to your portal (e.g., https://aas-portal.netlify.app/tech/parts/)
2. Sign in as Admin or Tech
3. You should see the **AI Copilot** button in the bottom-right corner
4. Click it and ask: "What is b1 on Stanley?"

---

## FEATURES

✅ **Role-Gated** - Only shows for Admin and Tech users
✅ **Keyboard Shortcut** - Press Cmd/Ctrl + K to toggle
✅ **Page Context** - Auto-detects door ID from URL
✅ **Beautiful UI** - Dark glass aesthetic matching your portal
✅ **Works Everywhere** - Auto-injects into any page

---

## WHAT HAPPENS

The `copilot.js` script:
1. Waits for page load
2. Checks if user has Admin or Tech role (via AASAuth)
3. If yes, injects the floating button and panel
4. If no, does nothing (invisible to customers)

The script calls your working `/api/copilot` endpoint which connects to:
- Claude API for AI responses
- Your droplet RAG for playbook search
- Limble CMMS for work orders

---

## TROUBLESHOOTING

**Copilot button doesn't appear?**
- Check you're signed in as Admin or Tech
- Check browser console for errors
- Verify snippet injection is enabled

**"Technical difficulties" error?**
- Check droplet is running: `curl http://134.199.203.192:8000/health`
- Restart API if needed (see backup README)

**Snippet injection not working?**
- Make sure you added it BEFORE `</body>` not `</head>`
- Clear cache and redeploy

---

## SAFE TO DEPLOY

This package:
- ✅ Preserves your existing copilot.mts
- ✅ Only ADDS new files (copilot.js)
- ✅ Updates netlify.toml (adds routes, keeps functions)
- ✅ Doesn't touch any existing HTML pages
