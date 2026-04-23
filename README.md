# ELK Performance Monitor

Chrome extension to see what’s actually happening in your app — network calls, errors, user interactions, iframe messages, and workflow timing.

Use it against **local, dev, QA, or prod** environments.

---

## 🚀 Quick Start (under 10 minutes)

### 1. Requirements

- Node.js 20+ (required)
- Google Chrome (or Chromium)

---

### 2. Install and build

```bash
git clone <this-repo-url>
cd elk-performance-monitor/extension
npm install
npm run build
```

This creates the extension build at:

```
extension/dist
```

---

### 3. Load the extension in Chrome

1. Open:
```
chrome://extensions
```

2. Enable Developer mode

3. Click Load unpacked

4. Select:
```
extension/dist
```

Important:
- Select extension/dist
- NOT extension/ or extension/src

---

### 4. Use it

1. Open your app:
   - Local
   - Dev
   - QA
   - Production (if appropriate)

2. Open the extension

3. Interact with your app

The extension will capture activity automatically.

No server setup. No config.

---

## What you get

- Journey — step-by-step workflow (clicks, submits, flow grouping)
- Network — API calls, timing, failures
- Errors — runtime issues
- Messages — iframe communication
- Ambient — background activity (polling, repeated calls)
- Session health — overall signal (success, errors, latency)

---

## Rebuilding after changes

From extension/:

```bash
npm run build
```

Then:
1. Go to chrome://extensions
2. Click Reload on the extension
3. Refresh your app tab

---

## Troubleshooting

- Extension not showing → make sure you loaded extension/dist
- Panel empty → reload the page after enabling extension
- Build fails → use Node 20+ and run npm install again
- Changes not updating → rebuild + reload extension + refresh tab
- Nothing captured → make sure you're on the correct tab and refresh

---

## Contributing

Keep it simple:

1. Create a branch
2. Make changes
3. Build the extension
4. Test in Chrome
5. Open PR

---

## Notes

- Internal tool — not a production APM system
- Long sessions may truncate older data
- Chrome-first support

---

## Optional: Demo environment

A mock demo environment exists for debugging and demos.

You do NOT need this for normal usage.

If needed, refer to internal docs or the mock folders in this repo.
