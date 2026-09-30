/**
 * Ethiopost Role-Scoped Content Operations
 * Clean, Simple, Role-Dedicated Workspaces with Team Management
 */

(function () {
  'use strict';

  const state = {
    currentUser: null,
    availableUsers: [],
    selectedBrand: 'all',        // 'all', 'plt_ethiopost', 'plt_post_gebeya', 'plt_post_finance'
    activeTab: 'primary',        // 'primary' (active tasks) or 'secondary' (completed/history)
    adminStatusFilter: 'all',    // 'all', 'published', 'approved', 'review', 'revision', 'design', 'draft', 'team'
    searchQuery: '',
    roleTasks: []
  };

  // Toast System
  function showToast(message, type = 'info') {
    const shelf = document.getElementById('toast-shelf');
    if (!shelf) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    shelf.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  
  function isVideoFile(filePath, fileType) {
    if (fileType && fileType.startsWith('video/')) return true;
    if (!filePath) return false;
    const lower = filePath.toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.m4v');
  }

  function formatDate(isoStr) {
    if (!isoStr) return 'No date';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return isoStr;
    }
  }

  // --- INITIALIZATION ---
  async function init() {
    try {
      const session = await API.getCurrentSession();
      state.currentUser = session.user;
      state.availableUsers = session.available_users || [];
      API.setUserId(state.currentUser.id);

      renderRoleSwitcher();
      populateAssigneeDropdowns();
      setupEventListeners();
      await loadWorkspace();
    } catch (err) {
      console.error('Initialization error:', err);
      showToast('Init error: ' + err.message, 'error');
    }
  }

  // Render Role Switcher in Top Bar
  function renderRoleSwitcher() {
    const select = document.getElementById('user-role-select');
    if (!select) return;

    select.innerHTML = state.availableUsers.map(u => {
      const roleTitle = u.role === 'designer' ? 'Graphic Designer' :
                        u.role === 'approver' ? 'Approval Lead' :
                        u.role === 'publisher' ? 'Publisher' :
                        u.role === 'content_creator' ? 'Content Creator' :
                        'Admin';
      return `<option value="${u.id}" ${u.id === state.currentUser.id ? 'selected' : ''}>
        ${escapeHtml(u.name)} (${roleTitle})
      </option>`;
    }).join('');

    select.onchange = async (e) => {
      try {
        const res = await API.switchUser(e.target.value);
        state.currentUser = res.user;
        state.activeTab = 'primary';
        state.adminStatusFilter = 'all';
        showToast('Switched workspace to ' + state.currentUser.name, 'info');
        await loadWorkspace();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Populate Designer and Approver select options in Create Brief modal
  function populateAssigneeDropdowns() {
    const desSelect = document.getElementById('brief-designer');
    const appSelect = document.getElementById('brief-approver');

    if (desSelect) {
      const designers = state.availableUsers.filter(u => u.role === 'designer' || u.role === 'admin');
      desSelect.innerHTML = '<option value="">Any Designer (Open Creative Pool)</option>' + designers.map(u => `
        <option value="${u.id}">${escapeHtml(u.name)} (${u.role === 'designer' ? 'Graphic Designer' : 'Admin'})</option>
      `).join('');
    }

    if (appSelect) {
      const approvers = state.availableUsers.filter(u => u.role === 'approver' || u.role === 'admin' || u.role === 'marketing_manager');
      appSelect.innerHTML = '<option value="">Any Authorized Approver</option>' + approvers.map(u => `
        <option value="${u.id}">${escapeHtml(u.name)} (${u.role === 'approver' ? 'Approval Lead' : 'Admin'})</option>
      `).join('');
    }
  }

  
  // --- FULLSCREEN LIGHTBOX HANDLER ---
  async function openLightbox(contentId, initialVersionIndex = 0) {
    try {
      const item = await API.getContentById(contentId);
      if (!item || !item.files || item.files.length === 0) {
        showToast('No artwork or video file uploaded for this item yet', 'info');
        return;
      }

      const modal = document.getElementById('media-lightbox');
      const titleEl = document.getElementById('lightbox-title');
      const brandEl = document.getElementById('lightbox-brand');
      const imgEl = document.getElementById('lightbox-image');
      const videoEl = document.getElementById('lightbox-video');
      const pillsEl = document.getElementById('lightbox-version-pills');
      const noteEl = document.getElementById('lightbox-uploader-note');
      const downloadBtn = document.getElementById('lightbox-download-btn');

      titleEl.textContent = item.title;
      brandEl.textContent = item.platform_name || 'Ethiopost';

      function showVersion(fileIdx) {
        const file = item.files[fileIdx] || item.files[0];
        const isVid = isVideoFile(file.file_path, file.file_type);

        if (isVid) {
          imgEl.style.display = 'none';
          imgEl.src = '';
          videoEl.style.display = 'block';
          videoEl.src = file.file_path;
        } else {
          videoEl.style.display = 'none';
          videoEl.pause();
          videoEl.src = '';
          imgEl.style.display = 'block';
          imgEl.src = file.file_path;
        }

        downloadBtn.href = file.file_path;
        downloadBtn.setAttribute('download', file.file_name);

        noteEl.innerHTML = `Version <strong>V${file.version}</strong> uploaded by <strong>${escapeHtml(file.uploader_name || 'Designer')}</strong> on ${formatDate(file.created_at)} ${file.note ? '— "' + escapeHtml(file.note) + '"' : ''}`;

        // Update pills
        pillsEl.querySelectorAll('.lb-version-btn').forEach((btn, idx) => {
          if (idx === fileIdx) btn.classList.add('active');
          else btn.classList.remove('active');
        });
      }

      // Render version pills if multiple versions
      pillsEl.innerHTML = item.files.map((f, idx) => `
        <button class="lb-version-btn ${idx === initialVersionIndex ? 'active' : ''}" data-idx="${idx}">
          ${isVideoFile(f.file_path, f.file_type) ? '🎬 Video' : 'Artwork'} V${f.version}
        </button>
      `).join('');

      pillsEl.querySelectorAll('.lb-version-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          showVersion(idx);
        };
      });

      showVersion(initialVersionIndex);
      modal.classList.add('open');

      // Close handlers
      document.getElementById('lightbox-close-btn').onclick = () => {
        modal.classList.remove('open');
        videoEl.pause();
      };

      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
          videoEl.pause();
        }
      };

      window.onkeydown = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
          modal.classList.remove('open');
          videoEl.pause();
        }
      };

    } catch (err) {
      showToast('Failed to open fullscreen preview: ' + err.message, 'error');
    }
  }
  window.openLightbox = openLightbox;


  // Setup Event Listeners
  function setupEventListeners() {
    // Brand Filter Buttons
    document.querySelectorAll('.brand-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.brand-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedBrand = btn.getAttribute('data-brand');
        renderTasksList();
      };
    });

    // Search Input
    const searchInput = document.getElementById('task-search');
    if (searchInput) {
      let timer = null;
      searchInput.oninput = (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.searchQuery = e.target.value.trim().toLowerCase();
          renderTasksList();
        }, 200);
      };
    }

    // Modal Close buttons
    document.querySelectorAll('[data-dismiss]').forEach(btn => {
      btn.onclick = () => {
        const modalId = btn.getAttribute('data-dismiss');
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('open');
      };
    });

    // Modal Backdrop click to close
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('open');
      };
    });

    // Admin: Open Add User Modal
    const btnAddUser = document.getElementById('btn-add-user');
    if (btnAddUser) {
      btnAddUser.onclick = () => {
        document.getElementById('form-add-user').reset();
        document.getElementById('modal-add-user').classList.add('open');
      };
    }

    // Handle Add User Form Submission
    const formAddUser = document.getElementById('form-add-user');
    if (formAddUser) {
      formAddUser.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-user-name').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const role = document.getElementById('new-user-role').value;
        const title = document.getElementById('new-user-title').value.trim();
        const dept = document.getElementById('new-user-dept').value.trim();

        try {
          const initials = name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
          const newUser = await API.createUser({
            name,
            email,
            role,
            title,
            department: dept,
            avatar: initials
          });

          document.getElementById('modal-add-user').classList.remove('open');
          showToast(`✓ Created account for ${name}!`, 'success');

          // Refresh users list
          const users = await API.getUsers();
          state.availableUsers = users;
          renderRoleSwitcher();
          populateAssigneeDropdowns();
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    // Creator / Admin: Open Create Brief Modal
    const btnCreateBrief = document.getElementById('btn-create-brief');
    if (btnCreateBrief) {
      btnCreateBrief.onclick = () => {
        document.getElementById('form-create-brief').reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('brief-date').value = today;
        document.getElementById('modal-create-brief').classList.add('open');
      };
    }

    // Handle Upload Artwork Form (Designer)
    const formUpload = document.getElementById('form-upload-artwork');
    if (formUpload) {
      formUpload.onsubmit = async (e) => {
        e.preventDefault();
        const contentId = document.getElementById('upload-content-id').value;
        const note = document.getElementById('upload-note-input').value.trim();
        const fileInput = document.getElementById('upload-file-input');

        try {
          const payload = {
            file_name: 'artwork_' + Date.now() + '.svg',
            note: note || 'Artwork uploaded by designer'
          };

          if (fileInput.files && fileInput.files[0]) {
            payload.file_name = fileInput.files[0].name;
            payload.base64 = await readFileAsBase64(fileInput.files[0]);
          }

          await API.uploadArtwork(contentId, payload);
          document.getElementById('modal-upload-artwork').classList.remove('open');
          showToast('✓ Artwork uploaded & submitted for approval!', 'success');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    // Handle Request Changes Form (Approver)
    const formChanges = document.getElementById('form-request-changes');
    if (formChanges) {
      formChanges.onsubmit = async (e) => {
        e.preventDefault();
        const contentId = document.getElementById('changes-content-id').value;
        const comment = document.getElementById('changes-comment-input').value.trim();

        if (!comment) {
          showToast('Please provide instructions for the designer', 'error');
          return;
        }

        try {
          await API.changeStatus(contentId, 'Revision Required', comment);
          document.getElementById('modal-request-changes').classList.remove('open');
          showToast('Revision request sent to designer', 'info');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    // Handle Publish Live Form (Publisher)
    const formPub = document.getElementById('form-publish');
    if (formPub) {
      formPub.onsubmit = async (e) => {
        e.preventDefault();
        const contentId = document.getElementById('publish-content-id').value;
        const channel = document.getElementById('publish-channel-input').value.trim();
        const url = document.getElementById('publish-url-input').value.trim();

        try {
          await API.publishContent(contentId, {
            published_at: new Date().toISOString(),
            channel: channel || 'Facebook & Telegram',
            published_url: url || null,
            note: 'Published on live social channels'
          });
          document.getElementById('modal-publish').classList.remove('open');
          showToast('🚀 Post officially published live!', 'success');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    // Handle Create Brief Form (Creator / Admin)
    const formBrief = document.getElementById('form-create-brief');
    if (formBrief) {
      formBrief.onsubmit = async (e) => {
        e.preventDefault();
        const brand = document.getElementById('brief-brand').value;
        const date = document.getElementById('brief-date').value;
        const designerId = document.getElementById('brief-designer').value;
        const approverId = document.getElementById('brief-approver').value;
        const title = document.getElementById('brief-title').value.trim();
        const headline = document.getElementById('brief-headline').value.trim();
        const caption = document.getElementById('brief-caption').value.trim();

        const channels = [];
        formBrief.querySelectorAll('input[name="brief-ch"]:checked').forEach(c => channels.push(c.value));

        try {
          await API.createContent({
            platform_id: brand,
            title: title,
            headline: headline,
            caption: caption,
            publishing_date: date ? new Date(date).toISOString() : new Date().toISOString(),
            channels: channels.length > 0 ? channels : ['Facebook', 'Telegram'],
            designer_id: designerId || 'usr_designer',
            approver_id: approverId || 'usr_approver'
          });

          document.getElementById('modal-create-brief').classList.remove('open');
          showToast('✓ Content brief created and assigned to designer!', 'success');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // =========================================================================
  // LOAD ROLE WORKSPACE
  // =========================================================================
  async function loadWorkspace() {
    const role = state.currentUser ? state.currentUser.role : 'designer';
    const isAdmin = role === 'admin' || role === 'marketing_manager';
    const titleEl = document.getElementById('workspace-title');
    const subtitleEl = document.getElementById('workspace-subtitle');
    const tabsEl = document.getElementById('workspace-tabs');
    const btnCreateBrief = document.getElementById('btn-create-brief');
    const btnAddUser = document.getElementById('btn-add-user');

    // Show/hide New Brief & Add User button
    if (btnCreateBrief) {
      btnCreateBrief.style.display = (role === 'content_creator' || isAdmin) ? 'inline-block' : 'none';
    }
    if (btnAddUser) {
      btnAddUser.style.display = isAdmin ? 'inline-block' : 'none';
    }

    // Role Specific Headings & Tabs
    if (role === 'designer') {
      titleEl.textContent = '🎨 Designer Workspace';
      subtitleEl.textContent = 'Content briefs assigned to you. Review plain copy and upload your creative artwork.';
      
      const myTasks = await API.getMyTasks();
      const allContent = await API.getContentList({ designer_id: state.currentUser.id });
      const completedUploads = allContent.filter(c => c.status === 'Design Submitted' || c.status === 'Under Review' || c.status === 'Approved' || c.status === 'Published');

      state.designerActiveTasks = myTasks;
      state.designerCompletedUploads = completedUploads;

      tabsEl.innerHTML = `
        <button class="workspace-tab ${state.activeTab === 'primary' ? 'active' : ''}" data-tab="primary">
          <span>Briefs Needing Artwork</span>
          <span class="tab-num">${myTasks.length}</span>
        </button>
        <button class="workspace-tab ${state.activeTab === 'secondary' ? 'active' : ''}" data-tab="secondary">
          <span>My Uploaded Artwork</span>
          <span class="tab-num">${completedUploads.length}</span>
        </button>
      `;

      tabsEl.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.onclick = () => {
          tabsEl.querySelectorAll('.workspace-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.activeTab = tab.getAttribute('data-tab');
          renderTasksList();
        };
      });
    } else if (role === 'approver') {
      titleEl.textContent = '🔍 Approval Workspace';
      subtitleEl.textContent = 'Review creative artwork and plain copy before content is published.';

      const pending = await API.getMyTasks();
      const allApproved = await API.getContentList({ approver_id: state.currentUser.id, status: 'Approved' });

      state.approverPending = pending;
      state.approverHistory = allApproved;

      tabsEl.innerHTML = `
        <button class="workspace-tab ${state.activeTab === 'primary' ? 'active' : ''}" data-tab="primary">
          <span>Pending Your Approval</span>
          <span class="tab-num">${pending.length}</span>
        </button>
        <button class="workspace-tab ${state.activeTab === 'secondary' ? 'active' : ''}" data-tab="secondary">
          <span>Approved by You</span>
          <span class="tab-num">${allApproved.length}</span>
        </button>
      `;

      tabsEl.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.onclick = () => {
          tabsEl.querySelectorAll('.workspace-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.activeTab = tab.getAttribute('data-tab');
          renderTasksList();
        };
      });
    } else if (role === 'publisher') {
      titleEl.textContent = '🚀 Publishing Workspace';
      subtitleEl.textContent = 'Approved posts ready for official release on social media channels.';

      const ready = await API.getMyTasks();
      const published = await API.getContentList({ status: 'Published' });

      state.publisherReady = ready;
      state.publisherLive = published;

      tabsEl.innerHTML = `
        <button class="workspace-tab ${state.activeTab === 'primary' ? 'active' : ''}" data-tab="primary">
          <span>Ready to Post Live</span>
          <span class="tab-num">${ready.length}</span>
        </button>
        <button class="workspace-tab ${state.activeTab === 'secondary' ? 'active' : ''}" data-tab="secondary">
          <span>Published Live</span>
          <span class="tab-num">${published.length}</span>
        </button>
      `;

      tabsEl.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.onclick = () => {
          tabsEl.querySelectorAll('.workspace-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.activeTab = tab.getAttribute('data-tab');
          renderTasksList();
        };
      });
    } else if (role === 'content_creator') {
      titleEl.textContent = '✏️ Content Creator Workspace';
      subtitleEl.textContent = 'Draft social media posts and brief the graphic design team.';

      const myBriefs = await API.getMyTasks();
      const allMyContent = await API.getContentList({ creator_id: state.currentUser.id });

      state.creatorBriefs = myBriefs;
      state.creatorAll = allMyContent;

      tabsEl.innerHTML = `
        <button class="workspace-tab ${state.activeTab === 'primary' ? 'active' : ''}" data-tab="primary">
          <span>My Active Drafts & Revisions</span>
          <span class="tab-num">${myBriefs.length}</span>
        </button>
        <button class="workspace-tab ${state.activeTab === 'secondary' ? 'active' : ''}" data-tab="secondary">
          <span>All My Submissions</span>
          <span class="tab-num">${allMyContent.length}</span>
        </button>
      `;

      tabsEl.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.onclick = () => {
          tabsEl.querySelectorAll('.workspace-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.activeTab = tab.getAttribute('data-tab');
          renderTasksList();
        };
      });
    } else {
      // ADMIN WORKSPACE WITH STATUS FILTERS + TEAM TAB
      titleEl.textContent = '🛠️ Admin Operations Workspace';
      subtitleEl.textContent = 'Complete system overview. Use the filter buttons below to inspect content by stage.';

      const allPosts = await API.getContentList();
      state.adminAllPosts = allPosts;

      const countAll = allPosts.length;
      const countPub = allPosts.filter(p => p.status === 'Published').length;
      const countApp = allPosts.filter(p => p.status === 'Approved').length;
      const countRev = allPosts.filter(p => p.status === 'Under Review' || p.status === 'Design Submitted').length;
      const countRvn = allPosts.filter(p => p.status === 'Revision Required').length;
      const countDes = allPosts.filter(p => p.status === 'In Design' || p.status === 'Submitted').length;
      const countDft = allPosts.filter(p => p.status === 'Draft').length;
      const countTeam = state.availableUsers.length;

      tabsEl.innerHTML = `
        <button class="workspace-tab ${state.adminStatusFilter === 'all' ? 'active' : ''}" data-admin-filter="all">
          <span>All Posts</span>
          <span class="tab-num">${countAll}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'published' ? 'active' : ''}" data-admin-filter="published">
          <span>🚀 Published</span>
          <span class="tab-num">${countPub}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'approved' ? 'active' : ''}" data-admin-filter="approved">
          <span>✅ Approved</span>
          <span class="tab-num">${countApp}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'review' ? 'active' : ''}" data-admin-filter="review">
          <span>🔍 Under Review</span>
          <span class="tab-num">${countRev}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'revision' ? 'active' : ''}" data-admin-filter="revision">
          <span>🔄 Revision Required</span>
          <span class="tab-num">${countRvn}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'design' ? 'active' : ''}" data-admin-filter="design">
          <span>🎨 In Design</span>
          <span class="tab-num">${countDes}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'draft' ? 'active' : ''}" data-admin-filter="draft">
          <span>✏️ Drafts</span>
          <span class="tab-num">${countDft}</span>
        </button>
        <button class="workspace-tab ${state.adminStatusFilter === 'team' ? 'active' : ''}" data-admin-filter="team">
          <span>👥 Team Members</span>
          <span class="tab-num">${countTeam}</span>
        </button>
      `;

      tabsEl.querySelectorAll('.workspace-tab').forEach(btn => {
        btn.onclick = () => {
          tabsEl.querySelectorAll('.workspace-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.adminStatusFilter = btn.getAttribute('data-admin-filter');
          renderTasksList();
        };
      });
    }

    renderTasksList();
  }

  // =========================================================================
  // RENDER TASKS OR TEAM LIST
  // =========================================================================
  function renderTasksList() {
    const role = state.currentUser ? state.currentUser.role : 'designer';
    const isAdmin = role === 'admin' || role === 'marketing_manager';
    const container = document.getElementById('tasks-container');
    const counterEl = document.getElementById('tasks-counter');
    const toolbarEl = document.getElementById('workspace-toolbar');
    if (!container) return;

    // Special Case: Admin Team Members Tab
    if (isAdmin && state.adminStatusFilter === 'team') {
      if (toolbarEl) toolbarEl.style.display = 'none';
      renderTeamGrid(container);
      return;
    }
    if (toolbarEl) toolbarEl.style.display = 'flex';

    let items = [];

    if (role === 'designer') {
      items = state.activeTab === 'primary' ? (state.designerActiveTasks || []) : (state.designerCompletedUploads || []);
    } else if (role === 'approver') {
      items = state.activeTab === 'primary' ? (state.approverPending || []) : (state.approverHistory || []);
    } else if (role === 'publisher') {
      items = state.activeTab === 'primary' ? (state.publisherReady || []) : (state.publisherLive || []);
    } else if (role === 'content_creator') {
      items = state.activeTab === 'primary' ? (state.creatorBriefs || []) : (state.creatorAll || []);
    } else {
      items = state.adminAllPosts || [];
      if (state.adminStatusFilter === 'published') {
        items = items.filter(it => it.status === 'Published');
      } else if (state.adminStatusFilter === 'approved') {
        items = items.filter(it => it.status === 'Approved');
      } else if (state.adminStatusFilter === 'review') {
        items = items.filter(it => it.status === 'Under Review' || it.status === 'Design Submitted');
      } else if (state.adminStatusFilter === 'revision') {
        items = items.filter(it => it.status === 'Revision Required');
      } else if (state.adminStatusFilter === 'design') {
        items = items.filter(it => it.status === 'In Design' || it.status === 'Submitted');
      } else if (state.adminStatusFilter === 'draft') {
        items = items.filter(it => it.status === 'Draft');
      }
    }

    if (state.selectedBrand !== 'all') {
      items = items.filter(it => it.platform_id === state.selectedBrand);
    }

    if (state.searchQuery) {
      items = items.filter(it => {
        const titleMatch = (it.title || '').toLowerCase().includes(state.searchQuery);
        const captionMatch = (it.caption || '').toLowerCase().includes(state.searchQuery);
        return titleMatch || captionMatch;
      });
    }

    if (counterEl) {
      counterEl.textContent = `Showing ${items.length} item${items.length === 1 ? '' : 's'}`;
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 28px; margin-bottom: 6px;">☕</div>
          <div>No tasks in this filter</div>
          <div style="font-size: 12px; margin-top: 4px; color: var(--text-soft);">Try selecting another status button or brand</div>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => renderTaskCard(item, role, isAdmin)).join('');
    attachCardListeners(container);
  }

  // Render Team Members Grid (Admin)
  function renderTeamGrid(container) {
    const users = state.availableUsers || [];
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="font-weight: 800; font-size: 15px; color: var(--text);">Authorized Staff Members (${users.length})</div>
        <button class="btn btn-primary" onclick="document.getElementById('modal-add-user').classList.add('open')">+ Add Team Member</button>
      </div>
      <div class="team-grid">
        ${users.map(u => {
          const roleTitle = u.role === 'designer' ? 'Graphic Designer' :
                            u.role === 'approver' ? 'Approval Lead' :
                            u.role === 'publisher' ? 'Social Media Publisher' :
                            u.role === 'content_creator' ? 'Content Creator' : 'System Admin';
          return `
            <div class="team-card">
              <div class="team-avatar">${u.avatar || u.name.slice(0, 2).toUpperCase()}</div>
              <div class="team-info">
                <span class="team-name">${escapeHtml(u.name)}</span>
                <span class="team-role-tag">${roleTitle}</span>
                <span class="team-email">${escapeHtml(u.email)}</span>
                <span style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(u.title || u.department || 'Staff')}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // =========================================================================
  // RENDER INDIVIDUAL CLEAN CARD
  // =========================================================================
  function renderTaskCard(item, role, isAdmin) {
    const isEth = item.platform_id === 'plt_ethiopost';
    const isGeb = item.platform_id === 'plt_post_gebeya';
    const brandClass = isEth ? 'brand-ethiopost' : isGeb ? 'brand-postgebeya' : 'brand-postfinance';
    const brandName = item.platform_name || (isEth ? 'Ethiopost' : isGeb ? 'Post Gebeya' : 'Post Finance');

    let statusClass = 'status-indesign';
    let statusLabel = item.status;
    if (item.status === 'Revision Required') {
      statusClass = 'status-revision';
      statusLabel = '⚠️ Revision Required';
    } else if (item.status === 'Under Review' || item.status === 'Design Submitted') {
      statusClass = 'status-review';
      statusLabel = 'Under Review';
    } else if (item.status === 'Approved') {
      statusClass = 'status-approved';
      statusLabel = 'Approved';
    } else if (item.status === 'Published') {
      statusClass = 'status-published';
      statusLabel = 'Published Live';
    }

    let actionButtonsHtml = '';

    if (role === 'designer') {
      if (item.status === 'Revision Required') {
        actionButtonsHtml = `
          <button class="btn-task btn-upload" data-action="upload" data-id="${item.id}">
            🎨 Upload Revised Artwork (V${(item.latest_version || 1) + 1})
          </button>
        `;
      } else if (item.status === 'In Design' || item.status === 'Submitted') {
        if (!item.designer_id) {
          actionButtonsHtml = `
            <button class="btn-task btn-claim" data-action="claim-task" data-id="${item.id}">
              📌 Claim Brief (Open Pool)
            </button>
          `;
        } else {
          actionButtonsHtml = `
            <button class="btn-task btn-upload" data-action="upload" data-id="${item.id}">
              🎨 Upload Artwork (V1)
            </button>
          `;
        }
      } else {
        actionButtonsHtml = `
          <div style="font-size: 11.5px; color: var(--text-muted); text-align: center; width: 100%;">
            ✓ Artwork V${item.latest_version || 1} submitted
          </div>
        `;
      }
    } else if (role === 'approver') {
      if (item.status === 'Under Review' || item.status === 'Design Submitted') {
        actionButtonsHtml = `
          <button class="btn-task btn-approve" data-action="approve" data-id="${item.id}">
            ✓ Approve
          </button>
          <button class="btn-task btn-reject" data-action="request-changes" data-id="${item.id}">
            Request Changes
          </button>
        `;
      } else {
        actionButtonsHtml = `
          <div style="font-size: 11.5px; color: #059669; font-weight: 700; text-align: center; width: 100%;">
            ✓ Approved for publishing
          </div>
        `;
      }
    } else if (role === 'publisher') {
      if (item.status === 'Approved') {
        actionButtonsHtml = `
          <button class="btn-task btn-publish" data-action="publish-live" data-id="${item.id}">
            🚀 Mark as Published Live
          </button>
        `;
      } else {
        actionButtonsHtml = `
          <div style="font-size: 11.5px; color: #0D9488; font-weight: 700; text-align: center; width: 100%;">
            ✓ Published Live
          </div>
        `;
      }
    } else if (role === 'content_creator') {
      if (item.status === 'Draft') {
        actionButtonsHtml = `
          <button class="btn-task btn-upload" data-action="submit-to-designer" data-id="${item.id}">
            Submit to Designer &rarr;
          </button>
        `;
      } else {
        actionButtonsHtml = `
          <div style="font-size: 11.5px; color: var(--text-muted); text-align: center; width: 100%;">
            Status: ${item.status} (Designer: ${escapeHtml(item.designer_name || 'Assigned')})
          </div>
        `;
      }
    } else {
      if (item.status === 'Under Review' || item.status === 'Design Submitted') {
        actionButtonsHtml = `
          <button class="btn-task btn-approve" data-action="approve" data-id="${item.id}">
            ✓ Approve
          </button>
          <button class="btn-task btn-reject" data-action="request-changes" data-id="${item.id}">
            Request Changes
          </button>
        `;
      } else if (item.status === 'Approved') {
        actionButtonsHtml = `
          <button class="btn-task btn-publish" data-action="publish-live" data-id="${item.id}">
            🚀 Mark Published Live
          </button>
        `;
      } else if (item.status === 'Published') {
        actionButtonsHtml = `
          <div style="font-size: 11.5px; color: #0D9488; font-weight: 800; text-align: center; width: 100%;">
            ✓ Live on ${escapeHtml((item.publication && item.publication.channel) || 'Official Channels')}
          </div>
        `;
      } else {
        actionButtonsHtml = `
          <div style="font-size: 11.5px; color: var(--text-muted); text-align: center; width: 100%;">
            Assigned: ${escapeHtml(item.designer_name || 'No designer')}
          </div>
        `;
      }
    }

    let revisionFeedbackHtml = '';
    if (item.status === 'Revision Required') {
      const commentText = item.comments && item.comments.length > 0 
        ? (item.comments.find(c => c.comment_type === 'revision_request') || item.comments[0]).comment 
        : 'Please update design as discussed.';
      revisionFeedbackHtml = `
        <div class="revision-feedback-card">
          <div class="feedback-tag">⚠️ Approver Revision Instructions:</div>
          <div class="feedback-body">"${escapeHtml(commentText)}"</div>
        </div>
      `;
    }

    let liveUrlHtml = '';
    if (item.status === 'Published' && item.publication && item.publication.published_url) {
      liveUrlHtml = `
        <div style="font-size: 11.5px; margin-top: 4px;">
          <a href="${escapeHtml(item.publication.published_url)}" target="_blank" style="color: #0D9488; font-weight: 800; text-decoration: underline;">
            View Live Post on Channel &rarr;
          </a>
        </div>
      `;
    }

    return `
      <div class="task-card" id="task-${item.id}">
        <!-- LEFT: PLAIN CONTENT ONLY -->
        <div class="task-info-col">
          <div class="task-meta-top">
            <span class="brand-chip ${brandClass}">${brandName}</span>
            <span class="status-chip ${statusClass}">${statusLabel}</span>
            ${item.latest_file_path && isVideoFile(item.latest_file_path, item.latest_file_type) ? '<span class="video-tag">🎬 Video Work</span>' : ''}
            <span class="task-schedule">📅 Scheduled: ${formatDate(item.publishing_date)}</span>
          </div>

          <h3 class="task-title">${escapeHtml(item.title)}</h3>

          ${item.headline ? `
            <div class="task-headline-box">
              Headline: "${escapeHtml(item.headline)}"
            </div>
          ` : ''}

          <!-- Plain Caption Copy Box -->
          <div class="plain-content-box">
            <div class="plain-content-label">
              <span>Plain Caption Copy</span>
              <button class="btn-mini-copy" data-copy="${encodeURIComponent(item.caption || '')}" title="Copy to clipboard">
                📋 Copy
              </button>
            </div>
            <div class="plain-content-text">${escapeHtml(item.caption || 'No caption text provided.')}</div>
          </div>

          <!-- Revision Feedback Notice (If any) -->
          ${revisionFeedbackHtml}

          <!-- Live Post Link (If published) -->
          ${liveUrlHtml}
        </div>

        <!-- RIGHT: ARTWORK SURFACE & ROLE ACTION ONLY -->
        <div class="task-action-col">
          <div class="artwork-display" title="Click to open Fullscreen Lightbox">
            ${item.latest_file_path ? (
              isVideoFile(item.latest_file_path, item.latest_file_type) ? `
                <video src="${item.latest_file_path}" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                <span class="video-version-pill">🎬 Video V${item.latest_version || 1}</span><span class="expand-media-hint">⛶ Fullscreen</span>
              ` : `
                <img src="${item.latest_file_path}" alt="Artwork" onerror="this.parentElement.innerHTML='<div class=\\'artwork-none\\'><span class=\\'artwork-none-icon\\'>🎨</span><span class=\\'artwork-none-text\\'>Artwork File</span></div>';">
                <span class="artwork-version-pill">Artwork V${item.latest_version || 1}</span><span class="expand-media-hint">⛶ Fullscreen</span>
              `
            ) : `
              <div class="artwork-none">
                <span class="artwork-none-icon">🎨</span>
                <span class="artwork-none-text">No Artwork Uploaded</span>
              </div>
            `}
          </div>

          <!-- Role Action Button -->
          <div class="role-buttons">
            ${actionButtonsHtml}
          </div>
        </div>
      </div>
    `;
  }

  function attachCardListeners(container) {
    // Fullscreen Lightbox Trigger on Artwork / Video Click
    container.querySelectorAll('.artwork-display').forEach(display => {
      const card = display.closest('.task-card');
      if (card) {
        const id = card.id.replace('task-', '');
        display.onclick = () => openLightbox(id);
      }
    });

    // Claim Brief Trigger (for Designers on unassigned briefs)
    container.querySelectorAll('[data-action="claim-task"]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          await API.updateContent(id, { designer_id: state.currentUser.id });
          await API.changeStatus(id, 'In Design', 'Task claimed by ' + state.currentUser.name);
          showToast('✓ You have claimed this brief!', 'success');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });

    container.querySelectorAll('[data-action="upload"]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        document.getElementById('upload-content-id').value = id;
        document.getElementById('upload-file-input').value = '';
        document.getElementById('upload-note-input').value = '';
        document.getElementById('modal-upload-artwork').classList.add('open');
      };
    });

    container.querySelectorAll('[data-action="approve"]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = 'Approving...';
        try {
          await API.changeStatus(id, 'Approved', 'Approved by ' + state.currentUser.name);
          showToast('✓ Post Approved!', 'success');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '✓ Approve';
        }
      };
    });

    container.querySelectorAll('[data-action="request-changes"]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        document.getElementById('changes-content-id').value = id;
        document.getElementById('changes-comment-input').value = '';
        document.getElementById('modal-request-changes').classList.add('open');
      };
    });

    container.querySelectorAll('[data-action="publish-live"]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        document.getElementById('publish-content-id').value = id;
        document.getElementById('modal-publish').classList.add('open');
      };
    });

    container.querySelectorAll('[data-action="submit-to-designer"]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          await API.changeStatus(id, 'In Design', 'Submitted for graphic design');
          showToast('✓ Brief assigned to graphic designer', 'info');
          await loadWorkspace();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });

    container.querySelectorAll('.btn-mini-copy').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const text = decodeURIComponent(btn.getAttribute('data-copy'));
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = '✓ Copied!';
          setTimeout(() => btn.textContent = orig, 1800);
        } catch {
          showToast('Caption copied!', 'info');
        }
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
