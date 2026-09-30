/**
 * Ethiopost Content Operations & Approval System
 * REST API Client
 */

const API = {
  activeUserId: null,

  setUserId(id) {
    this.activeUserId = id;
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.activeUserId ? { 'X-User-Id': this.activeUserId } : {}),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP error ${response.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, err);
      throw err;
    }
  },

  // Auth & Session
  async getCurrentSession() {
    return this.request('/api/auth/current');
  },

  async switchUser(userId) {
    const res = await this.request('/api/auth/switch', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
    if (res.user) this.setUserId(res.user.id);
    return res;
  },

  async getUsers() {
    return this.request('/api/users');
  },

  async createUser(userData) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  // Platforms
  async getPlatforms() {
    return this.request('/api/platforms');
  },

  // Content Types
  async getContentTypes() {
    return this.request('/api/content-types');
  },

  // Campaigns
  async getCampaigns(platformId = null) {
    const query = platformId && platformId !== 'all' ? `?platform_id=${encodeURIComponent(platformId)}` : '';
    return this.request(`/api/campaigns${query}`);
  },

  async createCampaign(data) {
    return this.request('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Dashboard & Analytics
  async getDashboardKPIs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.platform_id && filters.platform_id !== 'all') params.append('platform_id', filters.platform_id);
    if (filters.campaign_id && filters.campaign_id !== 'all') params.append('campaign_id', filters.campaign_id);
    if (filters.date_filter && filters.date_filter !== 'all') params.append('date_filter', filters.date_filter);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/dashboard/kpis${query}`);
  },

  // My Tasks
  async getMyTasks() {
    return this.request('/api/my-tasks');
  },

  // Content Items
  async getContentList(filters = {}) {
    const params = new URLSearchParams();
    if (filters.platform_id && filters.platform_id !== 'all') params.append('platform_id', filters.platform_id);
    if (filters.campaign_id && filters.campaign_id !== 'all') params.append('campaign_id', filters.campaign_id);
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters.date_filter && filters.date_filter !== 'all') params.append('date_filter', filters.date_filter);
    if (filters.search) params.append('search', filters.search);
    if (filters.creator_id) params.append('creator_id', filters.creator_id);
    if (filters.designer_id) params.append('designer_id', filters.designer_id);
    if (filters.approver_id) params.append('approver_id', filters.approver_id);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/content${query}`);
  },

  async getContentById(id) {
    return this.request(`/api/content/${id}`);
  },

  async createContent(data) {
    return this.request('/api/content', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateContent(id, data) {
    return this.request(`/api/content/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async changeStatus(id, status, comment = '') {
    return this.request(`/api/content/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, comment })
    });
  },

  async uploadArtwork(id, artworkPayload) {
    return this.request(`/api/content/${id}/artwork`, {
      method: 'POST',
      body: JSON.stringify(artworkPayload)
    });
  },

  async publishContent(id, pubData) {
    return this.request(`/api/content/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(pubData)
    });
  },

  async addComment(id, comment, commentType = 'general', versionReference = null) {
    return this.request(`/api/content/${id}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment, comment_type: commentType, version_reference: versionReference })
    });
  },

  // Reports
  async getReports(platformId = null, dateRange = 'all') {
    const params = new URLSearchParams();
    if (platformId && platformId !== 'all') params.append('platform_id', platformId);
    if (dateRange && dateRange !== 'all') params.append('date_range', dateRange);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/reports${query}`);
  },

  // Notifications
  async getNotifications(unreadOnly = false) {
    const query = unreadOnly ? '?unread=1' : '';
    return this.request(`/api/notifications${query}`);
  },

  async markNotificationRead(id) {
    return this.request(`/api/notifications/${id}/read`, { method: 'POST' });
  },

  async markAllNotificationsRead() {
    return this.request('/api/notifications/read-all', { method: 'POST' });
  },

  // Audit Logs
  async getAuditLogs(limit = 100) {
    return this.request(`/api/audit-logs?limit=${limit}`);
  }
};

window.API = API;
