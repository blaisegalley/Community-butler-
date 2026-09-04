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
    session: "cb.adminSession.v1",
    butlerSession: "cb.butlerSession.v1"
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

  // A Butler claiming an open job themselves — same end state as assignJob,
  // but guards against the job having been taken (by admin or another
  // Butler/tab) in the moment between rendering the list and clicking.
  function acceptJob(id, butlerId) {
    var job = getJobs().find(function (j) { return j.id === id; });
    if (!job || job.status !== "Approved" || job.assignedButlerId) { return false; }
    updateJob(id, { status: "Assigned", assignedButlerId: butlerId, assignedAt: new Date().toISOString(), acceptedBySelf: true });
    return true;
  }

  // Open jobs a Butler can take: admin-approved, not yet claimed by anyone.
  // Jobs matching the Butler's own service area or job-type prefs sort first.
  function getAvailableJobsForButler(butlerId) {
    var butler = getButlers().find(function (b) { return b.id === butlerId; }) || {};
    var prefs = butler.jobTypePrefs || [];
    var area = (butler.serviceArea || "").trim().toLowerCase();
    return getJobs()
      .filter(function (j) { return j.status === "Approved" && !j.assignedButlerId; })
      .map(function (j) { return j; })
      .sort(function (a, b) {
        var score = function (j) {
          var s = 0;
          if (prefs.indexOf(j.service) > -1) { s += 2; }
          if (area && (j.address || "").toLowerCase().indexOf(area) > -1) { s += 1; }
          return s;
        };
        var diff = score(b) - score(a);
        if (diff !== 0) { return diff; }
        return new Date(b.submittedAt) - new Date(a.submittedAt);
      });
  }

  function getMyJobsForButler(butlerId) {
    return getJobs()
      .filter(function (j) { return j.assignedButlerId === butlerId; })
      .sort(function (a, b) { return new Date(b.assignedAt || b.submittedAt) - new Date(a.assignedAt || a.submittedAt); });
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

  // ---------- Butler session ----------
  // Signing up logs a Butler in immediately (we just created the record).
  // "Signing in" on a device that never signed up won't find anything —
  // there's no backend, so accounts don't sync across devices/browsers.

  function butlerLoginById(id) {
    write(KEYS.butlerSession, { butlerId: id, expiresAt: Date.now() + SESSION_TTL_MS });
  }

  function butlerLoginByContact(contact) {
    var normalized = (contact || "").trim().toLowerCase();
    var match = getButlers().find(function (b) { return (b.contact || "").trim().toLowerCase() === normalized; });
    if (!match) { return null; }
    butlerLoginById(match.id);
    return match;
  }

  function getButlerSession() {
    var session = read(KEYS.butlerSession, null);
    if (session && session.expiresAt > Date.now()) { return session; }
    return null;
  }

  function getCurrentButler() {
    var session = getButlerSession();
    if (!session) { return null; }
    return getButlers().find(function (b) { return b.id === session.butlerId; }) || null;
  }

  function butlerLogout() {
    try { localStorage.removeItem(KEYS.butlerSession); } catch (e) {}
  }

  global.CBStore = {
    getJobs: getJobs,
    addJob: addJob,
    updateJob: updateJob,
    approveJob: approveJob,
    rejectJob: rejectJob,
    completeJob: completeJob,
    assignJob: assignJob,
    acceptJob: acceptJob,
    getAvailableJobsForButler: getAvailableJobsForButler,
    getMyJobsForButler: getMyJobsForButler,
    getButlers: getButlers,
    addButler: addButler,
    notifyButler: notifyButler,
    adminLogin: adminLogin,
    getAdminSession: getAdminSession,
    isAdminLoggedIn: isAdminLoggedIn,
    adminLogout: adminLogout,
    butlerLoginById: butlerLoginById,
    butlerLoginByContact: butlerLoginByContact,
    getButlerSession: getButlerSession,
    getCurrentButler: getCurrentButler,
    butlerLogout: butlerLogout
  };
})(window);
