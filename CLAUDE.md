# FineTrack — Claude Context

## What It Is
Personal finance tracker PWA. Vanilla JS + Firebase Firestore + anonymous auth. No build step, no framework.

## Stack
- **JS**: Vanilla ES6+ (single `app.js` file)
- **DB**: Firebase Firestore (real-time `onSnapshot`) + localStorage fallback
- **Auth**: Firebase anonymous auth + custom session password (default: admin/12345)
- **PWA**: `sw.js` (network-first for app files), `manifest.json`
- **Charts**: Chart.js (lazy CDN), GSAP 3.12.5 animations
- **Import**: SheetJS/xlsx (lazy CDN)
- **CSS**: `style.css` — glassmorphism, dark/light themes, mobile-first

## Key Files
| File | Role |
|------|------|
| `index.html` | All markup: sidebar, pages, modals, forms |
| `app.js` | All logic: CRUD, rendering, auth, sync, charts |
| `style.css` | Theming, layout, animations |
| `sw.js` | Service worker — offline caching |
| `firestore.rules` | Auth + field validation rules |

## Data Models

**Transaction**
```js
{ id, type: "income|expense", amount: number, category: string, date: "YYYY-MM-DD", note?: string, account: "cash|card" }
```

**Account Bases** (balances stored directly, not computed)
```js
{ cash: number, card: number }  // key: fintrack_account_bases_v3
```

**Savings Goal**: `{ name, amount }` — key: `fintrack_savings_goal`

**Custom Categories**: `{ name, emoji }[]` — key: `fintrack_custom_categories`

## localStorage Keys
| Key | Data |
|-----|------|
| `fintrack_transactions` | Active transactions array |
| `fintrack_cache_transactions` | Firestore sync backup |
| `fintrack_account_bases_v3` | Cash/card balances |
| `fintrack_savings_goal` | Goal object |
| `fintrack_custom_categories` | User categories |
| `fintrack_bg` | Background image (base64) |
| `fintrack_theme` | "light" or "dark" |
| `fintrack_password` | Hashed password |

## Architecture Notes
- **No build step** — edit files and reload
- **120ms debounce** on `refreshAll()` to batch updates
- **Active page** drives rendering: Dashboard / Transactions / Stats
- **Charts destroy/recreate** on each data change (no diffing)
- **Balance is stored** in `accountBases`, not computed from transactions
- **Google Sheets webhook** syncs silently in the background
- Session auth via `sessionStorage.fintrack_auth` — cleared on logout

## Features
- Add/edit/delete income & expense with account (cash/card)
- Dashboard: balance card, monthly summary, savings goal widget, bar chart
- Analytics: donut charts by category, income vs expense grid
- Excel/CSV import wizard (3-step: map → preview → confirm)
- JSON export backup
- Light/dark theme toggle
- Custom background image upload
- Custom categories with emoji
