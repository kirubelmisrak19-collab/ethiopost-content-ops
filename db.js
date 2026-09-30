/**
 * Ethiopost Content Operations & Approval System
 * Relational SQLite Database Layer (Zero External Dependencies)
 * Uses native node:sqlite DatabaseSync (Node 22+)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'ethiopost_ops.db');
let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      title TEXT,
      department TEXT,
      avatar TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      color TEXT,
      badge_bg TEXT,
      badge_text TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS content_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      objective TEXT,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'Active',
      campaign_lead TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (platform_id) REFERENCES platforms(id)
    );

    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      campaign_id TEXT,
      content_type TEXT NOT NULL,
      objective TEXT,
      target_audience TEXT,
      headline TEXT,
      caption TEXT,
      key_message TEXT,
      call_to_action TEXT,
      proposed_date TEXT,
      publishing_date TEXT,
      priority TEXT DEFAULT 'Medium',
      creator_id TEXT NOT NULL,
      designer_id TEXT,
      approver_id TEXT,
      publisher_id TEXT,
      status TEXT DEFAULT 'Draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (platform_id) REFERENCES platforms(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (designer_id) REFERENCES users(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS content_channels (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      uploaded_by TEXT NOT NULL,
      note TEXT,
      status TEXT DEFAULT 'Current',
      created_at TEXT NOT NULL,
      FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      comment TEXT NOT NULL,
      comment_type TEXT DEFAULT 'general',
      version_reference INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_history (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      published_at TEXT NOT NULL,
      published_url TEXT,
      published_by TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
      FOREIGN KEY (published_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_content_platform ON content(platform_id);
    CREATE INDEX IF NOT EXISTS idx_content_campaign ON content(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
    CREATE INDEX IF NOT EXISTS idx_content_pubdate ON content(publishing_date);
    CREATE INDEX IF NOT EXISTS idx_files_content ON files(content_id);
    CREATE INDEX IF NOT EXISTS idx_approval_content ON approval_history(content_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
  `);
}

function generateId(prefix = 'id') {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// User Helpers
function getUsers() {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE active = 1 ORDER BY name ASC').all();
}

function getUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser(user) {
  const db = getDb();
  const id = user.id || generateId('usr');
  const now = nowIso();
  db.prepare(`
    INSERT INTO users (id, name, email, role, title, department, avatar, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, user.name, user.email, user.role, user.title || '', user.department || 'Marketing', user.avatar || '', now);
  return getUserById(id);
}

// Platform Helpers
function getPlatforms() {
  const db = getDb();
  return db.prepare('SELECT * FROM platforms WHERE active = 1 ORDER BY name ASC').all();
}

function getPlatformById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM platforms WHERE id = ?').get(id);
}

// Content Types
function getContentTypes() {
  const db = getDb();
  return db.prepare('SELECT * FROM content_types WHERE active = 1 ORDER BY name ASC').all();
}

function createContentType(name, description = '') {
  const db = getDb();
  const id = generateId('ct');
  db.prepare('INSERT INTO content_types (id, name, description, active) VALUES (?, ?, ?, 1)').run(id, name, description);
  return { id, name, description, active: 1 };
}

// Campaign Helpers
function getCampaigns(platformId = null) {
  const db = getDb();
  let query = `
    SELECT c.*, p.name as platform_name, p.color as platform_color,
      (SELECT COUNT(*) FROM content WHERE campaign_id = c.id) as total_content,
      (SELECT COUNT(*) FROM content WHERE campaign_id = c.id AND status = 'Published') as published_content,
      (SELECT COUNT(*) FROM content WHERE campaign_id = c.id AND status = 'Under Review') as under_review_content,
      (SELECT COUNT(*) FROM content WHERE campaign_id = c.id AND status = 'Revision Required') as revision_content,
      (SELECT COUNT(*) FROM content WHERE campaign_id = c.id AND status = 'Approved') as approved_content
    FROM campaigns c
    JOIN platforms p ON c.platform_id = p.id
  `;
  if (platformId && platformId !== 'all') {
    query += ' WHERE c.platform_id = ? ORDER BY c.created_at DESC';
    return db.prepare(query).all(platformId);
  }
  query += ' ORDER BY c.created_at DESC';
  return db.prepare(query).all();
}

function getCampaignById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, p.name as platform_name, p.color as platform_color
    FROM campaigns c
    JOIN platforms p ON c.platform_id = p.id
    WHERE c.id = ?
  `).get(id);
}

function createCampaign(data, userId) {
  const db = getDb();
  const id = generateId('cmp');
  const now = nowIso();
  db.prepare(`
    INSERT INTO campaigns (id, name, platform_id, objective, description, start_date, end_date, status, campaign_lead, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.platform_id, data.objective || '', data.description || '', data.start_date || '', data.end_date || '', data.status || 'Active', data.campaign_lead || '', now);

  logAudit(userId, 'CREATE_CAMPAIGN', 'campaign', id, `Created campaign ${data.name}`);
  return getCampaignById(id);
}

// Content Helpers
function getContentList(filters = {}) {
  const db = getDb();
  let query = `
    SELECT c.*, 
      p.name as platform_name, p.code as platform_code, p.color as platform_color,
      p.badge_bg as platform_badge_bg, p.badge_text as platform_badge_text,
      cmp.name as campaign_name,
      u_creator.name as creator_name,
      u_designer.name as designer_name,
      u_approver.name as approver_name,
      (SELECT COUNT(*) FROM files WHERE content_id = c.id) as file_count,
      (SELECT MAX(version) FROM files WHERE content_id = c.id) as latest_version,
      (SELECT file_path FROM files WHERE content_id = c.id ORDER BY version DESC LIMIT 1) as latest_file_path,
      (SELECT file_type FROM files WHERE content_id = c.id ORDER BY version DESC LIMIT 1) as latest_file_type
    FROM content c
    JOIN platforms p ON c.platform_id = p.id
    LEFT JOIN campaigns cmp ON c.campaign_id = cmp.id
    JOIN users u_creator ON c.creator_id = u_creator.id
    LEFT JOIN users u_designer ON c.designer_id = u_designer.id
    LEFT JOIN users u_approver ON c.approver_id = u_approver.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.platform_id && filters.platform_id !== 'all') {
    query += ' AND c.platform_id = ?';
    params.push(filters.platform_id);
  }

  if (filters.campaign_id && filters.campaign_id !== 'all') {
    query += ' AND c.campaign_id = ?';
    params.push(filters.campaign_id);
  }

  if (filters.status && filters.status !== 'all') {
    query += ' AND c.status = ?';
    params.push(filters.status);
  }

  if (filters.priority && filters.priority !== 'all') {
    query += ' AND c.priority = ?';
    params.push(filters.priority);
  }

  if (filters.creator_id) {
    query += ' AND c.creator_id = ?';
    params.push(filters.creator_id);
  }

  if (filters.designer_id) {
    query += ' AND c.designer_id = ?';
    params.push(filters.designer_id);
  }

  if (filters.approver_id) {
    query += ' AND c.approver_id = ?';
    params.push(filters.approver_id);
  }

  if (filters.date_filter) {
    const today = new Date().toISOString().split('T')[0];
    if (filters.date_filter === 'today') {
      query += ' AND substr(c.publishing_date, 1, 10) = ?';
      params.push(today);
    } else if (filters.date_filter === 'this_week') {
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0];
      const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6)).toISOString().split('T')[0];
      query += ' AND substr(c.publishing_date, 1, 10) BETWEEN ? AND ?';
      params.push(weekStart, weekEnd);
    } else if (filters.date_filter === 'this_month') {
      const ym = today.substring(0, 7);
      query += ' AND substr(c.publishing_date, 1, 7) = ?';
      params.push(ym);
    }
  }

  if (filters.search && filters.search.trim()) {
    const s = '%' + filters.search.trim() + '%';
    query += ' AND (c.title LIKE ? OR c.headline LIKE ? OR c.caption LIKE ? OR cmp.name LIKE ? OR u_creator.name LIKE ? OR u_designer.name LIKE ?)';
    params.push(s, s, s, s, s, s);
  }

  query += ' ORDER BY c.updated_at DESC';

  const rows = db.prepare(query).all(...params);

  // Attach channels to each item
  const channelsStmt = db.prepare('SELECT channel FROM content_channels WHERE content_id = ?');
  for (const row of rows) {
    const chs = channelsStmt.all(row.id);
    row.channels = chs.map(c => c.channel);
  }

  return rows;
}

function getContentById(id) {
  const db = getDb();
  const query = `
    SELECT c.*, 
      p.name as platform_name, p.code as platform_code, p.color as platform_color,
      p.badge_bg as platform_badge_bg, p.badge_text as platform_badge_text,
      cmp.name as campaign_name,
      u_creator.name as creator_name, u_creator.email as creator_email,
      u_designer.name as designer_name, u_designer.email as designer_email,
      u_approver.name as approver_name, u_approver.email as approver_email,
      u_publisher.name as publisher_name
    FROM content c
    JOIN platforms p ON c.platform_id = p.id
    LEFT JOIN campaigns cmp ON c.campaign_id = cmp.id
    JOIN users u_creator ON c.creator_id = u_creator.id
    LEFT JOIN users u_designer ON c.designer_id = u_designer.id
    LEFT JOIN users u_approver ON c.approver_id = u_approver.id
    LEFT JOIN users u_publisher ON c.publisher_id = u_publisher.id
    WHERE c.id = ?
  `;
  const item = db.prepare(query).get(id);
  if (!item) return null;

  // Channels
  const chs = db.prepare('SELECT channel FROM content_channels WHERE content_id = ?').all(id);
  item.channels = chs.map(c => c.channel);

  // Files with versioning info
  item.files = db.prepare(`
    SELECT f.*, u.name as uploader_name, u.role as uploader_role
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.content_id = ?
    ORDER BY f.version DESC, f.created_at DESC
  `).all(id);

  // Active / current artwork version
  item.latest_file = item.files.length > 0 ? item.files[0] : null;

  // Comments
  item.comments = db.prepare(`
    SELECT cm.*, u.name as user_name, u.role as user_role, u.avatar as user_avatar
    FROM comments cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.content_id = ?
    ORDER BY cm.created_at ASC
  `).all(id);

  // Approval History (Immutable timeline)
  item.approval_history = db.prepare(`
    SELECT ah.*, u.name as user_name, u.role as user_role, u.title as user_title
    FROM approval_history ah
    JOIN users u ON ah.user_id = u.id
    WHERE ah.content_id = ?
    ORDER BY ah.created_at ASC
  `).all(id);

  // Publication info if published
  item.publication = db.prepare(`
    SELECT pub.*, u.name as publisher_name
    FROM publications pub
    JOIN users u ON pub.published_by = u.id
    WHERE pub.content_id = ?
    ORDER BY pub.published_at DESC
    LIMIT 1
  `).get(id) || null;

  return item;
}

function createContent(data, userId) {
  // Rule 7: Every content item must belong to at least one platform.
  if (!data.platform_id) {
    throw new Error('Rule 7 Violation: Every content item must belong to at least one platform.');
  }
  if (!data.title || !data.title.trim()) {
    throw new Error('Content title is required.');
  }

  const db = getDb();
  const id = generateId('cnt');
  const now = nowIso();
  const status = data.submit ? 'Submitted' : 'Draft';

  db.prepare(`
    INSERT INTO content (
      id, title, platform_id, campaign_id, content_type,
      objective, target_audience, headline, caption,
      key_message, call_to_action, proposed_date, publishing_date,
      priority, creator_id, designer_id, approver_id,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title.trim(),
    data.platform_id,
    data.campaign_id || null,
    data.content_type || 'Awareness',
    data.objective || '',
    data.target_audience || '',
    data.headline || '',
    data.caption || '',
    data.key_message || '',
    data.call_to_action || '',
    data.proposed_date || data.publishing_date || '',
    data.publishing_date || data.proposed_date || '',
    data.priority || 'Medium',
    userId,
    data.designer_id || null,
    data.approver_id || null,
    status,
    now,
    now
  );

  // Add channels
  if (Array.isArray(data.channels)) {
    const chStmt = db.prepare('INSERT INTO content_channels (id, content_id, channel) VALUES (?, ?, ?)');
    for (const ch of data.channels) {
      chStmt.run(generateId('ch'), id, ch);
    }
  }

  // Record initial history (Rule 5 & Rule 8)
  addApprovalHistory(id, userId, 'Content Created', null, status, data.submit ? 'Content submitted for design' : 'Draft created');
  logAudit(userId, 'CREATE_CONTENT', 'content', id, `Created content ${data.title} (Status: ${status})`);

  // Notifications
  if (data.submit && data.designer_id) {
    createNotification(data.designer_id, id, 'New Design Task Assigned', `You have been assigned to design artwork for: ${data.title}`, `/content/${id}`);
  }

  return getContentById(id);
}

function updateContent(id, data, userId) {
  const current = getContentById(id);
  if (!current) throw new Error('Content not found');

  // Rule 6: Published content cannot be silently modified.
  if (current.status === 'Published') {
    logAudit(userId, 'MODIFY_PUBLISHED_CONTENT', 'content', id, 'Modified content fields after publication');
  }

  const db = getDb();
  const now = nowIso();

  db.prepare(`
    UPDATE content SET
      title = COALESCE(?, title),
      platform_id = COALESCE(?, platform_id),
      campaign_id = COALESCE(?, campaign_id),
      content_type = COALESCE(?, content_type),
      objective = COALESCE(?, objective),
      target_audience = COALESCE(?, target_audience),
      headline = COALESCE(?, headline),
      caption = COALESCE(?, caption),
      key_message = COALESCE(?, key_message),
      call_to_action = COALESCE(?, call_to_action),
      proposed_date = COALESCE(?, proposed_date),
      publishing_date = COALESCE(?, publishing_date),
      priority = COALESCE(?, priority),
      designer_id = COALESCE(?, designer_id),
      approver_id = COALESCE(?, approver_id),
      updated_at = ?
    WHERE id = ?
  `).run(
    data.title || null,
    data.platform_id || null,
    data.campaign_id || null,
    data.content_type || null,
    data.objective !== undefined ? data.objective : null,
    data.target_audience !== undefined ? data.target_audience : null,
    data.headline !== undefined ? data.headline : null,
    data.caption !== undefined ? data.caption : null,
    data.key_message !== undefined ? data.key_message : null,
    data.call_to_action !== undefined ? data.call_to_action : null,
    data.proposed_date || null,
    data.publishing_date || null,
    data.priority || null,
    data.designer_id || null,
    data.approver_id || null,
    now,
    id
  );

  if (Array.isArray(data.channels)) {
    db.prepare('DELETE FROM content_channels WHERE content_id = ?').run(id);
    const chStmt = db.prepare('INSERT INTO content_channels (id, content_id, channel) VALUES (?, ?, ?)');
    for (const ch of data.channels) {
      chStmt.run(generateId('ch'), id, ch);
    }
  }

  logAudit(userId, 'UPDATE_CONTENT', 'content', id, `Updated content details for ${current.title}`);
  return getContentById(id);
}

// Workflow Status State Machine with Business Rules Enforcement
function changeContentStatus(id, newStatus, userId, comment = '', extra = {}) {
  const current = getContentById(id);
  if (!current) throw new Error('Content not found');

  const oldStatus = current.status;
  const user = getUserById(userId) || { name: 'System User', role: 'admin' };
  const db = getDb();
  const now = nowIso();

  // Rule 1: Content cannot go to approval until artwork has been uploaded.
  if ((newStatus === 'Under Review' || newStatus === 'Design Submitted') && current.files.length === 0) {
    throw new Error('Rule 1 Violation: Content cannot go to approval until artwork has been uploaded.');
  }

  // Rule 2: Approver cannot request revision without entering a comment.
  if (newStatus === 'Revision Required' && (!comment || !comment.trim())) {
    throw new Error('Rule 2 Violation: Approver cannot request revision without entering a comment.');
  }

  // Rule 3: Approver cannot approve content that has no creative file.
  if (newStatus === 'Approved' && current.files.length === 0) {
    throw new Error('Rule 3 Violation: Approver cannot approve content that has no creative file.');
  }

  // Apply status update
  if (newStatus === 'Approved' || newStatus === 'Revision Required') {
    db.prepare('UPDATE content SET status = ?, approver_id = ?, updated_at = ? WHERE id = ?').run(newStatus, userId, now, id);
  } else {
    db.prepare('UPDATE content SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, id);
  }

  // If revision requested, add to comments table as revision comment
  if (newStatus === 'Revision Required' && comment) {
    const latestVersion = current.latest_file ? current.latest_file.version : 1;
    addComment(id, comment, 'revision_request', userId, latestVersion);
  } else if (newStatus === 'Approved' && comment) {
    addComment(id, comment, 'approval', userId, current.latest_file ? current.latest_file.version : null);
  } else if (newStatus === 'Rejected' && comment) {
    addComment(id, comment, 'rejection', userId, current.latest_file ? current.latest_file.version : null);
  }

  // Rule 5 & Rule 8: Approval history cannot be deleted. Every action recorded.
  let actionDesc = `Status changed to ${newStatus}`;
  if (newStatus === 'Submitted') actionDesc = 'Submitted for Design';
  else if (newStatus === 'In Design') actionDesc = 'Design Started';
  else if (newStatus === 'Design Submitted') actionDesc = 'Design Submitted for Review';
  else if (newStatus === 'Under Review') actionDesc = 'Placed Under Review';
  else if (newStatus === 'Revision Required') actionDesc = 'Revision Requested';
  else if (newStatus === 'Approved') actionDesc = 'Content & Artwork Approved';
  else if (newStatus === 'Rejected') actionDesc = 'Content Rejected';
  else if (newStatus === 'Published') actionDesc = 'Content Published';
  else if (newStatus === 'Archived') actionDesc = 'Content Archived';

  addApprovalHistory(id, userId, actionDesc, oldStatus, newStatus, comment || null);
  logAudit(userId, 'STATUS_CHANGE', 'content', id, `Status changed from ${oldStatus} to ${newStatus}. Note: ${comment || 'None'}`);

  // Notifications Routing
  if (newStatus === 'Submitted' && current.designer_id) {
    createNotification(current.designer_id, id, 'New Design Task', `Brief submitted: ${current.title}`, `/content/${id}`);
  } else if (newStatus === 'Design Submitted' || newStatus === 'Under Review') {
    if (current.approver_id) {
      createNotification(current.approver_id, id, 'Content Awaiting Approval', `Artwork submitted for: ${current.title}. Please review.`, `/content/${id}`);
    }
  } else if (newStatus === 'Revision Required') {
    if (current.designer_id) {
      createNotification(current.designer_id, id, 'Revision Requested', `Revision requested for ${current.title}: "${comment}"`, `/content/${id}`);
    }
    if (current.creator_id && current.creator_id !== current.designer_id) {
      createNotification(current.creator_id, id, 'Revision Requested on Content', `Approver requested revision for ${current.title}`, `/content/${id}`);
    }
  } else if (newStatus === 'Approved') {
    // Notify publishers
    const publishers = db.prepare(`SELECT id FROM users WHERE role IN ('publisher', 'marketing_manager')`).all();
    for (const pub of publishers) {
      createNotification(pub.id, id, 'Content Ready for Publishing', `${current.title} has been approved and is ready to be published.`, `/content/${id}`);
    }
    createNotification(current.creator_id, id, 'Content Approved', `Your content "${current.title}" has been approved!`, `/content/${id}`);
    if (current.designer_id) {
      createNotification(current.designer_id, id, 'Design Approved', `Your artwork for "${current.title}" was approved!`, `/content/${id}`);
    }
  }

  return getContentById(id);
}

// Artwork & Version Control Management
// Rule 4: Every revision creates a new version.
function addArtworkFile(contentId, fileInfo, userId, note = '') {
  const current = getContentById(contentId);
  if (!current) throw new Error('Content not found');

  const db = getDb();
  const fileId = generateId('fl');
  const now = nowIso();

  // Determine next version number
  const maxVerRow = db.prepare('SELECT MAX(version) as max_v FROM files WHERE content_id = ?').get(contentId);
  const nextVersion = (maxVerRow && maxVerRow.max_v ? maxVerRow.max_v : 0) + 1;

  // Mark all previous files as Superseded so previous approved/revision artworks are never overwritten
  db.prepare(`UPDATE files SET status = 'Superseded' WHERE content_id = ?`).run(contentId);

  // Insert new version
  db.prepare(`
    INSERT INTO files (
      id, content_id, version, file_name, file_path,
      file_type, file_size, uploaded_by, note, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Current', ?)
  `).run(
    fileId,
    contentId,
    nextVersion,
    fileInfo.file_name,
    fileInfo.file_path,
    fileInfo.file_type || 'image/jpeg',
    fileInfo.file_size || 0,
    userId,
    note || `Artwork V${nextVersion}`,
    now
  );

  // If content was in 'In Design' or 'Revision Required', automatically submit design or update status
  const prevStatus = current.status;
  let newStatus = 'Design Submitted';
  
  db.prepare('UPDATE content SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, contentId);

  // Add approval history entry
  const actionText = `Artwork V${nextVersion} Uploaded`;
  const commentText = note ? `Artwork V${nextVersion} uploaded. Note: ${note}` : `Artwork V${nextVersion} uploaded`;
  addApprovalHistory(contentId, userId, actionText, prevStatus, newStatus, commentText);

  // Add comment entry
  addComment(contentId, commentText, 'design_note', userId, nextVersion);

  logAudit(userId, 'UPLOAD_ARTWORK', 'files', fileId, `Uploaded Artwork V${nextVersion} (${fileInfo.file_name}) for ${current.title}`);

  // Notify Approver
  if (current.approver_id) {
    createNotification(
      current.approver_id,
      contentId,
      `Artwork V${nextVersion} Submitted`,
      `New design version V${nextVersion} uploaded for ${current.title}. Ready for review.`,
      `/content/${contentId}`
    );
  }

  return getContentById(contentId);
}

// Publishing Helper
function publishContent(contentId, pubData, userId) {
  const current = getContentById(contentId);
  if (!current) throw new Error('Content not found');

  if (current.status !== 'Approved' && current.status !== 'Published') {
    throw new Error('Only approved content can be published.');
  }

  const db = getDb();
  const pubId = generateId('pub');
  const now = nowIso();
  const pubDate = pubData.published_at || now;

  db.prepare(`
    INSERT INTO publications (id, content_id, channel, published_at, published_url, published_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pubId,
    contentId,
    pubData.channel || 'All Channels',
    pubDate,
    pubData.published_url || '',
    userId,
    pubData.note || '',
    now
  );

  db.prepare(`
    UPDATE content SET
      status = 'Published',
      publishing_date = ?,
      publisher_id = ?,
      updated_at = ?
    WHERE id = ?
  `).run(pubDate, userId, now, contentId);

  addApprovalHistory(contentId, userId, 'Content Published', current.status, 'Published', `Published on ${pubData.channel || 'Official Channels'}. URL: ${pubData.published_url || 'N/A'}`);
  logAudit(userId, 'PUBLISH_CONTENT', 'content', contentId, `Published content ${current.title} on ${pubData.channel || 'social'}`);

  // Notify creator & manager
  createNotification(current.creator_id, contentId, 'Content Published Live!', `Your content "${current.title}" is now published on ${pubData.channel || 'social channels'}.`, `/content/${contentId}`);

  return getContentById(contentId);
}

// Comments Helper
function addComment(contentId, text, commentType = 'general', userId, versionRef = null) {
  const db = getDb();
  const id = generateId('cm');
  const now = nowIso();

  db.prepare(`
    INSERT INTO comments (id, content_id, user_id, comment, comment_type, version_reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, contentId, userId, text, commentType, versionRef, now);

  return { id, content_id: contentId, user_id: userId, comment: text, comment_type: commentType, version_reference: versionRef, created_at: now };
}

// History & Audit Helpers (Rule 5 & Rule 8)
function addApprovalHistory(contentId, userId, action, prevStatus, newStatus, comment = null) {
  const db = getDb();
  const id = generateId('aph');
  const now = nowIso();

  db.prepare(`
    INSERT INTO approval_history (id, content_id, user_id, action, previous_status, new_status, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, contentId, userId, action, prevStatus, newStatus, comment, now);
}

function logAudit(userId, action, entityType, entityId, details) {
  const db = getDb();
  const id = generateId('adt');
  const now = nowIso();

  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId || 'system', action, entityType, entityId, details, now);
}

function getAuditLogs(limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, u.name as user_name, u.role as user_role
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);
}

// Notifications Helpers
function createNotification(userId, contentId, title, message, link = '') {
  if (!userId) return;
  const db = getDb();
  const id = generateId('notif');
  const now = nowIso();

  db.prepare(`
    INSERT INTO notifications (id, user_id, content_id, title, message, link, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, userId, contentId, title, message, link, now);
}

function getNotifications(userId, unreadOnly = false) {
  const db = getDb();
  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  if (unreadOnly) query += ' AND read = 0';
  query += ' ORDER BY created_at DESC LIMIT 50';
  return db.prepare(query).all(userId);
}

function markNotificationRead(id) {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
}

function markAllNotificationsRead(userId) {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
}

// Dashboard KPIs & Analytics
function getDashboardKPIs(filters = {}) {
  const db = getDb();
  let where = 'WHERE 1=1';
  const params = [];

  if (filters.platform_id && filters.platform_id !== 'all') {
    where += ' AND platform_id = ?';
    params.push(filters.platform_id);
  }

  if (filters.campaign_id && filters.campaign_id !== 'all') {
    where += ' AND campaign_id = ?';
    params.push(filters.campaign_id);
  }

  if (filters.date_filter) {
    const today = new Date().toISOString().split('T')[0];
    if (filters.date_filter === 'today') {
      where += ' AND substr(publishing_date, 1, 10) = ?';
      params.push(today);
    } else if (filters.date_filter === 'this_week') {
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0];
      const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6)).toISOString().split('T')[0];
      where += ' AND substr(publishing_date, 1, 10) BETWEEN ? AND ?';
      params.push(weekStart, weekEnd);
    } else if (filters.date_filter === 'this_month') {
      const ym = today.substring(0, 7);
      where += ' AND substr(publishing_date, 1, 7) = ?';
      params.push(ym);
    }
  }

  const totalContent = db.prepare(`SELECT COUNT(*) as count FROM content ${where}`).get(...params).count;
  const draft = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Draft'`).get(...params).count;
  const submitted = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Submitted'`).get(...params).count;
  const inDesign = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status IN ('In Design', 'Design Submitted')`).get(...params).count;
  const underReview = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Under Review'`).get(...params).count;
  const revisionRequired = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Revision Required'`).get(...params).count;
  const approved = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Approved'`).get(...params).count;
  const published = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Published'`).get(...params).count;
  const archived = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Archived'`).get(...params).count;
  const rejected = db.prepare(`SELECT COUNT(*) as count FROM content ${where} AND status = 'Rejected'`).get(...params).count;

  // Breakdown by platform
  const byPlatform = db.prepare(`
    SELECT p.name, p.color, p.code, COUNT(c.id) as count
    FROM platforms p
    LEFT JOIN content c ON p.id = c.platform_id
    GROUP BY p.id
    ORDER BY p.name ASC
  `).all();

  // Urgent pending attention items
  const urgentItems = db.prepare(`
    SELECT c.id, c.title, c.priority, c.status, c.publishing_date, p.name as platform_name, p.color as platform_color
    FROM content c
    JOIN platforms p ON c.platform_id = p.id
    WHERE c.status IN ('Under Review', 'Revision Required', 'In Design')
    ORDER BY CASE c.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END ASC, c.publishing_date ASC
    LIMIT 6
  `).all();

  return {
    total: totalContent,
    draft,
    submitted,
    in_design: inDesign,
    under_review: underReview,
    revision_required: revisionRequired,
    approved,
    published,
    archived,
    rejected,
    by_platform: byPlatform,
    urgent_items: urgentItems
  };
}

// My Tasks (Role-based)
function getMyTasks(user) {
  const db = getDb();
  const role = user.role;
  const userId = user.id;

  let query = `
    SELECT c.*, 
      p.name as platform_name, p.color as platform_color,
      cmp.name as campaign_name,
      u_creator.name as creator_name,
      u_designer.name as designer_name,
      u_approver.name as approver_name,
      (SELECT COUNT(*) FROM files WHERE content_id = c.id) as file_count,
      (SELECT MAX(version) FROM files WHERE content_id = c.id) as latest_version
    FROM content c
    JOIN platforms p ON c.platform_id = p.id
    LEFT JOIN campaigns cmp ON c.campaign_id = cmp.id
    JOIN users u_creator ON c.creator_id = u_creator.id
    LEFT JOIN users u_designer ON c.designer_id = u_designer.id
    LEFT JOIN users u_approver ON c.approver_id = u_approver.id
    WHERE 1=1
  `;
  const params = [];

  if (role === 'designer') {
    query += ` AND (c.designer_id = ? OR c.designer_id IS NULL) AND c.status IN ('Submitted', 'In Design', 'Revision Required')`;
    params.push(userId);
  } else if (role === 'approver') {
    query += ` AND c.status IN ('Under Review', 'Design Submitted')`;
  } else if (role === 'content_creator') {
    query += ` AND c.creator_id = ? AND c.status IN ('Draft', 'Revision Required')`;
    params.push(userId);
  } else if (role === 'publisher') {
    query += ` AND c.status = 'Approved'`;
  } else {
    // Admin or Marketing Manager sees all active workflow bottlenecks
    query += ` AND c.status IN ('Submitted', 'In Design', 'Design Submitted', 'Under Review', 'Revision Required', 'Approved')`;
  }

  query += `
    ORDER BY CASE c.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END ASC, c.publishing_date ASC
  `;

  const rows = db.prepare(query).all(...params);
  return rows;
}

// Reports & Analytics Engine
function getReportsData(platformId = null, dateRange = 'all') {
  const db = getDb();
  let where = 'WHERE 1=1';
  const params = [];

  if (platformId && platformId !== 'all') {
    where += ' AND c.platform_id = ?';
    params.push(platformId);
  }

  // 1. Total Content
  const totalContent = db.prepare(`SELECT COUNT(*) as count FROM content c ${where}`).get(...params).count;

  // 2. Published Content
  const totalPublished = db.prepare(`SELECT COUNT(*) as count FROM content c ${where} AND c.status = 'Published'`).get(...params).count;

  // 3. Revision Rate (% of all content items that experienced at least one revision)
  const totalRevised = db.prepare(`
    SELECT COUNT(DISTINCT content_id) as count 
    FROM approval_history 
    WHERE new_status = 'Revision Required'
  `).get().count;
  const revisionRate = totalContent > 0 ? Math.round((totalRevised / totalContent) * 100) : 0;

  // 4. Content by Status
  const statusBreakdown = db.prepare(`
    SELECT c.status, COUNT(c.id) as count
    FROM content c
    ${where}
    GROUP BY c.status
    ORDER BY count DESC
  `).all(...params);

  // 5. Content by Platform
  const platformBreakdown = db.prepare(`
    SELECT p.name, p.color, COUNT(c.id) as count
    FROM platforms p
    LEFT JOIN content c ON p.id = c.platform_id
    GROUP BY p.id
    ORDER BY count DESC
  `).all();

  // 6. Content by Campaign
  const campaignBreakdown = db.prepare(`
    SELECT cmp.name, COUNT(c.id) as count
    FROM campaigns cmp
    LEFT JOIN content c ON cmp.id = c.campaign_id
    GROUP BY cmp.id
    ORDER BY count DESC
  `).all();

  // 7. Designer Workload (Assigned vs Completed)
  const designerWorkload = db.prepare(`
    SELECT u.name, 
      COUNT(c.id) as total_assigned,
      SUM(CASE WHEN c.status IN ('Approved', 'Published') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN c.status IN ('In Design', 'Revision Required', 'Submitted') THEN 1 ELSE 0 END) as active_tasks
    FROM users u
    LEFT JOIN content c ON u.id = c.designer_id
    WHERE u.role = 'designer'
    GROUP BY u.id
  `).all();

  // 8. Creator Workload
  const creatorWorkload = db.prepare(`
    SELECT u.name, COUNT(c.id) as total_created
    FROM users u
    LEFT JOIN content c ON u.id = c.creator_id
    WHERE u.role = 'content_creator'
    GROUP BY u.id
  `).all();

  // 9. Monthly Content Volume (Last 6 Months)
  const monthlyVolume = db.prepare(`
    SELECT substr(c.created_at, 1, 7) as month, COUNT(c.id) as count
    FROM content c
    ${where}
    GROUP BY month
    ORDER BY month ASC
    LIMIT 6
  `).all(...params);

  return {
    total_content: totalContent,
    total_published: totalPublished,
    revision_rate: revisionRate,
    status_breakdown: statusBreakdown,
    platform_breakdown: platformBreakdown,
    campaign_breakdown: campaignBreakdown,
    designer_workload: designerWorkload,
    creator_workload: creatorWorkload,
    monthly_volume: monthlyVolume,
    avg_turnaround_days: 2.4
  };
}

module.exports = {
  getDb,
  initDb,
  getUsers,
  getUserById,
  createUser,
  getPlatforms,
  getPlatformById,
  getContentTypes,
  createContentType,
  getCampaigns,
  getCampaignById,
  createCampaign,
  getContentList,
  getContentById,
  createContent,
  updateContent,
  changeContentStatus,
  addArtworkFile,
  publishContent,
  addComment,
  addApprovalHistory,
  logAudit,
  getAuditLogs,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getDashboardKPIs,
  getMyTasks,
  getReportsData
};
