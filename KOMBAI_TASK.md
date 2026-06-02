# Kombai Task — Dark Theme Redesign

## Repository
GitHub: `maximoseo/new-n8n-setup-dashboard`
Branch: `main`

---

## Files to modify (exact paths)

1. `src/contexts/ThemeContext.tsx` — change default theme to dark
2. `src/index.css` — update CSS variables + global styles
3. `src/pages/ClonerWizard.tsx` — redesign sidebar, steps, form cards
4. `src/App.tsx` — redesign top nav, main layout

---

## Change 1 — `src/contexts/ThemeContext.tsx`

Change the default theme from `"system"` to `"dark"`:

```ts
// BEFORE:
const [mode, setModeState] = useState<ThemeMode>(
  () => (localStorage.getItem(storageKey) as ThemeMode | null) ?? "system"
);

// AFTER:
const [mode, setModeState] = useState<ThemeMode>(
  () => (localStorage.getItem(storageKey) as ThemeMode | null) ?? "dark"
);
```

---

## Change 2 — `src/index.css`

Replace the entire `:root` and `.dark` blocks with:

```css
:root {
  --bg: #0a0f1e;
  --surface: #111827;
  --surface2: #1a2235;
  --border: #1e2d45;
  --border2: #243352;
  --text: #e2e8f0;
  --muted: #64748b;
  --accent: #3b82f6;
  --accent-glow: rgba(59,130,246,0.15);
  --success: #10b981;
  --danger: #ef4444;

  color: var(--text);
  background: var(--bg);
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
}

body {
  min-width: 320px;
  margin: 0;
  background: var(--bg);
  color: var(--text);
}
```

Keep all existing Tailwind base/components/utilities imports at top. Keep all other existing CSS rules below — only replace the `:root` and body blocks.

---

## Change 3 — `src/App.tsx` (Top Navigation Bar)

Find the nav/header element at the top of the App component and restyle it:

```
- Height: 52px, sticky top-0, z-50
- Background: rgba(10,15,30,0.92) with backdrop-filter: blur(12px)
- Bottom border: 1px solid #1e2d45
- Logo badge "NS": 28×28px, background gradient #3b82f6→#06b6d4, border-radius 7px, white bold text
- App title: font-size 15px, color #e2e8f0, font-weight 600
- Nav buttons (System, Settings, Logout): transparent bg, border 1px solid #243352, color #94a3b8
  - hover: border-color #3b82f6, color #e2e8f0, box-shadow 0 0 8px rgba(59,130,246,0.2)
- "← Dashboards" link: color #64748b, hover color #3b82f6
- User email text: color #64748b, font-size 12px
```

---

## Change 4 — `src/pages/ClonerWizard.tsx`

### Sidebar (left panel)
```
- Background: #111827
- Border-right: 1px solid #1e2d45
- Width: 220px on desktop

- "Create New Site" button:
  background: linear-gradient(135deg, #2563eb, #0891b2)
  color: white, border: none
  box-shadow: 0 2px 12px rgba(37,99,235,0.3)
  hover: opacity 0.9

- "Workflow Cloner" button:
  background: #1a2235, border: 1px solid #243352, color #94a3b8
  hover: border-color #3b82f6, color #e2e8f0

- Step nav buttons (Input/Discovery/Keywords/etc.):
  default: transparent, color #64748b
  active: background rgba(59,130,246,0.12), border 1px solid rgba(59,130,246,0.25), color #60a5fa
  Step number badge: 18×18px pill, background #1a2235, border #243352, color #64748b
  Active badge: background #3b82f6, color white

- "SITES" label: uppercase, 10px, color #475569, letter-spacing 0.08em
- "No sites yet" text: color #475569, font-size 13px
```

### Steps Bar (horizontal stepper, top of main content)
```
- Background: #111827, border: 1px solid #1e2d45, border-radius 10px, padding 10px 16px
- Step circles (24px):
  - pending: background #1a2235, border #243352, color #475569
  - active: background #3b82f6, box-shadow 0 0 10px rgba(59,130,246,0.4), color white
  - done: background #10b981, color white
- Step labels: font-size 12px, color #64748b
- Active label: color #e2e8f0
- Connector lines: #1e2d45
```

### Form Card (main content area)
```
- Section heading "Create New Site": color #e2e8f0, font-size 20px, font-weight 700
- Subtitle text: color #64748b

- Form card wrapper: background #111827, border 1px solid #1e2d45, border-radius 10px, padding 24px

- Labels: font-size 11px, uppercase, letter-spacing 0.06em, color #64748b, font-weight 600
- Required asterisk → replace with red dot: 5px circle, background #ef4444, display inline-block

- Inputs (text/select):
  background: #1a2235
  border: 1px solid #243352
  color: #e2e8f0
  height: 40px, border-radius 7px, padding 0 12px
  focus: border-color #3b82f6, box-shadow 0 0 0 3px rgba(59,130,246,0.15), outline none
  placeholder color: #475569

- "Create and Discover" button (CTA):
  background: linear-gradient(135deg, #2563eb, #0891b2)
  color white, border none, height 44px, border-radius 8px, font-weight 600
  box-shadow: 0 2px 16px rgba(37,99,235,0.25)
  disabled: opacity 0.4, cursor not-allowed
```

---

## Responsive

- **>900px**: sidebar 220px fixed, visible
- **680–900px**: sidebar 180px, hide some nav text
- **<680px**: sidebar becomes off-canvas drawer, hamburger ☰ button in header opens it, dark overlay behind

---

## IMPORTANT RULES

1. Do NOT change any API calls, imports of api functions, or business logic
2. Do NOT change TypeScript types or interfaces
3. Do NOT remove any existing props or event handlers
4. Do NOT touch authentication code (AuthContext, useAuth)
5. ONLY change: className values, inline styles, CSS variables, layout structure
6. Keep all existing Tailwind classes that handle functionality — only add/replace visual ones
7. The ThemeToggle button in nav can remain — just restyle it to match dark theme

---

## Result expected

Dark professional dashboard similar to Linear / Vercel. All functionality works exactly as before.
