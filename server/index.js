/**
 * Lifestar Ambulance Scheduling System — Express Server
 * 
 * Features:
 * - REST API with JWT authentication
 * - SQLite database with bcrypt password hashing
 * - HttpOnly cookie sessions with refresh tokens
 * - Server-side RBAC (role-based access control)
 * - CSP headers via Helmet
 * - Rate limiting and brute force protection
 * - Request logging and monitoring
 * - Graceful shutdown handling
 * - Serves static frontend files
 * 
 * @module server
 */

'use strict';

require('dotenv').config();

// ============================================
// STARTUP VALIDATION — must happen before anything else
// ============================================
const { validateEnv, SERVER, SECURITY } = require('./config');
validateEnv(); // throws in production if JWT_SECRET / COOKIE_SECRET are missing

// ============================================
// DEPENDENCIES
// ============================================
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { initializeDatabase, getDb } = require('./db/database');

// ============================================
// CONSTANTS — derived from centralised config.js
// ============================================
const CONSTANTS = {
    PORT: SERVER.PORT,
    NODE_ENV: SERVER.NODE_ENV,
    API_VERSION: SERVER.API_VERSION,

    // Body limits
    JSON_LIMIT: SERVER.JSON_LIMIT || '10mb',
    URL_ENCODED_LIMIT: '10mb',

    // Security — read from config.js, never hardcoded
    COOKIE_SECRET: SECURITY.COOKIE_SECRET,
    JWT_SECRET: SECURITY.JWT_SECRET,

    // Timeouts
    KEEP_ALIVE_TIMEOUT: SERVER.KEEP_ALIVE_TIMEOUT,
    HEADERS_TIMEOUT: SERVER.HEADERS_TIMEOUT,

    // Logging
    LOG_EXCLUDED_PATHS: SERVER.LOG_EXCLUDED_PATHS
};

// ============================================
// APP INITIALIZATION
// ============================================
const app = express();
const server = http.createServer(app);

// Configure server timeouts
server.keepAliveTimeout = CONSTANTS.KEEP_ALIVE_TIMEOUT;
server.headersTimeout = CONSTANTS.HEADERS_TIMEOUT;

// ============================================
// SECURITY HEADERS (Helmet)
// ============================================

/**
 * Content Security Policy Configuration
 * Strict but allows necessary inline scripts/styles for functionality
 */
const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline event handlers
        "https://sites.super.myninja.ai",
        "https://cdn.jsdelivr.net"
    ],
    scriptSrcAttr: ["'unsafe-inline'"],
    styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for dynamic styles
        "https://cdn.jsdelivr.net"
    ],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.app.super.myninja.ai",
        "https://*.super.myninja.ai",
        "https://cdn.jsdelivr.net"
    ],
    connectSrc: [
        "'self'",
        "https://*.app.super.myninja.ai",
        "https://*.super.myninja.ai"
    ],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    frameAncestors: [
        "'self'",
        "https://*.super.myninja.ai",
        "https://*.app.super.myninja.ai"
    ],
    // Only enforce HTTPS upgrade in production — in development this would break
    // all API calls by upgrading http://localhost to https://localhost (no cert)
    ...(CONSTANTS.NODE_ENV === 'production'
        ? { upgradeInsecureRequests: [] }
        : { upgradeInsecureRequests: null })
};

app.use(helmet({
    contentSecurityPolicy: {
        directives: cspDirectives
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: false, // Controlled by CSP frame-ancestors instead
    hidePoweredBy: true,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
}));

// Additional security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-Frame-Options controlled by CSP frame-ancestors (no DENY here)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.removeHeader('X-Powered-By');
    next();
});

// ============================================
// CORS CONFIGURATION
// ============================================

