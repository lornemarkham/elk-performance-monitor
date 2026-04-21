# Quick Installation Guide

## For React/Next.js Projects

### Step 1: Copy Files

Copy the `src` folder to your project:

```bash
# From the extracted zip
cp -r sycle-performance-monitor/src /path/to/your/project/
```

### Step 2: Add to Your App

**For Next.js (App Router):**

```tsx
// app/layout.tsx
import dynamic from 'next/dynamic';

const PerformanceOverlay = dynamic(
  () => import('@/src/components/performance-overlay'),
  { ssr: false }
);

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <PerformanceOverlay />
      </body>
    </html>
  );
}
```

**For Next.js (Pages Router):**

```tsx
// pages/_app.tsx
import dynamic from 'next/dynamic';

const PerformanceOverlay = dynamic(
  () => import('@/src/components/performance-overlay'),
  { ssr: false }
);

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <PerformanceOverlay />
    </>
  );
}
```

**For React (CRA or Vite):**

```tsx
// App.tsx
import { useEffect } from 'react';
import PerformanceOverlay from './src/components/performance-overlay';
import { performanceMonitor } from './src/services/performance-monitor';

function App() {
  useEffect(() => {
    performanceMonitor.enable();
  }, []);

  return (
    <>
      <YourApp />
      <PerformanceOverlay />
    </>
  );
}
```

### Step 3: That's It!

Open your app and you should see the Performance Monitor in the top-right corner.

## Keyboard Shortcuts

- Click "Enable Performance Monitor" button to activate
- Click "Minimize" to hide the panel
- Click "Disable" to turn off monitoring

## Next Steps

- Read the full README.md for advanced configuration
- Check out all 6 tabs: Overview, Waterfall, Web Vitals, Tracing, Errors, Timeline
- Click the "Info" button on each tab to learn what it does
- Try the "Ask AI How to Optimize" button for recommendations

## Troubleshooting

**Not seeing the monitor?**
- Make sure you're using `ssr: false` with Next.js
- Check browser console for errors
- Verify the files are in the correct location

**API calls not tracked?**
- The monitor auto-tracks `fetch` calls
- Check that performanceMonitor.enable() is called

**Need help?**
Contact the Sycle development team or check the full README.md
