const http = require('http');
const fs = require('fs');
const path = require('path');
const { syncToGoogleSheets, SPREADSHEET_ID } = require('./sync_service');

const PORT = 8080;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'teams_data.json');
const VERCEL_API = 'https://teams-division.vercel.app';

let lastLocalTimestamp = 0;
let lastCloudTimestamp = 0;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // API: GET /api/state
    if (pathname === '/api/state' && req.method === 'GET') {
        if (fs.existsSync(DATA_FILE)) {
            try {
                const data = fs.readFileSync(DATA_FILE, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(data);
                return;
            } catch (err) {
                console.error('Error reading data file:', err);
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ exists: false }));
        return;
    }

    // API: POST /api/save
    if (pathname === '/api/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                lastLocalTimestamp = Date.now();
                fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
                console.log(`[${new Date().toLocaleTimeString()}] Saved teams state to ${DATA_FILE}`);

                // Return HTTP response immediately for high-speed client feel
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, timestamp: lastLocalTimestamp }));

                // 1. Sync to Google Sheets in background
                setTimeout(() => {
                    syncToGoogleSheets(parsed);
                }, 50);

                // 2. Sync to Vercel Cloud in background
                setTimeout(async () => {
                    try {
                        await fetch(`${VERCEL_API}/api/save`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(parsed)
                        });
                        console.log(`[${new Date().toLocaleTimeString()}] Synchronized state with Vercel Cloud`);
                    } catch (e) {
                        // Vercel sync fallback
                    }
                }, 100);

            } catch (err) {
                console.error('Error saving state:', err);
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: GET/POST /api/sync-sheet (Trigger explicit sync to Google Sheets)
    if (pathname === '/api/sync-sheet') {
        const syncRes = syncToGoogleSheets();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(syncRes));
        return;
    }

    // Static File Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
        safePath = '/Team division.html';
    }

    const filePath = path.join(ROOT_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + pathname);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

// Periodic Cloud Sync (Polls Vercel Cloud every 20 seconds to sync changes made on mobile)
setInterval(async () => {
    try {
        const cloudRes = await fetch(`${VERCEL_API}/api/state`, { cache: 'no-store' });
        if (cloudRes.ok) {
            const cloudData = await cloudRes.json();
            if (cloudData && cloudData.exists !== false && Array.isArray(cloudData.groups)) {
                // Check if cloud data is newer or different from local
                const localRaw = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : '';
                const cloudJsonStr = JSON.stringify(cloudData, null, 2);
                if (localRaw !== cloudJsonStr && (Date.now() - lastLocalTimestamp > 25000)) {
                    console.log(`[Cloud Sync] Detected new state from Vercel Cloud. Syncing locally & to Google Sheets...`);
                    fs.writeFileSync(DATA_FILE, cloudJsonStr, 'utf8');
                    syncToGoogleSheets(cloudData);
                }
            }
        }
    } catch (e) {
        // Network or offline check
    }
}, 20000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 Team Division Server running at http://localhost:${PORT}/`);
    console.log(`💾 Persistent Local Data: ${DATA_FILE}`);
    console.log(`📊 Google Sheets DB ID: ${SPREADSHEET_ID}`);
    console.log(`☁️ Connected to Vercel: ${VERCEL_API}`);
    console.log(`=================================================`);
});
