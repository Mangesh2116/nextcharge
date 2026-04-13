# NextCharge React App

Full React frontend for the NextCharge EV charging platform, converted from the original HTML/JS.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm start

# App opens at http://localhost:3000
```

## Backend Connection

The app auto-connects to the NextCharge backend at `http://localhost:5000`.

If the backend isn't running, the app works in **demo mode** using local mock data — all UI works, login/signup show errors from the API.

To change the backend URL, edit `.env`:
```
REACT_APP_API_URL=https://your-backend.com/api/v1
```

Then restart the dev server.

## Project Structure

```
src/
├── App.js                    ← Root component, data loading
├── index.js                  ← React entry point
├── context/
│   └── AppContext.js         ← Global state: auth, modals, toast, API calls
├── components/
│   ├── Navbar.js             ← Fixed nav with login/signup/user badge
│   ├── Hero.js               ← Hero section with animated grid
│   ├── StatsBar.js           ← 4-stat banner
│   ├── MapSection.js         ← Interactive map with clickable pins
│   ├── StationsSection.js    ← Station grid with filter tabs
│   ├── StationCard.js        ← Individual station card
│   ├── HowItWorks.js         ← 4-step process section
│   ├── BookingSection.js     ← Booking form
│   ├── FooterAndApp.js       ← App download section + footer
│   ├── AuthModal.js          ← Login & signup modal
│   ├── BookingModal.js       ← Booking confirmation + success modal
│   └── Toast.js              ← Toast notification
└── data/
    └── stations.js           ← Mock station data + constants
```

## What Works

| Feature | Status |
|---------|--------|
| Browse all sections (Hero → Footer) | ✅ |
| Station cards with filter tabs (All / Fast DC / AC / CCS2) | ✅ |
| Interactive map pins with info card | ✅ |
| Station search (calls backend or filters local data) | ✅ |
| Login modal with API call + JWT storage | ✅ |
| Sign-up modal with validation + API call | ✅ |
| Session persistence (localStorage) | ✅ |
| Book slot modal (confirm → success with booking ref) | ✅ |
| Navigate button (opens Google Maps) | ✅ |
| Toast notifications | ✅ |
| Demo mode (works without backend) | ✅ |
| Responsive layout | ✅ |

## Build for Production

```bash
npm run build
# Output goes to /build — deploy to Vercel, Netlify, or any static host
```
