/**
 * Gilberto Admin Center — healthcare CRM administration module.
 * Self-contained IIFE; exposes window.GilbertoAdmin and window.gilbertoRecordAdminAudit.
 */
(function () {
  "use strict";

  function adminEsc(v) {
    return String(v == null ? "" : v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function loadScoped(key) {
    if (typeof window.gilbertoLoadScopedRows === "function") {
      return window.gilbertoLoadScopedRows(key);
    }
    try {
      const sk =
        typeof window.gilbertoScopedStorageKey === "function"
          ? window.gilbertoScopedStorageKey(key)
          : key + ":no-org";
      const rows = JSON.parse(localStorage.getItem(sk) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function saveScoped(key, rows) {
    if (typeof window.gilbertoSaveScopedRows === "function") {
      window.gilbertoSaveScopedRows(key, rows);
      return;
    }
    const sk =
      typeof window.gilbertoScopedStorageKey === "function"
        ? window.gilbertoScopedStorageKey(key)
        : key + ":no-org";
    localStorage.setItem(sk, JSON.stringify(rows || []));
  }

  function loadObject(key, fallback) {
    try {
      const sk =
        typeof window.gilbertoScopedStorageKey === "function"
          ? window.gilbertoScopedStorageKey(key)
          : key + ":no-org";
      const raw = localStorage.getItem(sk);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveObject(key, obj) {
    const sk =
      typeof window.gilbertoScopedStorageKey === "function"
        ? window.gilbertoScopedStorageKey(key)
        : key + ":no-org";
    localStorage.setItem(sk, JSON.stringify(obj || {}));
  }

  function uid() {
    return "ga_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysSince(iso) {
    if (!iso) return 9999;
    const t = new Date(iso).getTime();
    if (!t) return 9999;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function minutesSince(iso) {
    if (!iso) return 9999;
    const t = new Date(iso).getTime();
    if (!t) return 9999;
    return Math.max(0, Math.round((Date.now() - t) / 60000));
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return String(iso);
    }
  }

  function pageLabel(page) {
    const p = String(page || "").replace(".html", "").replace(/-/g, " ");
    return p ? p.replace(/\b\w/g, function (m) { return m.toUpperCase(); }) : "Gilberto CRM";
  }

  var STORAGE = {
    users: "gilberto_admin_users",
    roles: "gilberto_admin_roles",
    scopes: "gilberto_admin_scopes",
    settings: "gilberto_admin_settings",
    billing: "gilberto_admin_billing",
    identity: "gilberto_admin_identity",
    locked: "gilberto_admin_locked",
    revoked: "gilberto_admin_revoked",
    removed: "gilberto_admin_removed_users",
    audit: "gilberto_audit_events",
  };

  var USER_STATUSES = [
    "Active",
    "Pending Invite",
    "Locked",
    "Disabled",
    "Dormant",
    "Terminated",
  ];

  var SCOPE_TYPES = [
    "Global",
    "Region",
    "Site",
    "Team",
    "Client",
    "Provider",
    "Relationship",
  ];

  var PERMISSION_CATALOG = [
    { key: "users.view", domain: "users", action: "view", label: "View users", auditRequired: false },
    { key: "users.invite", domain: "users", action: "invite", label: "Invite users", auditRequired: true },
    { key: "users.edit", domain: "users", action: "edit", label: "Edit users", auditRequired: true },
    { key: "users.disable", domain: "users", action: "disable", label: "Disable users", auditRequired: true },
    { key: "users.terminate", domain: "users", action: "terminate", label: "Terminate users", auditRequired: true },
    { key: "users.delete", domain: "users", action: "delete", label: "Remove users from list", auditRequired: true },
    { key: "users.reset_password", domain: "users", action: "reset_password", label: "Reset passwords", auditRequired: true },
    { key: "users.force_logout", domain: "users", action: "force_logout", label: "Force logout users", auditRequired: true },
    { key: "users.lock", domain: "users", action: "lock", label: "Lock accounts", auditRequired: true },
    { key: "roles.view", domain: "roles", action: "view", label: "View roles", auditRequired: false },
    { key: "roles.create", domain: "roles", action: "create", label: "Create roles", auditRequired: true },
    { key: "roles.edit", domain: "roles", action: "edit", label: "Edit roles", auditRequired: true },
    { key: "roles.delete", domain: "roles", action: "delete", label: "Delete roles", auditRequired: true },
    { key: "roles.assign", domain: "roles", action: "assign", label: "Assign roles", auditRequired: true },
    { key: "scopes.view", domain: "scopes", action: "view", label: "View scopes", auditRequired: false },
    { key: "scopes.create", domain: "scopes", action: "create", label: "Create scopes", auditRequired: true },
    { key: "scopes.edit", domain: "scopes", action: "edit", label: "Edit scopes", auditRequired: true },
    { key: "scopes.delete", domain: "scopes", action: "delete", label: "Delete scopes", auditRequired: true },
    { key: "scopes.assign", domain: "scopes", action: "assign", label: "Assign scopes", auditRequired: true },
    { key: "identity.view", domain: "identity", action: "view", label: "View identity settings", auditRequired: false },
    { key: "identity.edit", domain: "identity", action: "edit", label: "Edit identity settings", auditRequired: true },
    { key: "providers.view", domain: "providers", action: "view", label: "View providers", auditRequired: false },
    { key: "providers.manage", domain: "providers", action: "manage", label: "Manage providers", auditRequired: true },
    { key: "billing.view", domain: "billing", action: "view", label: "View billing configuration", auditRequired: false },
    { key: "billing.create", domain: "billing", action: "create", label: "Create billing items", auditRequired: true },
    { key: "billing.edit", domain: "billing", action: "edit", label: "Edit billing items", auditRequired: true },
    { key: "billing.delete", domain: "billing", action: "delete", label: "Delete billing items", auditRequired: true },
    { key: "audit.view", domain: "audit", action: "view", label: "View audit logs", auditRequired: false },
    { key: "audit.export", domain: "audit", action: "export", label: "Export audit logs", auditRequired: true },
    { key: "reports.view", domain: "reports", action: "view", label: "View reports", auditRequired: false },
    { key: "reports.export", domain: "reports", action: "export", label: "Export reports", auditRequired: true },
    { key: "online.view", domain: "online", action: "view", label: "View online users", auditRequired: false },
    { key: "online.force_logout", domain: "online", action: "force_logout", label: "Force logout online users", auditRequired: true },
    { key: "online.lock", domain: "online", action: "lock", label: "Lock online accounts", auditRequired: true },
  ];

  function permMap(all) {
    var map = {};
    PERMISSION_CATALOG.forEach(function (p) {
      map[p.key] = !!all;
    });
    return map;
  }

  function permSubset(keys) {
    var map = {};
    PERMISSION_CATALOG.forEach(function (p) {
      map[p.key] = keys.indexOf(p.key) >= 0;
    });
    return map;
  }

  var DEFAULT_ROLES = [
    { id: "owner", name: "Owner", priority: 100, system: true, permissions: permMap(true) },
    {
      id: "admin",
      name: "Admin",
      priority: 90,
      system: true,
      permissions: (function () {
        var m = permMap(true);
        return m;
      })(),
    },
    {
      id: "manager",
      name: "Manager",
      priority: 70,
      system: true,
      permissions: permSubset([
        "users.view", "users.invite", "users.edit", "users.disable", "users.reset_password",
        "roles.view", "roles.assign", "scopes.view", "scopes.assign",
        "identity.view", "providers.view", "reports.view", "online.view",
      ]),
    },
    {
      id: "billing_manager",
      name: "Billing Manager",
      priority: 60,
      system: true,
      permissions: permSubset([
        "billing.view", "billing.create", "billing.edit", "billing.delete",
        "reports.view", "reports.export", "audit.view", "users.view",
      ]),
    },
    {
      id: "auditor",
      name: "Auditor",
      priority: 50,
      system: true,
      permissions: permSubset([
        "audit.view", "audit.export", "reports.view", "reports.export",
        "users.view", "roles.view", "scopes.view", "identity.view",
      ]),
    },
    {
      id: "provider_manager",
      name: "Provider Manager",
      priority: 55,
      system: true,
      permissions: permSubset([
        "providers.view", "providers.manage", "scopes.view", "users.view", "reports.view",
      ]),
    },
    {
      id: "viewer",
      name: "Viewer",
      priority: 10,
      system: true,
      permissions: permSubset([
        "users.view", "roles.view", "scopes.view", "identity.view",
        "providers.view", "billing.view", "audit.view", "reports.view", "online.view",
      ]),
    },
    {
      id: "support_staff",
      name: "Support Staff",
      priority: 40,
      system: true,
      permissions: permSubset([
        "users.view", "users.edit", "users.reset_password", "users.force_logout",
        "online.view", "online.force_logout", "audit.view",
      ]),
    },
  ];

  var DEFAULT_IDENTITY = {
    mfaPolicy: "Recommended",
    ssoEnabled: false,
    adminIdleTimeoutMinutes: 30,
    passwordMinLength: 12,
    passwordRequireSpecial: true,
    sessionMaxHours: 12,
    reauthForSensitive: true,
  };

  var DEFAULT_SETTINGS = {
    legalName: "",
    displayName: "",
    address: "",
    timezone: "America/New_York",
    privacyContact: "",
    securityContact: "",
    retentionPolicy: "7 years",
    clinicalDefaults: "ABA standard",
    sites: [],
  };

  function AdminCenter() {
    this.users = [];
    this.roles = [];
    this.scopes = [];
    this.settings = {};
    this.billing = [];
    this.identity = {};
    this.lockedIds = [];
    this.revokedIds = [];
    this.removedUserIds = [];
    this.auditEvents = [];
    this.providers = [];
    this.presenceRows = [];
    this.onlineByUserId = {};
    this.userFilter = "all";
    this.auditFilters = { actor: "", action: "", dateFrom: "", dateTo: "" };
    this._confirmResolve = null;
    this._presenceInterval = null;
    this._navObserver = null;
    this._sessions = [];
  }

  AdminCenter.prototype.toast = function (message, type) {
    var t = document.createElement("div");
    var bg = type === "error" ? "#b33a3a" : "#2d4a3e";
    t.style.cssText =
      "position:fixed;bottom:24px;right:24px;max-width:380px;background:" + bg +
      ";color:white;padding:12px 16px;border-radius:10px;font-size:13px;line-height:1.45;z-index:99999;box-shadow:0 12px 28px rgba(20,32,27,.22);";
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, type === "error" ? 5200 : 3200);
  };

  AdminCenter.prototype.toastSuccess = function (msg) { this.toast(msg, "success"); };
  AdminCenter.prototype.toastError = function (msg) { this.toast(msg, "error"); };

  AdminCenter.prototype.confirmAction = function (message) {
    var self = this;
    return new Promise(function (resolve) {
      self._confirmResolve = resolve;
      var msgEl = document.getElementById("adminConfirmMessage");
      if (msgEl) msgEl.textContent = message;
      self.openModal("adminConfirmModal");
    });
  };

  AdminCenter.prototype.resolveConfirm = function (accepted) {
    this.closeModal("adminConfirmModal");
    if (this._confirmResolve) {
      var fn = this._confirmResolve;
      this._confirmResolve = null;
      fn(!!accepted);
    }
  };

  AdminCenter.prototype.getCurrentActor = function () {
    var name = window.gilbertoCurrentUserName || "Current User";
    var email = window.gilbertoCurrentUserEmail || "";
    return { name: name, email: email };
  };

  AdminCenter.prototype.getCurrentUserRecord = function () {
    var actor = this.getCurrentActor();
    var uid = window.gilbertoCurrentUserId || "";
    return this.users.find(function (u) {
      if (uid && u.userId === uid) return true;
      return (actor.email && u.email === actor.email) || u.name === actor.name;
    }) || null;
  };

  AdminCenter.prototype.isPlaceholderEmail = function (email) {
    var e = String(email || "").trim().toLowerCase();
    if (!e) return true;
    return e.endsWith("@workspace.local") || e.indexOf("member+") === 0 || e === "owner@workspace.local";
  };

  AdminCenter.prototype.isPlaceholderName = function (name) {
    var n = String(name || "").trim();
    if (!n || n === "Current User" || n === "Workspace member") return true;
    return this.isPlaceholderEmail(n);
  };

  AdminCenter.prototype.pickBestEmail = function () {
    for (var i = 0; i < arguments.length; i += 1) {
      var candidate = String(arguments[i] || "").trim();
      if (candidate && !this.isPlaceholderEmail(candidate)) return candidate;
    }
    return "";
  };

  AdminCenter.prototype.pickBestName = function () {
    for (var i = 0; i < arguments.length; i += 1) {
      var candidate = String(arguments[i] || "").trim();
      if (candidate && !this.isPlaceholderName(candidate)) return candidate;
    }
    return "";
  };

  AdminCenter.prototype.displayEmail = function (user) {
    var email = this.pickBestEmail(user && user.email);
    return email || "—";
  };

  AdminCenter.prototype.displayName = function (user) {
    if (!user) return "—";
    var name = this.pickBestName(user.name);
    if (name) return name;
    var email = this.pickBestEmail(user.email);
    if (email) return email.split("@")[0];
    if (user.userId) return "Workspace member";
    return "—";
  };

  AdminCenter.prototype.sanitizeStoredUsers = function () {
    var self = this;
    var changed = false;
    this.users.forEach(function (u) {
      if (self.isPlaceholderEmail(u.email)) {
        u.email = "";
        changed = true;
      }
      if (self.isPlaceholderName(u.name)) {
        u.name = "";
        changed = true;
      }
      var email = self.pickBestEmail(u.email);
      if (!u.name && email) {
        u.name = email.split("@")[0];
        changed = true;
      }
    });
    if (changed) this.persistUsers();
  };

  AdminCenter.prototype.isUserRemoved = function (userOrId) {
    var id = typeof userOrId === "string" ? userOrId : (userOrId && (userOrId.userId || userOrId.id));
    if (!id) return false;
    return this.removedUserIds.indexOf(id) >= 0;
  };

  AdminCenter.prototype.persistRemoved = function () {
    saveScoped(STORAGE.removed, this.removedUserIds);
  };

  AdminCenter.prototype.findStoredUserForMember = function (member, email) {
    var self = this;
    if (!member || !member.user_id) return null;
    var uid = String(member.user_id);
    var uidPrefix = uid.slice(0, 8);
    return this.users.find(function (u) {
      if (u.userId === member.user_id) return true;
      if (email && u.email === email) return true;
      if (self.isPlaceholderEmail(u.email) && u.email.indexOf(uidPrefix) >= 0) return true;
      if (self.isPlaceholderName(u.name) && String(u.name).indexOf(uidPrefix) >= 0) return true;
      return false;
    }) || null;
  };

  AdminCenter.prototype.reconcileUsersWithWorkspace = function (remoteMembers, identityMap) {
    var self = this;
    var remoteIds = {};
    (remoteMembers || []).forEach(function (m) {
      if (m && m.user_id) remoteIds[m.user_id] = true;
    });

    this.users = this.users.filter(function (u) {
      if (self.isUserRemoved(u)) return false;
      if (u.userId && remoteIds[u.userId]) return true;
      if (u.status === "Pending Invite" && u.email && !self.isPlaceholderEmail(u.email)) return true;
      if (self.isPlaceholderEmail(u.email) || self.isPlaceholderName(u.name)) return false;
      if (!u.userId && u.email && !self.isPlaceholderEmail(u.email)) return true;
      return !!u.userId;
    });

    var seen = {};
    this.users = this.users.filter(function (u) {
      if (!u.userId) return true;
      if (seen[u.userId]) return false;
      seen[u.userId] = true;
      return true;
    });

    Object.keys(identityMap || {}).forEach(function (userId) {
      if (!remoteIds[userId]) return;
      var idRow = identityMap[userId] || {};
      var email = self.pickBestEmail(idRow.email);
      var name = self.pickBestName(idRow.full_name, email);
      var found = self.users.find(function (u) { return u.userId === userId; });
      if (!found) return;
      if (email) found.email = email;
      if (name) found.name = name;
      else if (email) found.name = email.split("@")[0];
      if (idRow.last_seen_at) found.lastLogin = idRow.last_seen_at;
    });
  };

  AdminCenter.prototype.buildFullNameFromParts = function (row) {
    if (!row) return "";
    var direct = String(row.full_name || row.contact_name || row.name || "").trim();
    if (direct && direct !== "Workspace member" && direct !== "Current User") return direct;
    var parts = [row.contact_first_name, row.contact_last_name].filter(function (p) {
      return p && String(p).trim();
    });
    if (parts.length) return parts.join(" ").trim();
    return "";
  };

  AdminCenter.prototype.fetchWorkspaceIdentityMap = async function (orgId) {
    var map = {};
    if (!window.supabaseClient || !orgId) return map;

    try {
      var rpc = await window.supabaseClient.rpc("admin_list_org_members", { p_org_id: orgId });
      if (!rpc.error && Array.isArray(rpc.data)) {
        rpc.data.forEach(function (m) {
          if (!m || !m.user_id) return;
          map[m.user_id] = {
            email: this.pickBestEmail(m.email, map[m.user_id] && map[m.user_id].email),
            full_name: this.pickBestName(
              this.buildFullNameFromParts(m),
              map[m.user_id] && map[m.user_id].full_name
            ),
            current_page: "",
            last_seen_at: "",
          };
        }, this);
      }
    } catch (_) {}

    try {
      var sessRpc = await window.supabaseClient.rpc("admin_list_workspace_identities", { p_org_id: orgId });
      if (!sessRpc.error && Array.isArray(sessRpc.data)) {
        sessRpc.data.forEach(function (s) {
          if (!s || !s.user_id) return;
          var prev = map[s.user_id] || {};
          map[s.user_id] = {
            email: this.pickBestEmail(s.email, prev.email),
            full_name: this.pickBestName(s.full_name, prev.full_name, s.email),
            current_page: s.current_page || prev.current_page || "",
            last_seen_at: s.last_activity_at || prev.last_seen_at || "",
            role: s.role || prev.role || "",
          };
        }, this);
      }
    } catch (_) {}

    try {
      var sessQ = await window.supabaseClient
        .from("workspace_user_sessions")
        .select("user_id, email, full_name, role, current_page, last_activity_at")
        .eq("org_id", orgId)
        .is("logout_time", null)
        .order("last_activity_at", { ascending: false });
      if (!sessQ.error && sessQ.data) {
        sessQ.data.forEach(function (s) {
          if (!s || !s.user_id) return;
          var prev = map[s.user_id] || {};
          if (prev.email && prev.full_name && prev.last_seen_at) return;
          map[s.user_id] = {
            email: this.pickBestEmail(s.email, prev.email),
            full_name: this.pickBestName(s.full_name, prev.full_name, s.email),
            current_page: s.current_page || prev.current_page || "",
            last_seen_at: s.last_activity_at || prev.last_seen_at || "",
            role: s.role || prev.role || "",
          };
        }, this);
      }
    } catch (_) {}

    try {
      var presQ = await window.supabaseClient
        .from("workspace_user_presence")
        .select("user_id, email, full_name, current_page, last_seen_at")
        .eq("org_id", orgId)
        .order("last_seen_at", { ascending: false });
      if (!presQ.error && presQ.data) {
        presQ.data.forEach(function (p) {
          if (!p || !p.user_id) return;
          var prev = map[p.user_id] || {};
          map[p.user_id] = {
            email: this.pickBestEmail(p.email, prev.email),
            full_name: this.pickBestName(p.full_name, prev.full_name, p.email),
            current_page: p.current_page || prev.current_page || "",
            last_seen_at: p.last_seen_at || prev.last_seen_at || "",
          };
        }, this);
      }
    } catch (_) {}

    try {
      var sess = await window.supabaseClient.auth.getSession();
      var user = sess?.data?.session?.user;
      if (user && user.id) {
        var row = map[user.id] || {};
        var profName = "";
        if (typeof window.gilbertoLoadAuthProfile === "function") {
          try {
            var prof = await window.gilbertoLoadAuthProfile(window.supabaseClient, user.id);
            profName = prof && prof.full_name ? String(prof.full_name).trim() : "";
          } catch (_) {}
        }
        map[user.id] = {
          email: this.pickBestEmail(user.email, row.email),
          full_name: this.pickBestName(
            profName,
            user.user_metadata?.full_name,
            window.gilbertoCurrentUserName,
            row.full_name,
            user.email
          ),
          current_page: row.current_page || "",
          last_seen_at: row.last_seen_at || nowIso(),
        };
      }
    } catch (_) {}

    return map;
  };

  AdminCenter.prototype.reconcileStoredUserEmails = function (identityMap) {
    var self = this;
    var actor = this.getCurrentActor();
    var uid = window.gilbertoCurrentUserId || "";
    var changed = false;
    this.users.forEach(function (u) {
      var idRow = u.userId && identityMap[u.userId] ? identityMap[u.userId] : null;
      var bestEmail = self.pickBestEmail(
        idRow && idRow.email,
        uid && u.userId === uid ? actor.email : "",
        u.email
      );
      var bestName = self.pickBestName(
        idRow && idRow.full_name,
        uid && u.userId === uid ? actor.name : "",
        bestEmail,
        u.name
      );
      if (bestEmail && bestEmail !== u.email) {
        u.email = bestEmail;
        changed = true;
      } else if (self.isPlaceholderEmail(u.email)) {
        u.email = "";
        changed = true;
      }
      if (bestName && bestName !== u.name) {
        u.name = bestName;
        changed = true;
      }
      if (idRow) {
        if (idRow.current_page && u.currentPage !== idRow.current_page) {
          u.currentPage = idRow.current_page;
          changed = true;
        }
        if (idRow.last_seen_at && u.lastLogin !== idRow.last_seen_at) {
          u.lastLogin = idRow.last_seen_at;
          changed = true;
        }
      }
    });
    if (changed) this.persistUsers();
  };

  AdminCenter.prototype.hasPermission = function (key) {
    var orgRole = String(window.gilbertoCurrentOrg?.role || "").toLowerCase();
    if (orgRole === "owner") return true;
    var me = this.getCurrentUserRecord();
    if (me && me.roleId === "owner") return true;
    if (typeof window.gilbertoIsAdminRole === "function" && window.gilbertoIsAdminRole() && key !== "roles.delete") {
      if (orgRole === "admin") return true;
    }
    var roleId = me ? me.roleId : orgRole;
    var role = this.roles.find(function (r) { return r.id === roleId; });
    if (!role) {
      role = this.roles.find(function (r) { return r.id === "admin"; });
    }
    if (!role || !role.permissions) return false;
    return !!role.permissions[key];
  };

  AdminCenter.prototype.persistUsers = function () {
    saveScoped(STORAGE.users, this.users);
  };

  AdminCenter.prototype.persistRoles = function () {
    saveScoped(STORAGE.roles, this.roles);
  };

  AdminCenter.prototype.persistScopes = function () {
    saveScoped(STORAGE.scopes, this.scopes);
  };

  AdminCenter.prototype.persistBilling = function () {
    saveScoped(STORAGE.billing, this.billing);
  };

  AdminCenter.prototype.persistLocked = function () {
    saveScoped(STORAGE.locked, this.lockedIds);
  };

  AdminCenter.prototype.persistRevoked = function () {
    saveScoped(STORAGE.revoked, this.revokedIds);
  };

  AdminCenter.prototype.persistSettings = function () {
    saveObject(STORAGE.settings, this.settings);
  };

  AdminCenter.prototype.persistIdentity = function () {
    saveObject(STORAGE.identity, this.identity);
  };

  AdminCenter.prototype.persistAudit = function () {
    saveScoped(STORAGE.audit, this.auditEvents.slice(0, 500));
  };

  AdminCenter.prototype.recordAudit = function (event) {
    var actor = this.getCurrentActor();
    var entry = {
      id: uid(),
      createdAt: nowIso(),
      user: actor.name,
      actorEmail: actor.email || "",
      action: event.action || "Recorded event",
      area: event.area || event.module || "Administration",
      affectedUser: event.affectedUser || "",
      oldValue: event.oldValue != null ? String(event.oldValue) : "",
      newValue: event.newValue != null ? String(event.newValue) : "",
      status: event.status || "Success",
      risk: event.risk || "Medium",
      details: event.details || "",
      module: event.module || "Admin Center",
    };
    this.auditEvents.unshift(entry);
    this.persistAudit();
    this.syncAuditToSupabase(entry);
    if (this.hasPermission("audit.view")) {
      this.renderAudit();
      this.renderComplianceStrip();
    }
    return entry;
  };

  AdminCenter.prototype.syncAuditToSupabase = async function (entry) {
    if (!window.supabaseClient || !window.gilbertoCurrentOrg?.id) return;
    try {
      await window.supabaseClient.from("admin_audit_logs").insert({
        org_id: window.gilbertoCurrentOrg.id,
        actor_name: entry.user,
        actor_email: entry.actorEmail,
        action: entry.action,
        area: entry.area,
        affected_user: entry.affectedUser,
        old_value: entry.oldValue,
        new_value: entry.newValue,
        status: entry.status,
        risk: entry.risk,
        details: entry.details,
        module: entry.module,
        created_at: entry.createdAt,
      });
    } catch (_) {
      /* silent fail when table missing */
    }
  };

  AdminCenter.prototype.seedDefaultsIfEmpty = function () {
    if (!this.roles.length) {
      this.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
      this.persistRoles();
    }
    if (!Object.keys(this.identity).length) {
      this.identity = Object.assign({}, DEFAULT_IDENTITY);
      this.persistIdentity();
    }
    if (!Object.keys(this.settings).length) {
      var org = window.gilbertoCurrentOrg || {};
      this.settings = Object.assign({}, DEFAULT_SETTINGS, {
        legalName: org.company_legal_name || org.name || "",
        displayName: org.company_display_name || org.name || "",
        address: org.address || org.company_address || "",
      });
      this.persistSettings();
    }
  };

  AdminCenter.prototype.seedCurrentUserAsOwner = async function () {
    var actor = this.getCurrentActor();
    var sessionUserId = null;
    var email = actor.email;
    try {
      if (window.supabaseClient) {
        var sess = await window.supabaseClient.auth.getSession();
        var user = sess?.data?.session?.user;
        if (user) {
          sessionUserId = user.id;
          email = user.email || email;
          if (!actor.name || actor.name === "Current User") {
            actor.name = user.user_metadata?.full_name || user.email || actor.name;
          }
        }
      }
    } catch (_) {}

    var existing = this.users.find(function (u) {
      return (sessionUserId && u.userId === sessionUserId) || (email && u.email === email);
    });
    if (existing) {
      if (sessionUserId) existing.userId = sessionUserId;
      if (email) existing.email = this.pickBestEmail(email, existing.email);
      if (actor.name && actor.name !== "Current User") existing.name = this.pickBestName(actor.name, existing.name);
      if (existing.roleId !== "owner" && String(window.gilbertoCurrentOrg?.role || "").toLowerCase() === "owner") {
        existing.roleId = "owner";
        existing.status = "Active";
      }
      this.persistUsers();
      return;
    }

    if (!this.users.length || String(window.gilbertoCurrentOrg?.role || "").toLowerCase() === "owner") {
      this.users.unshift({
        id: uid(),
        userId: sessionUserId || null,
        name: this.pickBestName(actor.name, email),
        email: this.pickBestEmail(email) || "",
        roleId: "owner",
        site: "HQ",
        scopeIds: [],
        mfaEnabled: false,
        status: "Active",
        lastLogin: nowIso(),
        invitedAt: nowIso(),
        loginAt: nowIso(),
        device: navigator.userAgent ? navigator.userAgent.slice(0, 80) : "",
        ip: "",
        currentPage: "",
      });
      this.persistUsers();
    }
  };

  AdminCenter.prototype.syncUsersFromSupabase = async function () {
    var orgId = window.gilbertoCurrentOrg?.id;
    if (!window.supabaseClient || !orgId) return;

    var identityMap = await this.fetchWorkspaceIdentityMap(orgId);
    var remoteMembers = [];
    try {
      var rpc = await window.supabaseClient.rpc("admin_list_org_members", { p_org_id: orgId });
      if (!rpc.error && Array.isArray(rpc.data)) {
        remoteMembers = rpc.data;
      }
    } catch (_) {}

    if (!remoteMembers.length) {
      try {
        var memQ = await window.supabaseClient
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", orgId);
        if (!memQ.error && memQ.data) {
          remoteMembers = memQ.data.map(function (m) {
            var idRow = identityMap[m.user_id] || {};
            return {
              user_id: m.user_id,
              role: m.role,
              email: idRow.email || "",
              full_name: idRow.full_name || "",
            };
          });
        }
      } catch (_) {}
    }

    if (!remoteMembers.length && Object.keys(identityMap).length) {
      remoteMembers = Object.keys(identityMap).map(function (userId) {
        var row = identityMap[userId];
        return {
          user_id: userId,
          role: row.role || "member",
          email: row.email || "",
          full_name: row.full_name || "",
        };
      });
    }

    Object.keys(identityMap).forEach(function (userId) {
      if (!userId || self.isUserRemoved(userId)) return;
      var row = identityMap[userId];
      if (!row || (!row.email && !row.full_name)) return;
      var exists = remoteMembers.some(function (m) { return m && m.user_id === userId; });
      if (exists) return;
      remoteMembers.push({
        user_id: userId,
        role: row.role || "member",
        email: row.email || "",
        full_name: row.full_name || "",
      });
    });

    var self = this;
    var changed = false;
    remoteMembers.forEach(function (m) {
      if (!m || !m.user_id) return;
      if (self.isUserRemoved(m.user_id)) return;
      var idRow = identityMap[m.user_id] || {};
      var email = self.pickBestEmail(m.email, idRow.email);
      var name = self.pickBestName(m.full_name, idRow.full_name, email);
      var roleId = String(m.role || "member").toLowerCase();
      if (roleId !== "owner" && roleId !== "admin" && roleId === "member") {
        roleId = "viewer";
      }

      var found = self.findStoredUserForMember(m, email);

      if (found) {
        var nextEmail = self.pickBestEmail(email, idRow.email, found.email);
        var nextName = self.pickBestName(name, idRow.full_name, found.name, nextEmail);
        if (nextName && found.name !== nextName) { found.name = nextName; changed = true; }
        else if (self.isPlaceholderName(found.name)) { found.name = nextName || (nextEmail ? nextEmail.split("@")[0] : ""); changed = true; }
        if (nextEmail && found.email !== nextEmail) { found.email = nextEmail; changed = true; }
        else if (self.isPlaceholderEmail(found.email)) { found.email = ""; changed = true; }
        if (!found.userId) { found.userId = m.user_id; changed = true; }
        if (idRow.last_seen_at) {
          found.currentPage = idRow.current_page || found.currentPage;
          found.lastLogin = idRow.last_seen_at || found.lastLogin;
          changed = true;
        }
        if (roleId === "owner" && found.roleId !== "owner") { found.roleId = "owner"; changed = true; }
        else if (roleId === "admin" && found.roleId !== "owner" && found.roleId !== "admin") {
          found.roleId = "admin";
          changed = true;
        }
      } else {
        self.users.push({
          id: uid(),
          userId: m.user_id,
          name: name,
          email: email,
          roleId: roleId === "owner" ? "owner" : roleId === "admin" ? "admin" : "viewer",
          site: "—",
          scopeIds: [],
          mfaEnabled: false,
          status: "Active",
          lastLogin: idRow.last_seen_at || "",
          invitedAt: nowIso(),
          loginAt: idRow.last_seen_at || "",
          device: "",
          ip: "",
          currentPage: idRow.current_page || "",
        });
        changed = true;
      }
    });

    this.reconcileUsersWithWorkspace(remoteMembers, identityMap);
    this.sanitizeStoredUsers();
    this.applyDerivedUserStatuses();
    this.persistUsers();
  };

  AdminCenter.prototype.purgeLegacyPlaceholderUsers = function () {
    var key =
      typeof window.gilbertoScopedStorageKey === "function"
        ? window.gilbertoScopedStorageKey("gilberto_admin_identity_migrated_v2")
        : "gilberto_admin_identity_migrated_v2";
    if (localStorage.getItem(key)) return;
    var self = this;
    this.users = this.users.filter(function (u) {
      return !self.isPlaceholderEmail(u.email) && !self.isPlaceholderName(u.name);
    });
    try {
      localStorage.setItem(key, "1");
    } catch (_) {}
    this.persistUsers();
  };

  AdminCenter.prototype.refreshUsersFromWorkspace = async function () {
    if (typeof window.gilbertoWriteWorkspacePresence === "function") {
      await window.gilbertoWriteWorkspacePresence();
    }
    await this.syncUsersFromSupabase();
    await this.refreshPresence();
    this.renderUsers();
    this.renderComplianceStrip();
    this.toastSuccess("User list refreshed from workspace.");
  };

  AdminCenter.prototype.startUsersOnlineRefresh = function () {
    var self = this;
    if (this._usersOnlineInterval) clearInterval(this._usersOnlineInterval);
    this._usersOnlineInterval = setInterval(function () {
      void self.refreshPresence().then(function () {
        self.renderUsers();
        self.renderOnlineUsersTable();
        self.renderComplianceStrip();
      });
    }, 30000);
  };

  AdminCenter.prototype.applyDerivedUserStatuses = function () {
    var self = this;
    this.users.forEach(function (u) {
      if (u.status === "Terminated" || u.status === "Disabled") return;
      if (self.revokedIds.indexOf(u.id) >= 0 || (u.userId && self.revokedIds.indexOf(u.userId) >= 0)) {
        u.status = "Terminated";
        return;
      }
      if (self.lockedIds.indexOf(u.id) >= 0 || (u.userId && self.lockedIds.indexOf(u.userId) >= 0)) {
        u.status = "Locked";
        return;
      }
      if (u.status === "Pending Invite") return;
      if (daysSince(u.lastLogin || u.loginAt) >= 90) {
        u.status = "Dormant";
      } else if (u.status === "Dormant") {
        u.status = "Active";
      }
    });
  };

  AdminCenter.prototype.loadProviders = async function () {
    this.providers = [];
    var orgId = window.gilbertoCurrentOrg?.id;
    if (!window.supabaseClient || !orgId) return;
    try {
      var q = await window.supabaseClient
        .from("providers")
        .select("id, name, provider_type, npi, taxonomy, license_number, license_expires, status")
        .eq("org_id", orgId)
        .order("name", { ascending: true });
      if (!q.error && q.data) this.providers = q.data;
    } catch (_) {}
  };

  AdminCenter.prototype.loadAllData = function () {
    this.users = loadScoped(STORAGE.users);
    this.roles = loadScoped(STORAGE.roles);
    this.scopes = loadScoped(STORAGE.scopes);
    this.billing = loadScoped(STORAGE.billing);
    this.settings = loadObject(STORAGE.settings, {});
    this.identity = loadObject(STORAGE.identity, {});
    this.lockedIds = loadScoped(STORAGE.locked);
    this.revokedIds = loadScoped(STORAGE.revoked);
    this.removedUserIds = loadScoped(STORAGE.removed);
    this.auditEvents = loadScoped(STORAGE.audit);
    if (!Array.isArray(this.users)) this.users = [];
    if (!Array.isArray(this.roles)) this.roles = [];
    if (!Array.isArray(this.scopes)) this.scopes = [];
    if (!Array.isArray(this.billing)) this.billing = [];
    if (!Array.isArray(this.lockedIds)) this.lockedIds = [];
    if (!Array.isArray(this.revokedIds)) this.revokedIds = [];
    if (!Array.isArray(this.removedUserIds)) this.removedUserIds = [];
    if (!Array.isArray(this.auditEvents)) this.auditEvents = [];
  };

  AdminCenter.prototype.init = async function () {
    if (typeof window.ensureGilbertoOrgReady === "function") {
      await window.ensureGilbertoOrgReady();
    } else if (typeof window.loadGilbertoOrganization === "function") {
      await window.loadGilbertoOrganization();
    }
    if (typeof window.resolveCurrentUserIdentity === "function") {
      await window.resolveCurrentUserIdentity();
    }

    this.loadAllData();
    this.purgeLegacyPlaceholderUsers();
    this.sanitizeStoredUsers();
    this.seedDefaultsIfEmpty();
    if (typeof window.gilbertoWriteWorkspacePresence === "function") {
      await window.gilbertoWriteWorkspacePresence();
    }
    await this.syncUsersFromSupabase();
    await this.syncUsersFromSupabase();
    await this.seedCurrentUserAsOwner();
    await this.loadProviders();
    await this.refreshPresence();
    this.recordSessionLoginAudit();

    this.initModals();
    this.initNavigation();
    this.wireSectionActions();
    this.renderAll();
    this.applyPermissionGating();
    this.startUsersOnlineRefresh();

    var hash = window.location.hash.replace("#", "");
    if (hash) this.navigateToSection(hash);
  };

  AdminCenter.prototype.recordSessionLoginAudit = function () {
    try {
      var key = typeof window.gilbertoScopedStorageKey === "function"
        ? window.gilbertoScopedStorageKey("gilberto_admin_login_logged")
        : "gilberto_admin_login_logged:no-org";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      this.recordAudit({ action: "Login", area: "Authentication", risk: "Low", status: "Success" });
    } catch (_) {}
  };

  AdminCenter.prototype.openModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("open");
  };

  AdminCenter.prototype.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("open");
  };

  AdminCenter.prototype.initModals = function () {
    if (document.getElementById("adminModalRoot")) return;
    var root = document.createElement("div");
    root.id = "adminModalRoot";
    root.innerHTML =
      '<div class="modal-overlay" id="adminConfirmModal" onclick="if(event.target===this)GilbertoAdmin.resolveConfirm(false)">' +
      '<div class="modal-box"><div class="modal-header"><h3>Confirm action</h3><button class="modal-close" type="button" onclick="GilbertoAdmin.resolveConfirm(false)">&times;</button></div>' +
      '<div class="modal-body"><p id="adminConfirmMessage">Are you sure?</p></div>' +
      '<div class="modal-footer"><button class="small-btn" type="button" onclick="GilbertoAdmin.resolveConfirm(false)">Cancel</button>' +
      '<button class="add-btn" type="button" onclick="GilbertoAdmin.resolveConfirm(true)">Confirm</button></div></div></div>' +

      '<div class="modal-overlay" id="adminUserModal" onclick="if(event.target===this)GilbertoAdmin.closeModal(\'adminUserModal\')">' +
      '<div class="modal-box wide"><div class="modal-header"><h3 id="adminUserModalTitle">User</h3><button class="modal-close" type="button" onclick="GilbertoAdmin.closeModal(\'adminUserModal\')">&times;</button></div>' +
      '<div class="modal-body admin-settings-grid" style="grid-template-columns:1fr 1fr;">' +
      '<label>Full Name<input id="adminUserName" type="text" placeholder="First and last name"/></label><label>Email<input id="adminUserEmail" type="email" placeholder="user@company.com"/></label>' +
      '<label>Role<select id="adminUserRole"></select></label><label>Site<input id="adminUserSite" type="text"/></label>' +
      '<label>Status<select id="adminUserStatus"></select></label><label>MFA<select id="adminUserMfa"><option value="false">Off</option><option value="true">On</option></select></label>' +
      '</div><div class="modal-footer"><button class="small-btn" type="button" onclick="GilbertoAdmin.closeModal(\'adminUserModal\')">Cancel</button>' +
      '<button class="add-btn" type="button" onclick="GilbertoAdmin.saveUserEditor()">Save</button></div></div></div>' +

      '<div class="modal-overlay" id="adminRoleModal" onclick="if(event.target===this)GilbertoAdmin.closeModal(\'adminRoleModal\')">' +
      '<div class="modal-box wide"><div class="modal-header"><h3 id="adminRoleModalTitle">Role</h3><button class="modal-close" type="button" onclick="GilbertoAdmin.closeModal(\'adminRoleModal\')">&times;</button></div>' +
      '<div class="modal-body"><label>Name<input id="adminRoleName" type="text"/></label><div id="adminRolePermGrid" class="admin-chip-row" style="margin-top:12px;"></div></div>' +
      '<div class="modal-footer"><button class="small-btn" type="button" onclick="GilbertoAdmin.closeModal(\'adminRoleModal\')">Cancel</button>' +
      '<button class="add-btn" type="button" onclick="GilbertoAdmin.saveRoleEditor()">Save</button></div></div></div>' +

      '<div class="modal-overlay" id="adminScopeModal" onclick="if(event.target===this)GilbertoAdmin.closeModal(\'adminScopeModal\')">' +
      '<div class="modal-box wide"><div class="modal-header"><h3 id="adminScopeModalTitle">Access Scope</h3><button class="modal-close" type="button" onclick="GilbertoAdmin.closeModal(\'adminScopeModal\')">&times;</button></div>' +
      '<div class="modal-body admin-settings-grid" style="grid-template-columns:1fr 1fr;">' +
      '<label>Name<input id="adminScopeName" type="text"/></label><label>Type<select id="adminScopeType"></select></label>' +
      '<label>Records<input id="adminScopeRecords" type="text" placeholder="e.g. Site A, Team North"/></label>' +
      '<label>Status<select id="adminScopeStatus"><option>Active</option><option>Inactive</option></select></label>' +
      '</div><div class="modal-footer"><button class="small-btn" type="button" onclick="GilbertoAdmin.closeModal(\'adminScopeModal\')">Cancel</button>' +
      '<button class="add-btn" type="button" onclick="GilbertoAdmin.saveScopeEditor()">Save</button></div></div></div>' +

      '<div class="modal-overlay" id="adminAccessModal" onclick="if(event.target===this)GilbertoAdmin.closeModal(\'adminAccessModal\')">' +
      '<div class="modal-box wide"><div class="modal-header"><h3>Effective Access Preview</h3><button class="modal-close" type="button" onclick="GilbertoAdmin.closeModal(\'adminAccessModal\')">&times;</button></div>' +
      '<div class="modal-body" id="adminAccessPreviewBody"></div>' +
      '<div class="modal-footer"><button class="add-btn" type="button" onclick="GilbertoAdmin.closeModal(\'adminAccessModal\')">Close</button></div></div></div>' +

      '<div class="modal-overlay" id="adminBillingModal" onclick="if(event.target===this)GilbertoAdmin.closeModal(\'adminBillingModal\')">' +
      '<div class="modal-box"><div class="modal-header"><h3 id="adminBillingModalTitle">Billing Item</h3><button class="modal-close" type="button" onclick="GilbertoAdmin.closeModal(\'adminBillingModal\')">&times;</button></div>' +
      '<div class="modal-body admin-settings-grid" style="grid-template-columns:1fr 1fr;">' +
      '<label>Service<input id="adminBillingService" type="text"/></label><label>CPT / HCPCS<input id="adminBillingCpt" type="text"/></label>' +
      '<label>POS<input id="adminBillingPos" type="text"/></label><label>Fee<input id="adminBillingFee" type="number" step="0.01"/></label>' +
      '<label>Auth Required<select id="adminBillingAuth"><option value="true">Yes</option><option value="false">No</option></select></label>' +
      '<label>Active<select id="adminBillingActive"><option value="true">Yes</option><option value="false">No</option></select></label>' +
      '</div><div class="modal-footer"><button class="small-btn" type="button" onclick="GilbertoAdmin.closeModal(\'adminBillingModal\')">Cancel</button>' +
      '<button class="add-btn" type="button" onclick="GilbertoAdmin.saveBillingEditor()">Save</button></div></div></div>';
    document.body.appendChild(root);
    this._editingUserId = null;
    this._editingRoleId = null;
    this._editingScopeId = null;
    this._editingBillingId = null;
  };

  AdminCenter.prototype.initNavigation = function () {
    var self = this;
    document.querySelectorAll(".admin-overview-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        e.preventDefault();
        var href = card.getAttribute("href") || "";
        var id = href.replace("#", "");
        if (id) self.navigateToSection(id);
      });
    });
    if (this._navObserver) this._navObserver.disconnect();
    var sections = document.querySelectorAll(".admin-section");
    if (!sections.length) return;
    this._navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          document.querySelectorAll(".admin-overview-card").forEach(function (c) {
            var active = (c.getAttribute("href") || "") === "#" + id;
            c.classList.toggle("is-active", active);
            if (active) c.style.outline = "3px solid rgba(91,125,245,.35)";
            else c.style.outline = "";
          });
        });
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: 0.1 }
    );
    sections.forEach(function (s) { self._navObserver.observe(s); });
  };

  AdminCenter.prototype.navigateToSection = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".admin-overview-card").forEach(function (c) {
      var active = (c.getAttribute("href") || "") === "#" + id;
      c.classList.toggle("is-active", active);
      c.style.outline = active ? "3px solid rgba(91,125,245,.35)" : "";
    });
    if (id === "online-users") {
      void this.refreshPresence();
    }
  };

  AdminCenter.prototype.wireSectionActions = function () {
    var self = this;
    var topOnline = document.getElementById("adminOnlineUsersBtn");
    if (topOnline) topOnline.onclick = function () { self.openOnlineUsersSection(); };

    var refreshOnline = document.getElementById("adminRefreshOnlineBtn");
    if (refreshOnline) {
      refreshOnline.onclick = function () {
        void self.refreshPresence().then(function () {
          self.renderOnlineUsersTable();
          self.toastSuccess("Online users refreshed.");
        });
      };
    }

    var inviteBtn = document.getElementById("adminInviteUserBtn");
    if (inviteBtn) inviteBtn.onclick = function () { self.openUserEditor(null); };

    if (!document.getElementById("adminRefreshUsersBtn")) {
      var refreshBtn = document.createElement("button");
      refreshBtn.id = "adminRefreshUsersBtn";
      refreshBtn.className = "small-btn";
      refreshBtn.type = "button";
      refreshBtn.textContent = "Refresh Users";
      refreshBtn.onclick = function () { self.refreshUsersFromWorkspace(); };
      var usersHead = document.querySelector("#users .admin-section-head");
      if (usersHead) usersHead.appendChild(refreshBtn);
    }

    document.querySelectorAll("[data-user-filter]").forEach(function (btn) {
      btn.onclick = function () {
        self.filterUsers(btn.getAttribute("data-user-filter") || "all");
        document.querySelectorAll("[data-user-filter]").forEach(function (b) {
          b.classList.toggle("is-filter-active", b === btn);
        });
      };
    });

    var createRole = document.getElementById("adminCreateRoleBtn");
    if (createRole) createRole.onclick = function () { self.openRoleEditor(null); };

    var previewBtn = document.getElementById("adminPreviewAccessBtn");
    if (previewBtn) previewBtn.onclick = function () {
      var sel = self.users.find(function (u) { return u.status === "Active"; }) || self.users[0];
      if (sel) self.previewEffectiveAccess(sel.id);
      else self.toastError("Add a user before previewing effective access.");
    };

    var scopesSec = document.getElementById("access-scopes");
    if (scopesSec && !scopesSec.querySelector("[data-scope-create]")) {
      var createScope = document.createElement("button");
      createScope.className = "add-btn";
      createScope.type = "button";
      createScope.dataset.scopeCreate = "1";
      createScope.textContent = "+ Create Scope";
      createScope.onclick = function () { self.openScopeEditor(null); };
      var head = scopesSec.querySelector(".admin-section-head");
      if (head) head.appendChild(createScope);
    }

    var exportAudit = document.getElementById("adminExportAuditBtn");
    if (exportAudit) exportAudit.onclick = function () { self.exportAuditReport(); };

    document.querySelectorAll("[data-audit-filter]").forEach(function (btn) {
      var kind = btn.getAttribute("data-audit-filter");
      btn.onclick = function () {
        if (kind === "date") self.promptAuditDateFilter();
        else if (kind === "actor") self.promptAuditActorFilter();
        else if (kind === "action") self.promptAuditActionFilter();
      };
    });

    var exportReports = document.getElementById("adminExportReportsBtn");
    if (exportReports) exportReports.onclick = function () { self.exportReports(); };
  };

  AdminCenter.prototype.searchUsers = function (query) {
    this._userSearch = String(query || "").toLowerCase();
    this.renderUsers();
  };

  AdminCenter.prototype.searchAudit = function (query) {
    this.auditFilters.search = String(query || "").toLowerCase();
    this.renderAudit();
  };

  AdminCenter.prototype.clearAuditFilters = function () {
    this.auditFilters = { actor: "", action: "", dateFrom: "", dateTo: "", search: "" };
    this.renderAudit();
    this.toastSuccess("Audit filters cleared.");
  };

  AdminCenter.prototype.applyPermissionGating = function () {
    var map = [
      { sel: "#adminInviteUserBtn", perm: "users.invite" },
      { sel: "#adminCreateRoleBtn", perm: "roles.create" },
      { sel: "#adminExportAuditBtn", perm: "audit.export" },
      { sel: "#adminExportReportsBtn", perm: "reports.export" },
      { sel: "#adminOnlineUsersBtn", perm: "online.view" },
    ];
    map.forEach(function (item) {
      var el = document.querySelector(item.sel);
      if (!el) return;
      if (!GilbertoAdmin.hasPermission(item.perm)) {
        el.disabled = true;
        el.style.opacity = "0.45";
        el.title = "Insufficient permissions";
      }
    });
  };

  AdminCenter.prototype.getRoleName = function (roleId) {
    var r = this.roles.find(function (x) { return x.id === roleId; });
    return r ? r.name : roleId || "—";
  };

  AdminCenter.prototype.statusBadge = function (status) {
    var s = String(status || "Active");
    var cls = "badge-active";
    if (s === "Pending Invite") cls = "badge-pending";
    else if (s === "Locked" || s === "Disabled" || s === "Terminated") cls = "badge-expiring";
    else if (s === "Dormant") cls = "badge-pending";
    return '<span class="badge ' + cls + '">' + adminEsc(s) + "</span>";
  };

  AdminCenter.prototype.getUserOnlineStatus = function (user) {
    if (!user || !user.userId) return { key: "offline", label: "Offline" };
    var row = this.onlineByUserId[user.userId];
    if (!row) return { key: "offline", label: "Offline" };
    return { key: row.status || "offline", label: row.label || "Offline" };
  };

  AdminCenter.prototype.onlineStatusBadgeForUser = function (user) {
    var st = this.getUserOnlineStatus(user);
    var cls = st.key === "online" ? "badge-active" : st.key === "idle" ? "badge-pending" : "badge-expiring";
    return '<span class="badge ' + cls + '">' + adminEsc(st.label) + "</span>";
  };

  AdminCenter.prototype.displayNameForUser = function (user) {
    var live = user && user.userId ? this.onlineByUserId[user.userId] : null;
    return this.displayName({
      name: this.pickBestName(live && live.full_name, user && user.name),
      email: this.pickBestEmail(live && live.email, user && user.email),
      userId: user && user.userId,
    });
  };

  AdminCenter.prototype.displayEmailForUser = function (user) {
    var live = user && user.userId ? this.onlineByUserId[user.userId] : null;
    return this.displayEmail({
      email: this.pickBestEmail(live && live.email, user && user.email),
      userId: user && user.userId,
    });
  };

  AdminCenter.prototype.indexOnlineUsers = function (rows) {
    var self = this;
    this.onlineByUserId = {};
    (rows || []).forEach(function (row) {
      if (!row || !row.user_id) return;
      var st = self.presenceStatus(row);
      var prev = self.onlineByUserId[row.user_id];
      var ts = row.last_activity_at || row.last_seen_at || "";
      if (prev && prev.last_activity_at && ts && new Date(prev.last_activity_at) > new Date(ts)) return;
      self.onlineByUserId[row.user_id] = {
        status: st.key,
        label: st.label,
        email: row.email || (prev && prev.email) || "",
        full_name: row.full_name || (prev && prev.full_name) || "",
        last_activity_at: ts,
        current_page: row.current_page || "",
      };
    });
  };

  AdminCenter.prototype.riskBadge = function (risk) {
    var v = String(risk || "Low");
    var cls = v.toLowerCase() === "high" ? "badge-expiring" : v.toLowerCase() === "medium" ? "badge-pending" : "badge-active";
    return '<span class="badge ' + cls + '">' + adminEsc(v) + "</span>";
  };

  AdminCenter.prototype.renderAll = function () {
    this.renderUsers();
    this.renderRoles();
    this.renderPermissionsTable();
    this.renderScopes();
    this.renderIdentity();
    this.renderProviders();
    this.renderOrgSettings();
    this.renderBilling();
    this.renderAudit();
    void this.renderReports();
    this.renderComplianceStrip();
  };

  AdminCenter.prototype.getFilteredUsers = function () {
    var f = this.userFilter;
    var q = this._userSearch || "";
    var self = this;
    return this.users.filter(function (u) {
      if (f === "pending" && u.status !== "Pending Invite") return false;
      if (f === "locked" && u.status !== "Locked") return false;
      if (f === "dormant" && u.status !== "Dormant") return false;
      if (q) {
        var online = self.getUserOnlineStatus(u).label;
        var hay = String(
          u.name + " " + u.email + " " + u.site + " " + u.status + " " + u.roleId + " " + online
        ).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  };

  AdminCenter.prototype.filterUsers = function (filterType) {
    this.userFilter = filterType || "all";
    this.renderUsers();
    this.toastSuccess("Showing " + filterType + " users.");
  };

  AdminCenter.prototype.renderUsers = function () {
    var body = document.getElementById("adminUsersBody");
    if (!body) return;
    var rows = this.getFilteredUsers();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#6b8c7a;">No users match this filter.</td></tr>';
      return;
    }
    var self = this;
    body.innerHTML = rows.map(function (u) {
      var scopeLabel = (u.scopeIds || []).length
        ? (u.scopeIds || []).map(function (sid) {
            var s = self.scopes.find(function (x) { return x.id === sid; });
            return s ? s.name : sid;
          }).join(", ")
        : (u.site || "—");
      var live = u.userId && self.onlineByUserId[u.userId];
      var lastActive = (live && live.last_activity_at) || u.lastLogin || u.loginAt;
      return "<tr><td>" + adminEsc(self.displayNameForUser(u)) + "</td><td>" + adminEsc(self.displayEmailForUser(u)) + "</td><td>" +
        adminEsc(self.getRoleName(u.roleId)) + "</td><td>" + adminEsc(scopeLabel) + "</td><td>" +
        (u.mfaEnabled ? '<span class="badge badge-active">On</span>' : '<span class="badge badge-pending">Off</span>') +
        "</td><td>" + self.statusBadge(u.status) + "</td><td>" + self.onlineStatusBadgeForUser(u) + "</td><td>" +
        adminEsc(formatDateTime(lastActive)) +
        '</td><td><button class="tbl-btn" type="button" onclick="GilbertoAdmin.openUserEditor(\'' + adminEsc(u.id) +
        "')\">Edit</button> <button class=\"tbl-btn\" type=\"button\" onclick=\"GilbertoAdmin.previewEffectiveAccess('" +
        adminEsc(u.id) + "')\">Access</button>" +
        (u.status !== "Disabled" && u.roleId !== "owner" ? ' <button class="tbl-btn" type="button" onclick="GilbertoAdmin.disableUser(\'' + adminEsc(u.id) + "')\">Disable</button>" : "") +
        (u.status !== "Terminated" && u.roleId !== "owner" ? ' <button class="tbl-btn danger" type="button" onclick="GilbertoAdmin.terminateUser(\'' + adminEsc(u.id) + "')\">Terminate</button>" : "") +
        (u.roleId !== "owner" && self.hasPermission("users.delete") ? ' <button class="tbl-btn danger" type="button" onclick="GilbertoAdmin.removeUserFromList(\'' + adminEsc(u.id) + "')\">Delete</button>" : "") +
        (u.status === "Locked" ? ' <button class="tbl-btn" type="button" onclick="GilbertoAdmin.reactivateUser(\'' + adminEsc(u.id) + "')\">Unlock</button>" : ' <button class="tbl-btn" type="button" onclick="GilbertoAdmin.lockUser(\'' + adminEsc(u.id) + "')\">Lock</button>") +
        ' <button class="tbl-btn" type="button" onclick="GilbertoAdmin.resetUserPassword(\'' + adminEsc(u.id) + "')\">Reset PW</button></td></tr>";
    }).join("");
  };

  AdminCenter.prototype.renderRoles = function () {
    var grid = document.getElementById("adminRolesGrid");
    if (!grid) return;
    var self = this;
    if (!this.roles.length) {
      grid.innerHTML = '<div class="admin-role-card"><strong>No roles configured</strong><span>Add a role to begin.</span></div>';
      return;
    }
    grid.innerHTML = this.roles.map(function (r) {
      var permCount = Object.keys(r.permissions || {}).filter(function (k) { return r.permissions[k]; }).length;
      var actions = '<button class="tbl-btn" type="button" onclick="GilbertoAdmin.openRoleEditor(\'' + adminEsc(r.id) +
        "')\">Edit</button>";
      if (!r.system && self.hasPermission("roles.delete")) {
        actions += ' <button class="tbl-btn danger" type="button" onclick="GilbertoAdmin.deleteRole(\'' + adminEsc(r.id) + "')\">Delete</button>";
      }
      if (self.hasPermission("roles.create")) {
        actions += ' <button class="tbl-btn" type="button" onclick="GilbertoAdmin.duplicateRole(\'' + adminEsc(r.id) + "')\">Duplicate</button>";
      }
      return '<div class="admin-role-card"><strong>' + adminEsc(r.name) + '</strong><span>' + permCount +
        " permissions · priority " + adminEsc(r.priority) + (r.system ? " · system" : "") + '</span><div style="margin-top:10px;">' + actions + "</div></div>";
    }).join("");
  };

  AdminCenter.prototype.renderPermissionsTable = function () {
    var body = document.getElementById("adminPermissionBody");
    if (!body) return;
    var self = this;
    var rows = [];
    PERMISSION_CATALOG.forEach(function (p) {
      self.roles.forEach(function (r) {
        if (!r.permissions || !r.permissions[p.key]) return;
        rows.push("<tr><td>" + adminEsc(p.domain) + "</td><td>" + adminEsc(p.action) + "</td><td>" +
          adminEsc(r.name) + "</td><td>" + (p.domain === "scopes" ? "Yes" : "—") + "</td><td>—</td><td>" +
          (p.auditRequired ? "Yes" : "No") + "</td></tr>");
      });
    });
    body.innerHTML = rows.length ? rows.join("") :
      '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b8c7a;">No role permission records configured yet.</td></tr>';
  };

  AdminCenter.prototype.renderScopes = function () {
    var body = document.getElementById("accessScopesBody");
    if (!body) return;
    var self = this;
    if (!this.scopes.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6b8c7a;">No access scope records yet. <button class="tbl-btn" type="button" onclick="GilbertoAdmin.openScopeEditor(null)">Create scope</button></td></tr>';
      return;
    }
    body.innerHTML = this.scopes.map(function (s) {
      var userCount = (s.assignedUserIds || []).length;
      var roleCount = (s.assignedRoleIds || []).length;
      return "<tr><td>" + adminEsc(s.name) + "</td><td>" + adminEsc(s.type) +
        "</td><td>" + userCount + "</td><td>" + roleCount + "</td><td>" + adminEsc(s.records || "—") +
        "</td><td>" + self.statusBadge(s.status || "Active") + "</td><td>" +
        '<button class="tbl-btn" type="button" onclick="GilbertoAdmin.openScopeEditor(\'' + adminEsc(s.id) +
        "')\">Edit</button> <button class=\"tbl-btn danger\" type=\"button\" onclick=\"GilbertoAdmin.deleteScope('" +
        adminEsc(s.id) + "')\">Delete</button></td></tr>";
    }).join("");
  };

  AdminCenter.prototype.renderIdentity = function () {
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    set("adminIdentityMfaSummary", this.identity.mfaPolicy || "Not configured");
    set("adminIdentitySsoSummary", this.identity.ssoEnabled ? "Connected" : "Not connected");
    set("adminIdentityIdleSummary", String(this.identity.adminIdleTimeoutMinutes || "—") + " min");
    set("adminIdentitySessionsSummary", this.presenceRows.filter(function (p) { return minutesSince(p.last_seen_at) <= 2; }).length + " online");
    var sec = document.getElementById("identity-authentication");
    if (sec && !document.getElementById("adminIdentityForm")) {
      var form = document.createElement("div");
      form.id = "adminIdentityForm";
      form.className = "admin-settings-grid";
      form.style.marginBottom = "14px";
      form.innerHTML =
        '<label>MFA Policy<select id="adminIdentityMfa"><option>Recommended</option><option>Required</option><option>Off</option></select></label>' +
        '<label>Idle Timeout (min)<input id="adminIdentityIdle" type="number" min="5" max="240"/></label>' +
        '<label>Password Min Length<input id="adminIdentityPwLen" type="number" min="8" max="32"/></label>' +
        '<label>Session Max (hours)<input id="adminIdentitySessionMax" type="number" min="1" max="24"/></label>' +
        '<button class="add-btn" type="button" id="adminSaveIdentityBtn" style="grid-column:1/-1;">Save Identity Settings</button>';
      sec.insertBefore(form, sec.querySelector(".table-wrapper"));
      document.getElementById("adminSaveIdentityBtn").onclick = function () {
        GilbertoAdmin.saveIdentitySettings({
          mfaPolicy: document.getElementById("adminIdentityMfa").value,
          adminIdleTimeoutMinutes: Number(document.getElementById("adminIdentityIdle").value) || 30,
          passwordMinLength: Number(document.getElementById("adminIdentityPwLen").value) || 12,
          sessionMaxHours: Number(document.getElementById("adminIdentitySessionMax").value) || 12,
        });
      };
    }
    var mfaEl = document.getElementById("adminIdentityMfa");
    if (mfaEl) mfaEl.value = this.identity.mfaPolicy || "Recommended";
    var idleEl = document.getElementById("adminIdentityIdle");
    if (idleEl) idleEl.value = this.identity.adminIdleTimeoutMinutes || 30;
    var pwEl = document.getElementById("adminIdentityPwLen");
    if (pwEl) pwEl.value = this.identity.passwordMinLength || 12;
    var sessEl = document.getElementById("adminIdentitySessionMax");
    if (sessEl) sessEl.value = this.identity.sessionMaxHours || 12;
    var body = document.getElementById("identitySessionsBody");
    if (!body) return;
    var rows = this.presenceRows.slice(0, 20);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b8c7a;">No active sessions in the last 10 minutes.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (p) {
      return "<tr><td>" + adminEsc(p.full_name || p.email) + "</td><td>Web</td><td>" +
        adminEsc(formatDateTime(p.last_seen_at)) + "</td><td>" + adminEsc(formatDateTime(p.last_seen_at)) +
        "</td><td>Standard</td><td><button class=\"tbl-btn\" type=\"button\" onclick=\"GilbertoAdmin.forceLogoutPresence('" +
        adminEsc(p.user_id || p.email) + "')\">Force logout</button></td></tr>";
    }).join("");
  };

  AdminCenter.prototype.renderProviders = function () {
    var body = document.getElementById("adminProvidersBody");
    if (!body) return;
    if (!this.providers.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6b8c7a;">No provider credential records loaded. Open Providers to manage data or connect the providers table.</td></tr>';
      return;
    }
    body.innerHTML = this.providers.map(function (p) {
      var exp = p.license_expires ? new Date(p.license_expires).toLocaleDateString() : "—";
      var licSt = p.license_status || p.status || "Active";
      var credSt = p.credential_status || "Valid";
      var alert = p.license_expires && daysSince(p.license_expires) <= 60 ? "Expiring soon" : "None";
      var licCls = String(licSt).toLowerCase() === "active" ? "badge-active" : "badge-expiring";
      return "<tr><td>" + adminEsc(p.name || p.full_name) + "</td><td>" + adminEsc(p.provider_type || "—") +
        '</td><td><span class="badge ' + licCls + '">' + adminEsc(licSt) + "</span></td><td>" + adminEsc(credSt) +
        "</td><td>" + adminEsc(exp) + "</td><td>" + adminEsc(alert) +
        '</td><td><button class="tbl-btn" type="button" onclick="goToPage(\'providers.html\')">Manage</button></td></tr>';
    }).join("");
  };

  AdminCenter.prototype.renderOrgSettings = function () {
    var org = window.gilbertoCurrentOrg || {};
    var s = this.settings;
    var nameEl = document.getElementById("adminOrgName");
    var addrEl = document.getElementById("adminOrgAddress");
    var tzEl = document.getElementById("adminOrgTimezone");
    if (nameEl) { nameEl.value = s.displayName || org.name || ""; nameEl.readOnly = !this.hasPermission("identity.edit"); }
    if (addrEl) { addrEl.value = s.address || org.address || ""; addrEl.readOnly = !this.hasPermission("identity.edit"); }
    if (tzEl) {
      tzEl.value = s.timezone || "America/New_York";
      tzEl.disabled = !this.hasPermission("identity.edit");
    }
    var inviteRole = document.getElementById("adminDefaultInviteRole");
    if (inviteRole) inviteRole.value = s.defaultInviteRole || "viewer";
    var privacy = document.getElementById("adminPrivacyContact");
    if (privacy) privacy.value = s.privacyContact || "";
    var security = document.getElementById("adminSecurityContact");
    if (security) security.value = s.securityContact || "";
    var retention = document.getElementById("adminRetentionPolicy");
    if (retention) retention.value = s.retentionPolicy || "7 years";
    var clinical = document.getElementById("adminClinicalDefaults");
    if (clinical) clinical.value = s.clinicalDefaults || "ABA standard";
    var grid = document.querySelector("#organization-settings .admin-settings-grid");
    if (grid && !document.getElementById("adminSaveSettingsBtn")) {
      var btn = document.createElement("button");
      btn.id = "adminSaveSettingsBtn";
      btn.className = "add-btn";
      btn.type = "button";
      btn.textContent = "Save Settings";
      btn.style.gridColumn = "1 / -1";
      btn.onclick = function () { GilbertoAdmin.saveOrgSettings(); };
      grid.appendChild(btn);
    }
  };

  AdminCenter.prototype.renderBilling = function () {
    var body = document.getElementById("billingConfigBody");
    if (!body) return;
    var sec = document.getElementById("billing-configuration");
    if (sec && !sec.querySelector(".add-btn[data-billing-add]")) {
      var head = sec.querySelector(".admin-section-head");
      if (head) {
        var add = document.createElement("button");
        add.className = "add-btn";
        add.type = "button";
        add.dataset.billingAdd = "1";
        add.textContent = "+ Add Service";
        add.onclick = function () { GilbertoAdmin.openBillingEditor(null); };
        head.appendChild(add);
      }
    }
    if (!this.billing.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6b8c7a;">No billing configuration records yet. Use Add Service to create billing rules.</td></tr>';
      return;
    }
    body.innerHTML = this.billing.map(function (b) {
      return "<tr><td>" + adminEsc(b.service) + "</td><td>" + adminEsc(b.cpt) + "</td><td>" + adminEsc(b.pos) +
        "</td><td>$" + adminEsc(String(b.fee)) + "</td><td>" + (b.authRequired ? "Yes" : "No") + "</td><td>" +
        (b.active ? '<span class="badge badge-active">Yes</span>' : '<span class="badge badge-expiring">No</span>') +
        "</td><td>" +
        '<button class="tbl-btn" type="button" onclick="GilbertoAdmin.openBillingEditor(\'' + adminEsc(b.id) +
        "')\">Edit</button> <button class=\"tbl-btn danger\" type=\"button\" onclick=\"GilbertoAdmin.deleteBillingItem('" +
        adminEsc(b.id) + "')\">Delete</button></td></tr>";
    }).join("");
  };

  AdminCenter.prototype.getFilteredAudit = function () {
    var f = this.auditFilters;
    return this.auditEvents.filter(function (e) {
      if (f.actor && String(e.user || "").toLowerCase().indexOf(f.actor.toLowerCase()) < 0) return false;
      if (f.action && String(e.action || "").toLowerCase().indexOf(f.action.toLowerCase()) < 0) return false;
      if (f.dateFrom && String(e.createdAt || "").slice(0, 10) < f.dateFrom) return false;
      if (f.dateTo && String(e.createdAt || "").slice(0, 10) > f.dateTo) return false;
      if (f.search) {
        var hay = String((e.user || "") + " " + (e.action || "") + " " + (e.area || "") + " " + (e.affectedUser || "") + " " + (e.details || "")).toLowerCase();
        if (hay.indexOf(f.search) < 0) return false;
      }
      return true;
    });
  };

  AdminCenter.prototype.filterAudit = function (filters) {
    this.auditFilters = Object.assign({}, this.auditFilters, filters || {});
    this.renderAudit();
  };

  AdminCenter.prototype.promptAuditDateFilter = function () {
    var from = window.prompt("From date (YYYY-MM-DD)", this.auditFilters.dateFrom || "");
    if (from === null) return;
    var to = window.prompt("To date (YYYY-MM-DD)", this.auditFilters.dateTo || todayIso());
    if (to === null) return;
    this.filterAudit({ dateFrom: from, dateTo: to });
    this.toastSuccess("Audit date filter applied.");
  };

  AdminCenter.prototype.promptAuditActorFilter = function () {
    var actor = window.prompt("Filter by actor name", this.auditFilters.actor || "");
    if (actor === null) return;
    this.filterAudit({ actor: actor });
    this.toastSuccess("Audit actor filter applied.");
  };

  AdminCenter.prototype.promptAuditActionFilter = function () {
    var action = window.prompt("Filter by action keyword", this.auditFilters.action || "");
    if (action === null) return;
    this.filterAudit({ action: action });
    this.toastSuccess("Audit action filter applied.");
  };

  AdminCenter.prototype.renderAudit = function () {
    var body = document.getElementById("auditLogsBody");
    if (!body) return;
    var rows = this.getFilteredAudit().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#6b8c7a;">No audit events recorded yet.</td></tr>';
    } else {
      var self = this;
      body.innerHTML = rows.map(function (r, i) {
        var statusCls = String(r.status || "Success").toLowerCase() === "failure" ? "badge-expiring" : "badge-active";
        return "<tr><td>" + adminEsc(formatDateTime(r.createdAt)) + "</td><td>" + adminEsc(r.user || "System") +
          "</td><td>" + adminEsc(r.affectedUser || "—") + "</td><td>" + adminEsc(r.action) + "</td><td>" +
          adminEsc(r.area || r.module) + "</td><td><span class=\"badge " + statusCls + "\">" + adminEsc(r.status || "Success") +
          "</span></td><td>" + self.riskBadge(r.risk) + "</td><td><button class=\"tbl-btn\" type=\"button\" onclick=\"GilbertoAdmin.showAuditDetails(" +
          i + ')\">Details</button></td></tr>';
      }).join("");
    }
    var all = this.auditEvents;
    var permChanges = all.filter(function (r) { return /permission|role|scope/i.test(String(r.area) + " " + String(r.action)); }).length;
    var clinical = all.filter(function (r) { return /session|note|clinical|data collection|behavior data/i.test(String(r.area) + " " + String(r.action)); }).length;
    var exports = all.filter(function (r) { return /export/i.test(String(r.action)); }).length;
    var failed = all.filter(function (r) { return /failed login/i.test(String(r.action)); }).length;
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    set("auditPermissionChanges", permChanges + " recorded");
    set("adminPermissionChanges", permChanges + " recorded");
    set("auditClinicalEdits", clinical + " recorded");
    set("auditExports", exports + " recorded");
    set("auditFailedLogins", failed + " recorded");
  };

  AdminCenter.prototype.showAuditDetails = function (index) {
    var row = this.getFilteredAudit().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })[index];
    if (!row) return;
    this.toast(row.details || (row.action + " · " + (row.affectedUser || row.area)), "success");
  };

  AdminCenter.prototype.renderReports = async function () {
    var sessions = [];
    var activeClients = null;
    var orgId = window.gilbertoCurrentOrg?.id || "";
    try {
      if (window.supabaseClient && orgId) {
        var cq = await window.supabaseClient.from("clients").select("id,status,auth_status").eq("org_id", orgId);
        if (!cq.error) {
          activeClients = (cq.data || []).filter(function (c) {
            return ["active", "authorized", "approved"].includes(String(c.status || c.auth_status || "").toLowerCase());
          }).length;
        }
      }
      if (typeof window.jvmFetchSessionsTable === "function") {
        var res = await window.jvmFetchSessionsTable(orgId, 500);
        if (res && res.ok) sessions = await res.json();
      } else if (window.supabaseClient && orgId) {
        var sq = await window.supabaseClient.from("sessions").select("id,session_date,note_status,status").eq("org_id", orgId).limit(500);
        if (!sq.error) sessions = sq.data || [];
      }
    } catch (_) {}
    this._sessions = sessions;
    await this.refreshPresence();
    var today = todayIso();
    var start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    var weekStart = start.toISOString().slice(0, 10);
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    set("reportSessionsToday", sessions.filter(function (s) { return s.session_date === today; }).length);
    set("reportSessionsWeek", sessions.filter(function (s) { return s.session_date >= weekStart; }).length);
    set("reportActiveClients", activeClients == null ? "—" : activeClients);
    set("reportMissingNotes", sessions.filter(function (s) { return !s.note_status || s.note_status === "missing"; }).length || "0");
    set("reportUnsignedNotes", "Not connected");
    var activeUsers = this.users.filter(function (u) { return u.status === "Active"; }).length;
    var mfaOn = this.users.filter(function (u) { return u.mfaEnabled && u.status === "Active"; }).length;
    var permChanges = this.auditEvents.filter(function (r) { return /permission|role|scope/i.test(String(r.area) + " " + String(r.action)); }).length;
    var failed = this.auditEvents.filter(function (r) { return /failed login/i.test(String(r.action)); }).length;
    var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    var adminActions = this.auditEvents.filter(function (r) { return String(r.createdAt || "") >= weekAgo; }).length;
    var expiring = this.providers.filter(function (p) { return p.license_expires && daysSince(p.license_expires) <= 60; }).length;
    var online = this.presenceRows.filter(function (p) { return minutesSince(p.last_seen_at) <= 2; }).length;
    set("reportTotalUsers", this.users.length);
    set("reportActiveUsers", activeUsers);
    set("reportOnlineUsers", online);
    set("reportLockedAccounts", this.users.filter(function (u) { return u.status === "Locked"; }).length);
    set("reportDormantAccounts", this.users.filter(function (u) { return u.status === "Dormant"; }).length);
    set("reportMfaCoverage", activeUsers ? Math.round((mfaOn / activeUsers) * 100) + "%" : "—");
    set("reportRoleCount", this.roles.length);
    set("reportPermissionChanges", permChanges);
    set("reportProviderAlerts", expiring || "0");
    set("reportFailedLogins", failed);
    set("reportAdminActions", adminActions);
  };

  AdminCenter.prototype.renderComplianceStrip = function () {
    var mfaOn = this.users.filter(function (u) { return u.mfaEnabled && u.status === "Active"; }).length;
    var mfaTotal = this.users.filter(function (u) { return u.status === "Active"; }).length;
    var permChanges = this.auditEvents.filter(function (r) { return /permission|role|scope/i.test(String(r.area) + " " + String(r.action)); }).length;
    var expiring = this.providers.filter(function (p) {
      if (!p.license_expires) return false;
      return daysSince(p.license_expires) <= 60;
    }).length;
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    set("adminSecurityPosture", this.identity.reauthForSensitive ? "Hardened" : "Standard");
    set("adminMfaCoverage", mfaTotal ? mfaOn + " / " + mfaTotal + " active users" : "—");
    set("adminPermissionChanges", permChanges + " recorded");
    set("adminCredentialAlerts", expiring ? expiring + " expiring soon" : "None");
  };

  AdminCenter.prototype.openUserEditor = function (userId) {
    if (!this.hasPermission(userId ? "users.edit" : "users.invite")) {
      this.toastError("You do not have permission to manage users.");
      return;
    }
    this._editingUserId = userId;
    var title = document.getElementById("adminUserModalTitle");
    var roleSel = document.getElementById("adminUserRole");
    var statusSel = document.getElementById("adminUserStatus");
    if (roleSel) {
      roleSel.innerHTML = this.roles.map(function (r) {
        return '<option value="' + adminEsc(r.id) + '">' + adminEsc(r.name) + "</option>";
      }).join("");
    }
    if (statusSel) {
      statusSel.innerHTML = USER_STATUSES.map(function (s) {
        return "<option>" + adminEsc(s) + "</option>";
      }).join("");
    }
    var u = userId ? this.users.find(function (x) { return x.id === userId; }) : null;
    if (title) title.textContent = u ? "Edit User" : "Invite User";
    document.getElementById("adminUserName").value = u ? (this.displayName(u) === "—" ? "" : u.name) : "";
    document.getElementById("adminUserEmail").value = u ? (this.isPlaceholderEmail(u.email) ? "" : u.email) : "";
    document.getElementById("adminUserRole").value = u ? u.roleId : "viewer";
    document.getElementById("adminUserSite").value = u ? u.site || "" : "";
    document.getElementById("adminUserStatus").value = u ? u.status : "Pending Invite";
    document.getElementById("adminUserMfa").value = u && u.mfaEnabled ? "true" : "false";
    this.openModal("adminUserModal");
  };

  AdminCenter.prototype.saveUserEditor = async function () {
    var name = document.getElementById("adminUserName").value.trim();
    var email = document.getElementById("adminUserEmail").value.trim();
    if (!name || !email) { this.toastError("Full name and email are required."); return; }
    if (this.isPlaceholderEmail(email)) { this.toastError("Enter a real email address."); return; }
    var roleId = document.getElementById("adminUserRole").value;
    var site = document.getElementById("adminUserSite").value.trim();
    var status = document.getElementById("adminUserStatus").value;
    var mfaEnabled = document.getElementById("adminUserMfa").value === "true";
    var existing = this._editingUserId ? this.users.find(function (u) { return u.id === this._editingUserId; }, this) : null;
    if (existing) {
      var oldRole = existing.roleId;
      existing.name = name;
      existing.email = email;
      existing.roleId = roleId;
      existing.site = site;
      existing.status = status;
      existing.mfaEnabled = mfaEnabled;
      if (existing.userId && existing.userId === window.gilbertoCurrentUserId) {
        window.gilbertoCurrentUserName = name;
        window.gilbertoCurrentUserEmail = email;
        if (typeof window.gilbertoSaveAuthProfile === "function" && window.supabaseClient) {
          try {
            await window.gilbertoSaveAuthProfile(window.supabaseClient, existing.userId, {
              full_name: name,
              email: email,
            });
          } catch (_) {}
        }
        if (typeof window.gilbertoWriteWorkspacePresence === "function") {
          await window.gilbertoWriteWorkspacePresence();
        }
      }
      this.persistUsers();
      this.recordAudit({ action: "User updated", area: "Users", affectedUser: email, oldValue: oldRole, newValue: roleId, risk: "Medium" });
      this.toastSuccess("User saved.");
    } else {
      this.users.push({
        id: uid(), userId: null, name: name, email: email, roleId: roleId, site: site,
        scopeIds: [], mfaEnabled: mfaEnabled, status: "Pending Invite", lastLogin: "",
        invitedAt: nowIso(), loginAt: "", device: "", ip: "", currentPage: "",
      });
      this.persistUsers();
      this.recordAudit({ action: "User invited", area: "Users", affectedUser: email, newValue: roleId, risk: "Medium" });
      this.toastSuccess("User invited.");
    }
    this.closeModal("adminUserModal");
    this.applyDerivedUserStatuses();
    this.renderUsers();
    this.renderComplianceStrip();
  };

  AdminCenter.prototype.disableUser = async function (userId) {
    if (!this.hasPermission("users.disable")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u || u.roleId === "owner") return this.toastError("Cannot disable this user.");
    if (!(await this.confirmAction("Disable " + u.email + "?"))) return;
    u.status = "Disabled";
    this.persistUsers();
    this.recordAudit({ action: "User disabled", area: "Users", affectedUser: u.email, risk: "High" });
    this.renderUsers();
    this.toastSuccess("User disabled.");
  };

  AdminCenter.prototype.terminateUser = async function (userId) {
    if (!this.hasPermission("users.terminate")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u || u.roleId === "owner") return this.toastError("Cannot terminate owner.");
    if (!(await this.confirmAction("Terminate " + u.email + "? This revokes access."))) return;
    u.status = "Terminated";
    if (this.revokedIds.indexOf(u.id) < 0) this.revokedIds.push(u.id);
    if (u.userId && this.revokedIds.indexOf(u.userId) < 0) this.revokedIds.push(u.userId);
    this.persistUsers();
    this.persistRevoked();
    this.recordAudit({ action: "User terminated", area: "Users", affectedUser: u.email, risk: "High" });
    this.renderUsers();
    this.toastSuccess("User terminated.");
  };

  AdminCenter.prototype.removeUserFromList = async function (userId) {
    if (!this.hasPermission("users.delete")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    if (u.roleId === "owner") return this.toastError("Cannot remove the workspace owner.");
    var label = this.displayEmailForUser(u);
    if (label === "—") label = this.displayNameForUser(u);
    if (!(await this.confirmAction("Remove " + label + " from the users list?"))) return;

    var orgId = window.gilbertoCurrentOrg && window.gilbertoCurrentOrg.id;
    if (window.supabaseClient && orgId && u.userId) {
      try {
        await window.supabaseClient
          .from("organization_members")
          .delete()
          .eq("organization_id", orgId)
          .eq("user_id", u.userId);
      } catch (_) {}
      try {
        await window.supabaseClient
          .from("workspace_user_sessions")
          .update({ logout_time: new Date().toISOString(), status: "offline" })
          .eq("org_id", orgId)
          .eq("user_id", u.userId)
          .is("logout_time", null);
      } catch (_) {}
    }

    if (this.removedUserIds.indexOf(u.id) < 0) this.removedUserIds.push(u.id);
    if (u.userId && this.removedUserIds.indexOf(u.userId) < 0) this.removedUserIds.push(u.userId);
    this.persistRemoved();
    this.users = this.users.filter(function (x) { return x.id !== u.id; });
    this.persistUsers();
    this.recordAudit({
      action: "User removed from list",
      area: "Users",
      affectedUser: u.email || label,
      risk: "High",
    });
    await this.refreshPresence();
    this.renderUsers();
    this.renderOnlineUsersTable();
    this.renderComplianceStrip();
    this.toastSuccess("User removed from list.");
  };

  AdminCenter.prototype.lockUser = async function (userId) {
    if (!this.hasPermission("users.lock")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    if (!(await this.confirmAction("Lock account for " + u.email + "?"))) return;
    if (this.lockedIds.indexOf(u.id) < 0) this.lockedIds.push(u.id);
    if (u.userId && this.lockedIds.indexOf(u.userId) < 0) this.lockedIds.push(u.userId);
    u.status = "Locked";
    this.persistLocked();
    this.persistUsers();
    this.recordAudit({ action: "Account locked", area: "Users", affectedUser: u.email, risk: "High" });
    this.renderUsers();
    this.toastSuccess("Account locked.");
  };

  AdminCenter.prototype.reactivateUser = async function (userId) {
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    this.lockedIds = this.lockedIds.filter(function (id) { return id !== u.id && id !== u.userId; });
    this.revokedIds = this.revokedIds.filter(function (id) { return id !== u.id && id !== u.userId; });
    u.status = "Active";
    this.persistLocked();
    this.persistRevoked();
    this.persistUsers();
    this.recordAudit({ action: "User reactivated", area: "Users", affectedUser: u.email, risk: "Medium" });
    this.renderUsers();
    this.toastSuccess("User reactivated.");
  };

  AdminCenter.prototype.resetUserPassword = async function (userId) {
    if (!this.hasPermission("users.reset_password")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    if (!(await this.confirmAction("Send password reset for " + u.email + "?"))) return;
    try {
      if (window.supabaseClient && u.email) {
        await window.supabaseClient.auth.resetPasswordForEmail(u.email, { redirectTo: window.location.origin });
      }
    } catch (_) {}
    this.recordAudit({ action: "Password reset requested", area: "Identity", affectedUser: u.email, risk: "High" });
    this.toastSuccess("Password reset initiated.");
  };

  AdminCenter.prototype.assignUserRole = function (userId, roleId) {
    if (!this.hasPermission("roles.assign")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    var old = u.roleId;
    u.roleId = roleId;
    this.persistUsers();
    this.recordAudit({ action: "Role assigned", area: "Roles", affectedUser: u.email, oldValue: old, newValue: roleId, risk: "High" });
    this.renderUsers();
    this.toastSuccess("Role assigned.");
  };

  AdminCenter.prototype.assignUserScopes = function (userId, scopeIds) {
    if (!this.hasPermission("scopes.assign")) return this.toastError("Insufficient permissions.");
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    u.scopeIds = scopeIds || [];
    this.persistUsers();
    this.recordAudit({ action: "Scopes assigned", area: "Scopes", affectedUser: u.email, newValue: u.scopeIds.join(", "), risk: "Medium" });
    this.renderUsers();
    this.toastSuccess("Scopes assigned.");
  };

  AdminCenter.prototype.openRoleEditor = function (roleId) {
    var creating = !roleId;
    if (creating && !this.hasPermission("roles.create")) return this.toastError("Insufficient permissions.");
    if (!creating && !this.hasPermission("roles.edit")) return this.toastError("Insufficient permissions.");
    this._editingRoleId = roleId;
    var role = roleId ? this.roles.find(function (r) { return r.id === roleId; }) : { name: "", permissions: {} };
    document.getElementById("adminRoleModalTitle").textContent = roleId ? "Edit Role" : "Create Role";
    document.getElementById("adminRoleName").value = role ? role.name : "";
    document.getElementById("adminRoleName").readOnly = !!(role && role.system && role.id === "owner");
    var grid = document.getElementById("adminRolePermGrid");
    var self = this;
    grid.innerHTML = PERMISSION_CATALOG.map(function (p) {
      var checked = role && role.permissions && role.permissions[p.key] ? " checked" : "";
      return '<label style="display:inline-flex;align-items:center;gap:6px;margin:4px;"><input type="checkbox" data-perm="' +
        adminEsc(p.key) + '"' + checked + ' onchange="GilbertoAdmin.togglePermissionCheckbox(this)"/> ' + adminEsc(p.label) + "</label>";
    }).join("");
    this.openModal("adminRoleModal");
  };

  AdminCenter.prototype.togglePermissionCheckbox = function (input) {
    /* live toggle in editor — saved on saveRoleEditor */
    if (input && input.dataset && input.dataset.perm) input.dataset.touched = "1";
  };

  AdminCenter.prototype.saveRoleEditor = function () {
    var name = document.getElementById("adminRoleName").value.trim();
    if (!name) return this.toastError("Role name required.");
    var perms = {};
    document.querySelectorAll("#adminRolePermGrid input[type=checkbox]").forEach(function (cb) {
      perms[cb.dataset.perm] = cb.checked;
    });
    if (this._editingRoleId) {
      var role = this.roles.find(function (r) { return r.id === this._editingRoleId; }, this);
      if (!role) return;
      if (role.system && role.id === "owner") return this.toastError("Owner role cannot be modified.");
      role.name = name;
      role.permissions = perms;
      this.recordAudit({ action: "Role updated", area: "Roles", affectedUser: name, risk: "High" });
    } else {
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || uid();
      this.roles.push({ id: id, name: name, priority: 30, system: false, permissions: perms });
      this.recordAudit({ action: "Role created", area: "Roles", affectedUser: name, risk: "High" });
    }
    this.persistRoles();
    this.closeModal("adminRoleModal");
    this.renderRoles();
    this.renderPermissionsTable();
    this.toastSuccess("Role saved.");
  };

  AdminCenter.prototype.deleteRole = async function (roleId) {
    if (!this.hasPermission("roles.delete")) return this.toastError("Insufficient permissions.");
    var role = this.roles.find(function (r) { return r.id === roleId; });
    if (!role) return;
    if (role.system) return this.toastError("System roles cannot be deleted.");
    if (roleId === "owner") return this.toastError("Owner role cannot be deleted.");
    if (!(await this.confirmAction("Delete role " + role.name + "?"))) return;
    this.roles = this.roles.filter(function (r) { return r.id !== roleId; });
    this.users.forEach(function (u) { if (u.roleId === roleId) u.roleId = "viewer"; });
    this.persistRoles();
    this.persistUsers();
    this.recordAudit({ action: "Role deleted", area: "Roles", affectedUser: role.name, risk: "High" });
    this.renderRoles();
    this.renderPermissionsTable();
    this.renderUsers();
    this.toastSuccess("Role deleted.");
  };

  AdminCenter.prototype.duplicateRole = function (roleId) {
    if (!this.hasPermission("roles.create")) return this.toastError("Insufficient permissions.");
    var role = this.roles.find(function (r) { return r.id === roleId; });
    if (!role) return;
    var copy = JSON.parse(JSON.stringify(role));
    copy.id = role.id + "_copy_" + Date.now().toString(36);
    copy.name = role.name + " Copy";
    copy.system = false;
    this.roles.push(copy);
    this.persistRoles();
    this.recordAudit({ action: "Role duplicated", area: "Roles", affectedUser: copy.name, risk: "Medium" });
    this.renderRoles();
    this.renderPermissionsTable();
    this.toastSuccess("Role duplicated.");
  };

  AdminCenter.prototype.toggleRolePermission = function (roleId, permKey, enabled) {
    var role = this.roles.find(function (r) { return r.id === roleId; });
    if (!role || role.system && role.id === "owner") return;
    if (!role.permissions) role.permissions = {};
    role.permissions[permKey] = !!enabled;
    this.persistRoles();
    this.recordAudit({ action: "Permission toggled", area: "Roles", affectedUser: role.name, newValue: permKey + "=" + enabled, risk: "High" });
    this.renderPermissionsTable();
  };

  AdminCenter.prototype.openScopeEditor = function (scopeId) {
    if (scopeId && !this.hasPermission("scopes.edit")) return this.toastError("Insufficient permissions.");
    if (!scopeId && !this.hasPermission("scopes.create")) return this.toastError("Insufficient permissions.");
    this._editingScopeId = scopeId;
    var typeSel = document.getElementById("adminScopeType");
    if (typeSel) typeSel.innerHTML = SCOPE_TYPES.map(function (t) { return "<option>" + adminEsc(t) + "</option>"; }).join("");
    var s = scopeId ? this.scopes.find(function (x) { return x.id === scopeId; }) : null;
    document.getElementById("adminScopeModalTitle").textContent = s ? "Edit Scope" : "Create Scope";
    document.getElementById("adminScopeName").value = s ? s.name : "";
    document.getElementById("adminScopeType").value = s ? s.type : "Site";
    document.getElementById("adminScopeRecords").value = s ? s.records || "" : "";
    document.getElementById("adminScopeStatus").value = s ? s.status || "Active" : "Active";
    this.openModal("adminScopeModal");
  };

  AdminCenter.prototype.saveScopeEditor = function () {
    var name = document.getElementById("adminScopeName").value.trim();
    if (!name) return this.toastError("Scope name required.");
    var payload = {
      name: name,
      type: document.getElementById("adminScopeType").value,
      records: document.getElementById("adminScopeRecords").value.trim(),
      status: document.getElementById("adminScopeStatus").value,
      assignedUserIds: [],
      assignedRoleIds: [],
    };
    if (this._editingScopeId) {
      var s = this.scopes.find(function (x) { return x.id === this._editingScopeId; }, this);
      if (!s) return;
      payload.assignedUserIds = s.assignedUserIds || [];
      payload.assignedRoleIds = s.assignedRoleIds || [];
      Object.assign(s, payload);
      this.recordAudit({ action: "Scope updated", area: "Scopes", affectedUser: name, risk: "Medium" });
    } else {
      payload.id = uid();
      this.scopes.push(payload);
      this.recordAudit({ action: "Scope created", area: "Scopes", affectedUser: name, risk: "Medium" });
    }
    this.persistScopes();
    this.closeModal("adminScopeModal");
    this.renderScopes();
    this.toastSuccess("Scope saved.");
  };

  AdminCenter.prototype.deleteScope = async function (scopeId) {
    if (!this.hasPermission("scopes.delete")) return this.toastError("Insufficient permissions.");
    if (!(await this.confirmAction("Delete this access scope?"))) return;
    this.scopes = this.scopes.filter(function (s) { return s.id !== scopeId; });
    this.persistScopes();
    this.recordAudit({ action: "Scope deleted", area: "Scopes", risk: "Medium" });
    this.renderScopes();
    this.toastSuccess("Scope deleted.");
  };

  AdminCenter.prototype.saveOrgSettings = function () {
    if (!this.hasPermission("identity.edit")) return this.toastError("Insufficient permissions.");
    var nameEl = document.getElementById("adminOrgName");
    var addrEl = document.getElementById("adminOrgAddress");
    var tzEl = document.getElementById("adminOrgTimezone");
    this.settings.displayName = nameEl ? nameEl.value.trim() : this.settings.displayName;
    this.settings.address = addrEl ? addrEl.value.trim() : this.settings.address;
    this.settings.timezone = tzEl ? tzEl.value : this.settings.timezone;
    this.settings.defaultInviteRole = document.getElementById("adminDefaultInviteRole")?.value || "viewer";
    this.settings.privacyContact = document.getElementById("adminPrivacyContact")?.value.trim() || "";
    this.settings.securityContact = document.getElementById("adminSecurityContact")?.value.trim() || "";
    this.settings.retentionPolicy = document.getElementById("adminRetentionPolicy")?.value || "7 years";
    this.settings.clinicalDefaults = document.getElementById("adminClinicalDefaults")?.value || "ABA standard";
    this.persistSettings();
    this.recordAudit({ action: "Organization settings saved", area: "Settings", risk: "Low" });
    this.toastSuccess("Organization settings saved.");
    this.renderComplianceStrip();
  };

  AdminCenter.prototype.saveIdentitySettings = function (patch) {
    if (!this.hasPermission("identity.edit")) return this.toastError("Insufficient permissions.");
    this.identity = Object.assign({}, this.identity, patch || {});
    this.persistIdentity();
    this.recordAudit({ action: "Identity settings saved", area: "Identity", risk: "Medium" });
    this.renderIdentity();
    this.renderComplianceStrip();
    this.toastSuccess("Identity settings saved.");
  };

  AdminCenter.prototype.openBillingEditor = function (billingId) {
    if (billingId && !this.hasPermission("billing.edit")) return this.toastError("Insufficient permissions.");
    if (!billingId && !this.hasPermission("billing.create")) return this.toastError("Insufficient permissions.");
    this._editingBillingId = billingId;
    var b = billingId ? this.billing.find(function (x) { return x.id === billingId; }) : null;
    document.getElementById("adminBillingModalTitle").textContent = b ? "Edit Billing Item" : "Add Billing Item";
    document.getElementById("adminBillingService").value = b ? b.service : "";
    document.getElementById("adminBillingCpt").value = b ? b.cpt : "";
    document.getElementById("adminBillingPos").value = b ? b.pos : "11";
    document.getElementById("adminBillingFee").value = b ? b.fee : "";
    document.getElementById("adminBillingAuth").value = b ? String(!!b.authRequired) : "true";
    document.getElementById("adminBillingActive").value = b ? String(!!b.active) : "true";
    this.openModal("adminBillingModal");
  };

  AdminCenter.prototype.saveBillingEditor = function () {
    var item = {
      service: document.getElementById("adminBillingService").value.trim(),
      cpt: document.getElementById("adminBillingCpt").value.trim(),
      pos: document.getElementById("adminBillingPos").value.trim(),
      fee: Number(document.getElementById("adminBillingFee").value) || 0,
      authRequired: document.getElementById("adminBillingAuth").value === "true",
      active: document.getElementById("adminBillingActive").value === "true",
    };
    if (!item.service) return this.toastError("Service name required.");
    if (this._editingBillingId) {
      var b = this.billing.find(function (x) { return x.id === this._editingBillingId; }, this);
      if (!b) return;
      Object.assign(b, item);
      this.recordAudit({ action: "Billing item updated", area: "Billing", affectedUser: item.service, risk: "Medium" });
    } else {
      item.id = uid();
      this.billing.push(item);
      this.recordAudit({ action: "Billing item created", area: "Billing", affectedUser: item.service, risk: "Medium" });
    }
    this.persistBilling();
    this.closeModal("adminBillingModal");
    this.renderBilling();
    this.toastSuccess("Billing item saved.");
  };

  AdminCenter.prototype.deleteBillingItem = async function (billingId) {
    if (!this.hasPermission("billing.delete")) return this.toastError("Insufficient permissions.");
    if (!(await this.confirmAction("Delete this billing item?"))) return;
    this.billing = this.billing.filter(function (b) { return b.id !== billingId; });
    this.persistBilling();
    this.recordAudit({ action: "Billing item deleted", area: "Billing", risk: "Medium" });
    this.renderBilling();
    this.toastSuccess("Billing item deleted.");
  };

  AdminCenter.prototype.previewEffectiveAccess = function (userId) {
    var u = this.users.find(function (x) { return x.id === userId; });
    if (!u) return this.toastError("User not found.");
    var role = this.roles.find(function (r) { return r.id === u.roleId; });
    var perms = role && role.permissions ? Object.keys(role.permissions).filter(function (k) { return role.permissions[k]; }) : [];
    var scopes = (u.scopeIds || []).map(function (sid) {
      var s = this.scopes.find(function (x) { return x.id === sid; });
      return s ? s.name + " (" + s.type + ")" : sid;
    }, this);
    var body = document.getElementById("adminAccessPreviewBody");
    if (body) {
      body.innerHTML = "<p><strong>" + adminEsc(u.name) + "</strong> · " + adminEsc(u.email) + "</p>" +
        "<p>Role: <strong>" + adminEsc(this.getRoleName(u.roleId)) + "</strong></p>" +
        "<p>Permissions (" + perms.length + "):</p><ul>" + perms.map(function (p) { return "<li>" + adminEsc(p) + "</li>"; }).join("") + "</ul>" +
        "<p>Assigned scopes:</p><ul>" + (scopes.length ? scopes.map(function (s) { return "<li>" + adminEsc(s) + "</li>"; }).join("") : "<li>None</li>") + "</ul>";
    }
    this.openModal("adminAccessModal");
  };

  AdminCenter.prototype.refreshPresence = async function () {
    if (typeof window.gilbertoWriteWorkspacePresence === "function") {
      await window.gilbertoWriteWorkspacePresence();
    }
    var orgId = window.gilbertoCurrentOrg?.id;
    if (!window.supabaseClient || !orgId) return;
    this.presenceRows = [];
    var indexedRows = [];
    try {
      if (typeof window.gilbertoFetchWorkspaceOnlineSessions === "function") {
        var sessions = await window.gilbertoFetchWorkspaceOnlineSessions(orgId);
        if (sessions.length) {
          this.presenceRows = sessions.map(function (s) {
            return {
              user_id: s.user_id,
              email: s.email,
              full_name: s.full_name,
              current_page: s.current_page,
              last_seen_at: s.last_activity_at || s.last_seen_at,
              last_activity_at: s.last_activity_at || s.last_seen_at,
              status: s.status,
              device: s.device,
              browser: s.browser,
              session_id: s.id,
            };
          });
          indexedRows = indexedRows.concat(this.presenceRows);
        }
      }
    } catch (_) {}
    if (!this.presenceRows.length) {
      try {
        var since = new Date(Date.now() - 10 * 60000).toISOString();
        var q = await window.supabaseClient.from("workspace_user_presence")
          .select("user_id,email,full_name,current_page,last_seen_at")
          .eq("org_id", orgId).gte("last_seen_at", since).order("last_seen_at", { ascending: false });
        if (!q.error) {
          this.presenceRows = q.data || [];
          indexedRows = indexedRows.concat(this.presenceRows);
        }
      } catch (_) {}
    }
    this.indexOnlineUsers(indexedRows.length ? indexedRows : this.presenceRows);
    this.renderOnlineUsersTable();
    this.renderIdentity();
  };

  AdminCenter.prototype.presenceStatus = function (row) {
    if (row && row.status) {
      var st = String(row.status).toLowerCase();
      if (st === "online") return { key: "online", label: "Online" };
      if (st === "idle") return { key: "idle", label: "Idle" };
      if (st === "offline") return { key: "offline", label: "Offline" };
    }
    var mins = minutesSince(row.last_seen_at || row.last_activity_at);
    if (mins <= 2) return { key: "online", label: "Online" };
    if (mins <= 5) return { key: "idle", label: "Idle" };
    return { key: "offline", label: "Offline" };
  };

  AdminCenter.prototype.sessionDurationLabel = function (row) {
    var mins = minutesSince(row.last_seen_at);
    if (mins <= 2) return mins + " min";
    return "—";
  };

  AdminCenter.prototype.renderOnlineUsersTable = function () {
    var bodies = [
      document.getElementById("adminOnlineSectionBody"),
      document.getElementById("adminOnlineBody"),
    ].filter(Boolean);
    if (!bodies.length) return;
    var self = this;
    var html;
    if (!this.presenceRows.length) {
      html = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#6b8c7a;">No one is online in this workspace right now.</td></tr>';
    } else {
      html = this.presenceRows.map(function (p) {
        var st = self.presenceStatus(p);
        var cls = st.key === "online" ? "badge-active" : st.key === "idle" ? "badge-pending" : "badge-expiring";
        var user = self.users.find(function (u) { return u.userId === p.user_id || u.email === p.email; });
        var roleName = user ? self.getRoleName(user.roleId) : (p.role || "—");
        var key = p.user_id || p.email;
        var device = p.browser || p.device || (user && user.device ? user.device : "Web browser");
        return "<tr><td><span class=\"badge " + cls + "\">" + adminEsc(st.label) + "</span></td><td>" +
          adminEsc(self.displayName({ name: p.full_name, email: p.email, userId: p.user_id })) + "</td><td>" +
          adminEsc(self.displayEmail({ email: p.email, userId: p.user_id })) + "</td><td>" + adminEsc(roleName) +
          "</td><td>" + adminEsc(formatDateTime(p.login_time || (user && user.loginAt) || p.last_seen_at)) +
          "</td><td>" + adminEsc(formatDateTime(p.last_activity_at || p.last_seen_at)) +
          "</td><td>" + adminEsc(pageLabel(p.current_page)) + "</td><td>" + adminEsc(String(device).slice(0, 40)) +
          '</td><td><button class="tbl-btn" type="button" onclick="GilbertoAdmin.openUserEditor(\'' + adminEsc(user ? user.id : "") +
          "')\">View</button> <button class=\"tbl-btn\" type=\"button\" onclick=\"GilbertoAdmin.forceLogoutPresence('" +
          adminEsc(key) + "')\">Force logout</button> <button class=\"tbl-btn danger\" type=\"button\" onclick=\"GilbertoAdmin.lockPresenceUser('" +
          adminEsc(key) + "')\">Lock</button></td></tr>";
      }).join("");
    }
    bodies.forEach(function (body) { body.innerHTML = html; });
  };

  AdminCenter.prototype.openOnlineUsersSection = async function () {
    if (!this.hasPermission("online.view")) return this.toastError("Insufficient permissions.");
    this.navigateToSection("online-users");
    await this.refreshPresence();
  };

  AdminCenter.prototype.openOnlineUsersModal = AdminCenter.prototype.openOnlineUsersSection;

  AdminCenter.prototype.forceLogoutPresence = async function (key) {
    if (!this.hasPermission("online.force_logout")) return this.toastError("Insufficient permissions.");
    if (!(await this.confirmAction("Force logout this session?"))) return;
    var user = this.users.find(function (u) { return u.userId === key || u.email === key || u.id === key; });
    if (user && user.userId && this.revokedIds.indexOf(user.userId) < 0) this.revokedIds.push(user.userId);
    this.persistRevoked();
    this.recordAudit({ action: "Force logout", area: "Online", affectedUser: user ? user.email : key, risk: "High" });
    this.toastSuccess("Session marked for logout.");
    this.refreshPresence();
  };

  AdminCenter.prototype.lockPresenceUser = async function (key) {
    if (!this.hasPermission("online.lock")) return this.toastError("Insufficient permissions.");
    var user = this.users.find(function (u) { return u.userId === key || u.email === key || u.id === key; });
    if (user) await this.lockUser(user.id);
    else this.toastError("User record not found for lock.");
  };

  AdminCenter.prototype.exportCsv = function (filename, header, rows) {
    var csv = [header.join(",")].concat(rows.map(function (r) {
      return header.map(function (key) {
        return '"' + String(r[key] == null ? "" : r[key]).replace(/"/g, '""') + '"';
      }).join(",");
    })).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  AdminCenter.prototype.exportAuditReport = function () {
    if (!this.hasPermission("audit.export")) return this.toastError("Insufficient permissions.");
    var rows = this.getFilteredAudit();
    if (!rows.length) return this.toastError("No audit events to export.");
    this.exportCsv("gilberto-audit-events.csv",
      ["createdAt", "user", "action", "area", "affectedUser", "status", "risk", "details"],
      rows);
    this.recordAudit({ action: "Audit export", area: "Audit", risk: "Medium" });
    this.toastSuccess("Audit report exported.");
  };

  AdminCenter.prototype.exportReports = function () {
    if (!this.hasPermission("reports.export")) return this.toastError("Insufficient permissions.");
    var payload = {
      generatedAt: nowIso(),
      sessionsToday: document.getElementById("reportSessionsToday")?.textContent || "",
      sessionsWeek: document.getElementById("reportSessionsWeek")?.textContent || "",
      activeClients: document.getElementById("reportActiveClients")?.textContent || "",
      missingNotes: document.getElementById("reportMissingNotes")?.textContent || "",
      userCount: this.users.length,
      roleCount: this.roles.length,
    };
    this.exportCsv("gilberto-admin-reports.csv",
      ["generatedAt", "sessionsToday", "sessionsWeek", "activeClients", "missingNotes", "userCount", "roleCount"],
      [payload]);
    this.recordAudit({ action: "Reports export", area: "Reports", risk: "Low" });
    this.toastSuccess("Reports exported.");
  };

  var adminCenter = new AdminCenter();
  window.GilbertoAdmin = adminCenter;
  window.gilbertoRecordAdminAudit = function (e) { adminCenter.recordAudit(e || {}); };
  window.adminEsc = adminEsc;
  window.PERMISSION_CATALOG = PERMISSION_CATALOG;
  window.DEFAULT_ROLES = DEFAULT_ROLES;

  document.addEventListener("DOMContentLoaded", function () {
    /* init is invoked from admin-panel.html after auth guard */
  });
})();
