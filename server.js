/**
 * Ethiopost Content Operations & Approval System
 * Lightweight Local HTTP Server & REST API (Zero Dependencies)
 * Runs natively on Node 22+ using node:http and node:sqlite
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');
const db = require('./db.js');

const PORT = process.env.PORT || 3050;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure db is initialized
db.initDb();

// Active session tracking (In-memory or header/cookie based)
let activeUserId = 'usr_manager'; // Default persona: Marketing Director

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 150 * 1024 * 1024) { // 30MB limit for artwork uploads
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', err => reject(err));
  });
}

function getSessionUser(req) {
  const customHeader = req.headers['x-user-id'];
  if (customHeader) {
    const user = db.getUserById(customHeader);
    if (user) return user;
  }
  return db.getUserById(activeUserId) || db.getUsers()[0];
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id'
    });
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const currentUser = getSessionUser(req);

  // -------------------------------------------------------------
  // REST API ROUTER (/api/...)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Current Session & User Management
      if (pathname === '/api/auth/current' && method === 'GET') {
        const allUsers = db.getUsers();
        return sendJson(res, 200, {
          user: currentUser,
          available_users: allUsers
        });
      }

      if (pathname === '/api/auth/switch' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body.user_id) return sendJson(res, 400, { error: 'user_id is required' });
        const target = db.getUserById(body.user_id);
        if (!target) return sendJson(res, 404, { error: 'User not found' });
        activeUserId = target.id;
        return sendJson(res, 200, { success: true, user: target });
      }

      if (pathname === '/api/users' && method === 'GET') {
        return sendJson(res, 200, db.getUsers());
      }

      if (pathname === '/api/users' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body.name || !body.email || !body.role) {
          return sendJson(res, 400, { error: 'Name, email, and role are required.' });
        }
        const created = db.createUser(body);
        return sendJson(res, 201, created);
      }

      // 2. Platforms
      if (pathname === '/api/platforms' && method === 'GET') {
        return sendJson(res, 200, db.getPlatforms());
      }

      // 3. Content Types
      if (pathname === '/api/content-types' && method === 'GET') {
        return sendJson(res, 200, db.getContentTypes());
      }

      // 4. Campaigns
      if (pathname === '/api/campaigns' && method === 'GET') {
        const platformId = parsedUrl.query.platform_id || null;
        return sendJson(res, 200, db.getCampaigns(platformId));
      }

      if (pathname === '/api/campaigns' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body.name || !body.platform_id) {
          return sendJson(res, 400, { error: 'Campaign name and platform are required.' });
        }
        const campaign = db.createCampaign(body, currentUser.id);
        return sendJson(res, 201, campaign);
      }

      // 5. Dashboard KPIs & Executive Overview
      if (pathname === '/api/dashboard/kpis' && method === 'GET') {
        const filters = {
          platform_id: parsedUrl.query.platform_id,
          campaign_id: parsedUrl.query.campaign_id,
          date_filter: parsedUrl.query.date_filter
        };
        const kpis = db.getDashboardKPIs(filters);
        return sendJson(res, 200, kpis);
      }

      // 6. My Tasks (Role-tailored workspace)
      if (pathname === '/api/my-tasks' && method === 'GET') {
        const tasks = db.getMyTasks(currentUser);
        return sendJson(res, 200, tasks);
      }

      // 7. Content List & Querying
      if (pathname === '/api/content' && method === 'GET') {
        const filters = {
          platform_id: parsedUrl.query.platform_id,
          campaign_id: parsedUrl.query.campaign_id,
          status: parsedUrl.query.status,
          priority: parsedUrl.query.priority,
          date_filter: parsedUrl.query.date_filter,
          search: parsedUrl.query.search,
          creator_id: parsedUrl.query.creator_id,
          designer_id: parsedUrl.query.designer_id,
          approver_id: parsedUrl.query.approver_id
        };
        const items = db.getContentList(filters);
        return sendJson(res, 200, items);
      }

      // 8. Content Creation
      if (pathname === '/api/content' && method === 'POST') {
        const body = await parseJsonBody(req);
        try {
          const created = db.createContent(body, currentUser.id);
          return sendJson(res, 201, created);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // 9. Single Content Detail, Status Change, Artwork Upload, Publishing
      const contentIdMatch = pathname.match(/^\/api\/content\/([a-zA-Z0-9_-]+)$/);
      if (contentIdMatch && method === 'GET') {
        const contentId = contentIdMatch[1];
        const item = db.getContentById(contentId);
        if (!item) return sendJson(res, 404, { error: 'Content not found' });
        return sendJson(res, 200, item);
      }

      if (contentIdMatch && method === 'PUT') {
        const contentId = contentIdMatch[1];
        const body = await parseJsonBody(req);
        try {
          const updated = db.updateContent(contentId, body, currentUser.id);
          return sendJson(res, 200, updated);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // Status Change (Workflow state machine)
      const statusMatch = pathname.match(/^\/api\/content\/([a-zA-Z0-9_-]+)\/status$/);
      if (statusMatch && method === 'POST') {
        const contentId = statusMatch[1];
        const body = await parseJsonBody(req);
        if (!body.status) return sendJson(res, 400, { error: 'Status is required' });

        try {
          const updated = db.changeContentStatus(contentId, body.status, currentUser.id, body.comment || '');
          return sendJson(res, 200, updated);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // Artwork File Upload (Version Control Engine)
      const artworkMatch = pathname.match(/^\/api\/content\/([a-zA-Z0-9_-]+)\/artwork$/);
      if (artworkMatch && method === 'POST') {
        const contentId = artworkMatch[1];
        const body = await parseJsonBody(req);

        if (!body.file_name) {
          return sendJson(res, 400, { error: 'file_name is required' });
        }

        const current = db.getContentById(contentId);
        if (!current) return sendJson(res, 404, { error: 'Content not found' });

        const maxVerRow = db.getDb().prepare('SELECT MAX(version) as max_v FROM files WHERE content_id = ?').get(contentId);
        const nextVer = (maxVerRow && maxVerRow.max_v ? maxVerRow.max_v : 0) + 1;

        const platFolder = current.platform_code || 'ethiopost';
        const relUploadDir = path.join('uploads', platFolder, current.campaign_id || 'general', contentId, `v${nextVer}`);
        const absUploadDir = path.join(__dirname, relUploadDir);

        if (!fs.existsSync(absUploadDir)) {
          fs.mkdirSync(absUploadDir, { recursive: true });
        }

        const safeFilename = path.basename(body.file_name).replace(/[^a-zA-Z0-9_.-]/g, '_');
        const absFilePath = path.join(absUploadDir, safeFilename);
        const webPath = `/${relUploadDir}/${safeFilename}`.replace(/\\/g, '/');

        // If base64 content was provided
        if (body.base64) {
          const base64Data = body.base64.replace(/^data:[^;]+;base64,/, '');
          fs.writeFileSync(absFilePath, Buffer.from(base64Data, 'base64'));
        } else if (body.svg_content) {
          fs.writeFileSync(absFilePath, body.svg_content, 'utf8');
        } else {
          // Generate realistic placeholder artwork with brand motif
          const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="100%" height="100%">
            <rect width="1080" height="1080" fill="${current.platform_color || '#28387F'}" />
            <rect x="0" y="0" width="1080" height="16" fill="#EFA61F" />
            <g transform="translate(80, 80)">
              <rect width="56" height="56" rx="12" fill="#EFA61F" />
              <text x="76" y="38" font-family="sans-serif" font-size="32" font-weight="900" fill="#FFFFFF">ETHIOPOST</text>
              <text x="76" y="58" font-family="sans-serif" font-size="16" font-weight="600" fill="#EFA61F">${(current.platform_name || 'ETHIOPOST').toUpperCase()}</text>
            </g>
            <rect x="80" y="200" width="920" height="680" rx="24" fill="#FFFFFF" />
            <text x="540" y="540" font-family="sans-serif" font-size="36" font-weight="bold" fill="#0F172A" text-anchor="middle">${current.title.substring(0, 45)}</text>
            <text x="540" y="600" font-family="sans-serif" font-size="22" fill="#64748B" text-anchor="middle">Version V${nextVer} Design Asset</text>
          </svg>`;
          fs.writeFileSync(absFilePath, sampleSvg, 'utf8');
        }

        const stat = fs.statSync(absFilePath);
        const fileData = {
          file_name: safeFilename,
          file_path: webPath,
          file_type: body.file_type || MIME_TYPES[path.extname(safeFilename).toLowerCase()] || 'image/jpeg',
          file_size: stat.size
        };

        const updated = db.addArtworkFile(contentId, fileData, currentUser.id, body.note || `Artwork V${nextVer}`);
        return sendJson(res, 201, updated);
      }

      // Mark Published
      const publishMatch = pathname.match(/^\/api\/content\/([a-zA-Z0-9_-]+)\/publish$/);
      if (publishMatch && method === 'POST') {
        const contentId = publishMatch[1];
        const body = await parseJsonBody(req);
        try {
          const updated = db.publishContent(contentId, body, currentUser.id);
          return sendJson(res, 200, updated);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // Add Comment
      const commentMatch = pathname.match(/^\/api\/content\/([a-zA-Z0-9_-]+)\/comment$/);
      if (commentMatch && method === 'POST') {
        const contentId = commentMatch[1];
        const body = await parseJsonBody(req);
        if (!body.comment || !body.comment.trim()) {
          return sendJson(res, 400, { error: 'Comment text is required' });
        }
        const created = db.addComment(contentId, body.comment, body.comment_type || 'general', currentUser.id, body.version_reference || null);
        return sendJson(res, 201, created);
      }

      // 10. Reports & Analytics
      if (pathname === '/api/reports' && method === 'GET') {
        const platformId = parsedUrl.query.platform_id || null;
        const dateRange = parsedUrl.query.date_range || 'all';
        const data = db.getReportsData(platformId, dateRange);
        return sendJson(res, 200, data);
      }

      // 11. Notifications
      if (pathname === '/api/notifications' && method === 'GET') {
        const notifs = db.getNotifications(currentUser.id, parsedUrl.query.unread === '1');
        return sendJson(res, 200, notifs);
      }

      const notifReadMatch = pathname.match(/^\/api\/notifications\/([a-zA-Z0-9_-]+)\/read$/);
      if (notifReadMatch && method === 'POST') {
        db.markNotificationRead(notifReadMatch[1]);
        return sendJson(res, 200, { success: true });
      }

      if (pathname === '/api/notifications/read-all' && method === 'POST') {
        db.markAllNotificationsRead(currentUser.id);
        return sendJson(res, 200, { success: true });
      }

      // 12. Audit Logs
      if (pathname === '/api/audit-logs' && method === 'GET') {
        const limit = parseInt(parsedUrl.query.limit, 10) || 100;
        return sendJson(res, 200, db.getAuditLogs(limit));
      }

      // API 404
      return sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
    }
  }

  // -------------------------------------------------------------
  // STATIC FILE SERVING (public/ and uploads/)
  // -------------------------------------------------------------
  let cleanUrl = pathname;
  if (cleanUrl === '/' || cleanUrl === '') {
    cleanUrl = '/index.html';
  }

  // Determine base directory
  let baseDir = PUBLIC_DIR;
  if (cleanUrl.startsWith('/uploads/')) {
    baseDir = __dirname; // Serves /uploads directly from root
  }

  const safePath = path.normalize(cleanUrl).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(baseDir, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Single Page Application Fallback for front-end routes
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.stat(indexPath, (idxErr, idxStats) => {
        if (!idxErr && idxStats.isFile()) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': idxStats.size,
            'Cache-Control': 'no-cache'
          });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`404 Not Found: ${cleanUrl}`);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isVideo = contentType.startsWith('video/');

    if (isVideo && req.headers.range) {
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? Math.min(parseInt(parts[1], 10), stats.size - 1) : stats.size - 1;

      if (start >= stats.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      fileStream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('============================================================');
  console.log('  ETHIOPOST CONTENT OPERATIONS & APPROVAL SYSTEM');
  console.log('============================================================');
  console.log(`  Brand: Ethiopost | Platforms: Ethiopost, Post Gebeya, Post Finance`);
  console.log(`  Server running at: http://localhost:${PORT}/`);
  console.log(`  Ready for pair testing and executive review.`);
  console.log('============================================================');
});

module.exports = server;
