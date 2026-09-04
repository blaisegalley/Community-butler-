/*
 * Community Butler — client-side data layer.
 *
 * IMPORTANT: this project is a static site with no backend yet, so this
 * store persists to localStorage in the current browser only. It is a
 * working MVP, not production infrastructure:
 *   - Data does not sync across devices/browsers.
 *   - Admin "auth" below is a fixed allowlist checked in the browser —
 *     fine for keeping casual visitors out, but anyone who reads this
 *     file's source can see the checking logic. Do not reuse these
 *     passwords anywhere real, and swap in real backend auth (and a
 *     real database) before this becomes a real operational tool.
 *
 * Update ADMIN_ALLOWLIST below with the real admin emails/passwords.
 */
(function (global) {
  "use strict";

  var KEYS = {
    jobs: "cb.jobs.v1",
    butlers: "cb.butlers.v1",
    session: "cb.adminSession.v1"
  };

  var SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  // Replace with the real 3 admin accounts before launch.
  var ADMIN_ALLOWLIST = [
    { email: "admin1@communitybutler.com", password: "Butler-Admin-1!" },
    { email: "admin2@communitybutler.com", password: "Butler-Admin-2!" },
    { email: "admin3@communitybutler.com", password: "Butler-Admin-3!" }
  ];

  function uid() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable (private mode, quota) — fail silently */
    }
  }

  // ---------- jobs ----------

  function getJobs() {
    return read(KEYS.jobs, []);
  }

  function addJob(data) {
    var jobs = getJobs();
    var job = Object.assign(
      {
        id: uid(),
        submittedAt: new Date().toISOString(),
        status: "New",
        rejectNote: "",
        assignedButlerId: null,
        assignedAt: null,
        completedAt: null
      },
      data
    );
    jobs.unshift(job);
    write(KEYS.jobs, jobs);
    return job;
  }

  function updateJob(id, patch) {
    var jobs = getJobs();
    var idx = jobs.findIndex(function (j) { return j.id === id; });
    if (idx > -1) {
      jobs[idx] = Object.assign({}, jobs[idx], patch);
      write(KEYS.jobs, jobs);
    }
    return jobs;
  }

  function approveJob(id) { return updateJob(id, { status: "Approved" }); }
  function rejectJob(id, note) { return updateJob(id, { status: "Rejected", rejectNote: note || "" }); }
  function completeJob(id) { return updateJob(id, { status: "Completed", completedAt: new Date().toISOString() }); }

  function assignJob(id, butlerId, notifyMessage) {
    var jobs = updateJob(id, { status: "Assigned", assignedButlerId: butlerId, assignedAt: new Date().toISOString() });
    if (butlerId && notifyMessage) { notifyButler(butlerId, notifyMessage); }
    return jobs;
  }

  // ---------- butlers ----------

  function getButlers() {
    return read(KEYS.butlers, []);
  }

  function addButler(data) {
    var butlers = getButlers();
    var butler = Object.assign(
      { id: uid(), signedUpAt: new Date().toISOString(), notifications: [] },
      data
    );
    butlers.unshift(butler);
    write(KEYS.butlers, butlers);
    return butler;
  }

  function notifyButler(id, message) {
    var butlers = getButlers();
    var idx = butlers.findIndex(function (b) { return b.id === id; });
    if (idx > -1) {
      butlers[idx].notifications = butlers[idx].notifications || [];
      butlers[idx].notifications.unshift({ message: message, at: new Date().toISOString(), read: false });
      write(KEYS.butlers, butlers);
    }
    return butlers;
  }

  // ---------- admin session ----------

  function adminLogin(email, password) {
    var normalized = (email || "").trim().toLowerCase();
    var match = ADMIN_ALLOWLIST.find(function (a) {
      return a.email.toLowerCase() === normalized && a.password === password;
    });
    if (!match) { return false; }
    write(KEYS.session, { email: match.email, expiresAt: Date.now() + SESSION_TTL_MS });
    return true;
  }

  function getAdminSession() {
    var session = read(KEYS.session, null);
    if (session && session.expiresAt > Date.now()) { return session; }
    return null;
  }

  function isAdminLoggedIn() { return !!getAdminSession(); }

  function adminLogout() {
    try { localStorage.removeItem(KEYS.session); } catch (e) {}
  }

  global.CBStore = {
    getJobs: getJobs,
    addJob: addJob,
    updateJob: updateJob,
    approveJob: approveJob,
    rejectJob: rejectJob,
    completeJob: completeJob,
    assignJob: assignJob,
    getButlers: getButlers,
    addButler: addButler,
    notifyButler: notifyButler,
    adminLogin: adminLogin,
    getAdminSession: getAdminSession,
    isAdminLoggedIn: isAdminLoggedIn,
    adminLogout: adminLogout
  };
})(window);
