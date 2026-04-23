# ELK Performance Monitor

Chrome extension to see what’s actually happening in your app — network calls, errors, user interactions, iframe messages, and workflow timing.

Use it against local, dev, QA, or prod environments.

---

## Quick Start (under 10 minutes)

### 1. Requirements

- Node.js 20+
- Google Chrome

---

### 2. Install and build

git clone <this-repo-url>
cd elk-performance-monitor/extension
npm install
npm run build

Build output:
extension/dist

---

### 3. Load in Chrome

Go to:
chrome://extensions

- Enable Developer mode
- Click Load unpacked
- Select: extension/dist

IMPORTANT:
Use extension/dist (not extension/ or extension/src)

---

### 4. Use it

- Open your app (local/dev/QA/prod)
- Open the extension
- Interact with the app

The extension captures everything automatically.

---

## What you get

- Journey (user workflow)
- Network (API calls)
- Errors
- Messages (iframe)
- Ambient activity
- Session health

---

## Rebuild

cd extension
npm run build

Then reload extension in Chrome and refresh the page.

---

## Troubleshooting

- Not showing → load extension/dist
- Empty → refresh page
- Build fails → Node 20+, reinstall deps
- Changes not updating → rebuild + reload
- No data → refresh tab

---

## Contributing

1. Create branch
2. Make change
3. Build
4. Test in Chrome
5. Open PR

---

## Notes

- Internal tool
- Not production APM
- Chrome-first

---

## Optional demo

Mock environment exists, but not required.  -LM 