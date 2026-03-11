# Lifestar Ambulance Scheduling System

A comprehensive web-based ambulance scheduling application with role-based access control, shift management, and crew assignment capabilities.

## 🚀 Quick Start

### Prerequisites
- Python 3.x
- Node.js 20.x (for build tools)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. Navigate to the project directory:
```bash
cd lifestar-ambulance-scheduling
```

2. Install dependencies:
```bash
npm install
```

### Running the Application

**Production Mode with Server (Recommended):**
```bash
# Start the Express server with SQLite database
node server/index.js
```
Access at: http://localhost:8061

**Development Mode (Simple HTTP Server):**
```bash
# Using Python (simplest)
python -m http.server 8050

# Or using Node.js
npx serve -p 8050
```

**Static HTML Only:**
Open `index.bundle.html` in your browser (uses minified bundles, no server)

### Access the Application

- **Production (with server):** http://localhost:8061
- **Development:** http://localhost:8050/index.html
- **Static Bundle:** http://localhost:8050/index.bundle.html

## 👤 Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `super` | `super123` |
| Boss | `boss` | `boss123` |
| Paramedic | `paramedic1` | `paramedic123` |
| EMT | `emt1` | `emt123` |

## 📁 Project Structure

```
lifestar-ambulance-scheduling/
├── assets/              # Images and static assets
│   ├── IMG_6644.jpeg
│   ├── IMG_6645.png
│   └── Lifestar.png
├── dist/                # Minified production bundles
│   ├── app.bundle.js
│   └── app.bundle.min.js
├── docs/                # Documentation
│   ├── COMPONENT_DOCS.md
│   ├── CSP-ENHANCEMENT-SUMMARY.md
│   ├── PERMANENT_RULES.md
│   ├── README.md
│   ├── RECOMMENDATIONS.md
│   └── todo.md
├── src/
│   ├── css/            # Stylesheets
│   │   ├── mobile-ux-styles.css
│   │   ├── print-styles.css
│   │   ├── styles.bundle.min.css
│   │   └── styles.css
│   └── js/             # JavaScript modules
│       ├── accessibility-improvements.js
│       ├── advanced-performance-optimizer.js
│       ├── analytics-charts.js
│       ├── app.js
│       ├── boss-features.js
│       ├── bug-fixes.js
│       ├── click-helper.js
│       ├── constants.js
│       ├── csrf-protection.js
│       ├── drag-drop-scheduler.js
│       ├── dropdown-compatibility.js
│       ├── helper-functions.js
│       ├── internationalization.js
│       ├── keyboard-shortcuts.js
│       ├── mechanics-improvements.js
│       ├── missing-functions.js
│       ├── modal-focus-manager.js
│       ├── password-hashing-util.js
│       ├── payroll-system.js
│       ├── permissions-system.js
│       ├── remaining-features.js
│       ├── sanitize-helper.js
│       ├── session-timeout.js
│       ├── super-admin-patch.js
│       ├── super-boss-bridge.js
│       ├── system-initializer.js
│       └── time-validation-archive.js
├── index.html          # Main HTML file (development)
├── index.bundle.html   # Production HTML (minified)
├── service-worker.js   # Service Worker for PWA
├── package.json        # Node.js dependencies
└── .eslintrc.json      # ESLint configuration
```

## 🎯 Features

### Role-Based Dashboards
- **Super Admin (7 sections):** System configuration, user management, feature toggles, API keys, logs
- **Boss (19 sections):** Schedule management, crew templates, time-off requests, shift trades, staff directory, analytics, payroll
- **Paramedic (10 sections):** My schedule, availability, shift trades, swap marketplace, bonus hours
- **EMT (10 sections):** My schedule, availability, shift trades, swap marketplace, bonus hours

### Key Capabilities
- ✅ Drag-and-drop scheduler for shift assignments
- ✅ Cross-schedule conflict detection
- ✅ Rest period enforcement (8-hour minimum)
- ✅ Maximum hours validation (160-hour monthly limit)
- ✅ Time-off request management
- ✅ Shift trade marketplace
- ✅ Staff directory with search/filter
- ✅ Training records tracking
- ✅ Bonus hours management
- ✅ Emergency call-ins handling
- ✅ On-call rotation management
- ✅ Advanced analytics with interactive charts
- ✅ Payroll system with report generation
- ✅ Password hashing (SHA-256)
- ✅ Session timeout (30 minutes)
- ✅ CSRF protection
- ✅ XSS prevention
- ✅ PWA support (Service Worker)

## 🔧 Build Tools

### CSS Bundling
```bash
npx clean-css-cli src/css/styles.css src/css/mobile-ux-styles.css src/css/print-styles.css -o src/css/styles.bundle.min.css
```

### JavaScript Bundling
```bash
# Create concatenated bundle
./bundle-js.sh

# Minify bundle
npx terser dist/app.bundle.js -o dist/app.bundle.min.js -c -m
```

## 📊 Current Status

- **Test Status:** All dashboard tests passing (89.66% success rate)
- **Boss Dashboard:** 21/21 sections ✅
- **Super Admin Dashboard:** 9/9 sections ✅
- **Paramedic Dashboard:** 10/10 sections ✅
- **EMT Dashboard:** 10/10 sections ✅
- **Total Recommendations:** 38
- **Completed:** 21/38 (55%)
- **Remaining:** 17/38 (45%)
- **Server-Required:** 6 (cannot implement without backend)

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [COMPONENT_DOCS.md](docs/COMPONENT_DOCS.md) | Complete system documentation (architecture, API, components) |
| [MASTER_CHANGELOG.md](MASTER_CHANGELOG.md) | Development history, phases, and verification results |
| [RECOMMENDATIONS.md](docs/RECOMMENDATIONS.md) | Enhancement roadmap and status tracking |
| [PERMANENT_RULES.md](docs/PERMANENT_RULES.md) | Development guidelines and quality gates |

## 🔒 Security Features

- Password hashing using Web Crypto API (SHA-256 + salt)
- Input validation on all forms
- CSRF token protection
- XSS prevention with HTML sanitization
- Content Security Policy headers
- Session timeout with warning toast
- LocalStorage data persistence

## 🌐 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📱 Mobile Features

- Responsive design
- Touch-optimized interface
- PWA support (installable)
- Mobile menu navigation
- Touch gesture support

## 🐛 Known Issues

- Sample data ships with plain-text passwords (auto-hashed on first login)
- Some ESLint warnings (cross-file globals, non-breaking)
- Requires server for multi-user production use

## 📝 License

Private project - Lifestar Ambulance Service

## 👥 Support

For issues or questions, please refer to the documentation in the `docs/` directory.