const corsOptions = {
    origin: CONSTANTS.NODE_ENV === 'production'
        ? (process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['https://lifestar-ambulance.com'])
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-CSRF-Token',
        'X-CSRF-Key',
        'X-Requested-With'
    ],
    exposedHeaders: [
        'X-CSRF-Token',
        'X-CSRF-Key',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// ============================================
// BODY PARSING
// ============================================

app.use(express.json({
    limit: CONSTANTS.JSON_LIMIT,
    strict: true // Only accept arrays and objects
}));

app.use(express.urlencoded({
    extended: true,
    limit: CONSTANTS.URL_ENCODED_LIMIT
}));

// ============================================
// COOKIE PARSING
// ============================================

app.use(cookieParser(CONSTANTS.COOKIE_SECRET));

// ============================================
// REQUEST LOGGING
// ============================================

/**
 * Request logging middleware
 */
app.use((req, res, next) => {
    const startTime = Date.now();
    
    // Skip logging for excluded paths
    const shouldLog = !CONSTANTS.LOG_EXCLUDED_PATHS.some(p => req.path.startsWith(p));
    
    // Log request
    if (shouldLog && CONSTANTS.NODE_ENV !== 'test') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    }
    
    // Log response time on finish
    res.on('finish', () => {
        if (shouldLog && CONSTANTS.NODE_ENV !== 'test') {
            const duration = Date.now() - startTime;
            const logLevel = res.statusCode >= 400 ? 'WARN' : 'INFO';
            console.log(`[${logLevel}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        }
    });
    
    next();
});

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// CSRF Protection (optional - generates tokens for all requests)
const { csrfOptional, csrfProtection } = require('./middleware/csrf');
app.use(csrfOptional);

// Input sanitization
const { sanitizeBody, checkSqlInjection, checkXss } = require('./middleware/validation');
app.use(sanitizeBody);

// Security checks
app.use(checkSqlInjection({ log: true }));
app.use(checkXss({ log: true }));

// Rate limiting for API routes — login has its own limiter inside auth.js,
// so we only apply the general API limiter here (not on /api/auth/login specifically)
const { apiLimiter } = require('./middleware/rate-limiter');
app.use('/api', apiLimiter);

// ============================================
// API ROUTES
// ============================================

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const scheduleRoutes = require('./routes/schedules');
const locationRoutes = require('./routes/locations');
const timeoffRoutes = require('./routes/timeoff');
const logRoutes = require('./routes/logs');
const incidentRoutes  = require('./routes/incidents');
const swapRoutes      = require('./routes/swaps');
const analyticsRoutes = require('./routes/analytics');
const trainingRoutes  = require('./routes/training');
const callinRoutes    = require('./routes/callins');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/timeoff', timeoffRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/swaps',     swapRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/training',  trainingRoutes);
app.use('/api/callins',   callinRoutes);

const permissionsRoutes = require('./routes/permissions');
const adminRoutes       = require('./routes/admin');
app.use('/api/permissions', permissionsRoutes);
app.use('/api/admin',       adminRoutes);
// ============================================

app.get('/api/health', (req, res) => {
    try {
        const db = getDb();
        const dbStatus = db ? 'connected' : 'disconnected';
        
        // Simple database query to verify connection
        if (db) {
            db.prepare('SELECT 1').get();
        }
        
        res.json({
            status: 'ok',
            version: CONSTANTS.API_VERSION,
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            environment: CONSTANTS.NODE_ENV,
            database: dbStatus,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: 'MB'
            }
        });
    } catch (err) {
        res.status(503).json({
            status: 'degraded',
            version: CONSTANTS.API_VERSION,
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// CONFIGURATION ENDPOINTS
// ============================================

/**
 * API keys status endpoint (server-side, authenticated)
 */
app.get('/api/config/keys',
    require('./middleware/auth').authenticate,
    require('./middleware/auth').authorize('super'),
    (req, res) => {
        res.json({
            twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
            sendgridConfigured: !!process.env.SENDGRID_API_KEY,
            groqConfigured: !!process.env.GROQ_API_KEY,
            jwtConfigured: !!process.env.JWT_SECRET,
            cookieSecretConfigured: !!process.env.COOKIE_SECRET
        });
    }
);

/**
 * Server configuration endpoint (admin only)
 */
app.get('/api/config/server',
    require('./middleware/auth').authenticate,
    require('./middleware/auth').authorize('super'),
    (req, res) => {
        res.json({
            version: CONSTANTS.API_VERSION,
            environment: CONSTANTS.NODE_ENV,
            nodeVersion: process.version,
            platform: process.platform,
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage()
        });
    }
);

// ============================================
// STATIC FILES (Frontend)
// ============================================

const staticRoot = path.join(__dirname, '..');

// Static file serving with caching
app.use(express.static(staticRoot, {
    index: 'index.html',
    extensions: ['html'],
    maxAge: CONSTANTS.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true
}));

// ============================================
// ERROR HANDLING
// ============================================

// API 404 handler
app.use('/api', (req, res) => {
    res.status(404).json({
        error: 'API endpoint not found',
        code: 'NOT_FOUND',
        path: req.path
    });
});

// SPA fallback — serve index.html for non-API routes
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(staticRoot, 'index.html'), (err) => {
            if (err) {
                next(err);
            }
        });
    } else {
        next();
    }
});

// Global error handler
app.use((err, req, res, _next) => {
    // Log error details
    console.error('Server error:', {
        message: err.message,
        stack: CONSTANTS.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });
    
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;
    
    // Send response
    res.status(statusCode).json({
        error: CONSTANTS.NODE_ENV === 'production' && statusCode === 500
            ? 'Internal server error'
            : err.message || 'Internal server error',
        code: err.code || 'SERVER_ERROR',
        ...(CONSTANTS.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================
// UNHANDLED REJECTION/EXCEPTION HANDLERS
// ============================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit in development for easier debugging
    if (CONSTANTS.NODE_ENV === 'production') {
        console.error('Shutting down due to unhandled rejection...');
        gracefulShutdown('UNHANDLED_REJECTION');
    }
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Always exit on uncaught exception
    console.error('Shutting down due to uncaught exception...');
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 * @param {string} signal - Shutdown signal
 */
function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n[SHUTDOWN] ${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close((err) => {
        if (err) {
            console.error('[SHUTDOWN] Error closing server:', err);
            process.exit(1);
        }
        
        console.log('[SHUTDOWN] HTTP server closed');
        
        // Close database connection
        try {
            const db = getDb();
            if (db) {
                db.close();
                console.log('[SHUTDOWN] Database connection closed');
            }
        } catch (dbErr) {
            console.error('[SHUTDOWN] Error closing database:', dbErr);
        }
        
        console.log('[SHUTDOWN] Graceful shutdown complete');
        process.exit(0);
    });
    
    // Force shutdown after timeout
    setTimeout(() => {
        console.error('[SHUTDOWN] Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// STARTUP
// ============================================

/**
 * Initialize and start the server
 */
async function startServer() {
    try {
        // Initialize database
        console.log('[STARTUP] Initializing database...');
        await initializeDatabase();
        console.log('[STARTUP] Database initialized');
        
        // Start server
        server.listen(CONSTANTS.PORT, '0.0.0.0', () => {
            console.log('');
            console.log('🚑 Lifestar Ambulance Scheduling System');
            console.log('=========================================');
            console.log(`🌐 Server:    http://localhost:${CONSTANTS.PORT}`);
            console.log(`📡 API:       http://localhost:${CONSTANTS.PORT}/api/health`);
            console.log(`🔐 Auth:      JWT + HttpOnly cookies`);
            console.log(`📁 Database:  SQLite (lifestar.db)`);
            console.log(`🛡️  Security:  Helmet CSP + RBAC + bcrypt`);
            console.log(`📁 Static:    ${staticRoot}`);
            console.log(`🌍 Environment: ${CONSTANTS.NODE_ENV}`);
            console.log(`📝 Version:   ${CONSTANTS.API_VERSION}`);
            console.log('=========================================');
            console.log('');
        });
        
    } catch (err) {
        console.error('[STARTUP] Failed to start server:', err);
        process.exit(1);
    }
}

// Start the server
startServer();

// ============================================
// EXPORTS
// ============================================

module.exports = { app, server, CONSTANTS };