(function () {
  "use strict";

  var loginWrap = document.getElementById("admin-login");
  var dashWrap = document.getElementById("admin-dashboard");
  var loginForm = document.getElementById("admin-login-form");
  var loginError = document.getElementById("admin-login-error");
  var sessionEmail = document.getElementById("admin-session-email");
  var logoutBtn = document.getElementById("admin-logout");

  var STATUS_ORDER = { New: 0, Approved: 1, Assigned: 2, Completed: 3, Rejected: 4 };

  function fmtRelative(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.round(diffMs / 60000);
    if (mins < 1) { return "just now"; }
    if (mins < 60) { return mins + "m ago"; }
    var hrs = Math.round(mins / 60);
    if (hrs < 24) { return hrs + "h ago"; }
    var days = Math.round(hrs / 24);
    return days + "d ago";
  }

  function fmtDate(iso) {
    if (!iso) { return ""; }
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function esc(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function sameWeek(iso) {
    return Date.now() - new Date(iso).getTime() <= 7 * 24 * 60 * 60 * 1000;
  }
  function sameMonth(iso) {
    if (!iso) { return false; }
    var d = new Date(iso), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  function renderStats(jobs, butlers) {
    var jobsThisWeek = jobs.filter(function (j) { return sameWeek(j.submittedAt); }).length;
    var pending = jobs.filter(function (j) { return j.status === "New"; }).length;
    var completedThisMonth = jobs.filter(function (j) { return j.status === "Completed" && sameMonth(j.completedAt); }).length;

    document.getElementById("stat-week").textContent = jobsThisWeek;
    document.getElementById("stat-pending").textContent = pending;
    document.getElementById("stat-butlers").textContent = butlers.length;
    document.getElementById("stat-completed").textContent = completedThisMonth;
  }

  function butlerOptions(butlers, selectedId) {
    if (!butlers.length) { return "<option value=''>No Butlers signed up yet</option>"; }
    return butlers.map(function (b) {
      return "<option value='" + b.id + "'" + (b.id === selectedId ? " selected" : "") + ">" + esc(b.name) + "</option>";
    }).join("");
  }

  function jobCardHtml(job, butlers) {
    var butlerName = "";
    if (job.assignedButlerId) {
      var b = butlers.find(function (x) { return x.id === job.assignedButlerId; });
      butlerName = b ? b.name : "Unknown Butler";
    }

    var actions = "";
    if (job.status === "New") {
      actions =
        "<button class='btn btn-solid' data-action='approve' data-id='" + job.id + "'>Approve</button>" +
        "<button class='btn btn-ghost' data-action='reject' data-id='" + job.id + "'>Reject</button>";
    } else if (job.status === "Approved") {
      actions =
        "<select data-role='assign-select' data-id='" + job.id + "'>" + butlerOptions(butlers) + "</select>" +
        "<button class='btn btn-solid' data-action='assign' data-id='" + job.id + "'" + (butlers.length ? "" : " disabled") + ">Assign</button>";
    } else if (job.status === "Assigned") {
      actions = "<button class='btn btn-solid' data-action='complete' data-id='" + job.id + "'>Mark completed</button>";
    }

    var extraLine = "";
    if (job.status === "Assigned" || job.status === "Completed") {
      extraLine = "<div class='reject-note' style='color:var(--charcoal-soft)'>Assigned to <strong>" + esc(butlerName) + "</strong>" + (job.completedAt ? " — completed " + fmtDate(job.completedAt) : "") + "</div>";
    }
    if (job.status === "Rejected" && job.rejectNote) {
      extraLine = "<div class='reject-note'>Rejected: " + esc(job.rejectNote) + "</div>";
    }

    return (
      "<div class='job-card is-" + job.status.toLowerCase() + "'>" +
        "<div class='job-card-top'>" +
          "<div>" +
            "<div class='job-card-title'>" + esc(job.service || "Job request") + " — " + esc(job.name) + "</div>" +
            "<div class='job-card-meta'>" + esc(job.address) + " · submitted " + fmtRelative(job.submittedAt) + "</div>" +
          "</div>" +
          "<span class='status-pill status-" + job.status + "'>" + job.status + "</span>" +
        "</div>" +
        "<div class='job-card-details'>" + esc(job.details || "") + "</div>" +
        "<dl class='job-card-grid'>" +
          "<div><dt>Phone</dt><dd>" + esc(job.phone || "—") + "</dd></div>" +
          "<div><dt>Email</dt><dd>" + esc(job.email || "—") + "</dd></div>" +
          "<div><dt>Preferred date</dt><dd>" + esc(job.date || "Flexible") + "</dd></div>" +
          "<div><dt>Budget</dt><dd>" + (job.budget ? "$" + esc(job.budget) : "Not specified") + "</dd></div>" +
        "</dl>" +
        extraLine +
        (actions ? "<div class='job-card-actions'>" + actions + "</div>" : "") +
      "</div>"
    );
  }

  function butlerCardHtml(butler) {
    var unread = (butler.notifications || []).filter(function (n) { return !n.read; }).length;
    var prefs = (butler.jobTypePrefs || []).map(function (p) { return "<span class='pref-chip'>" + esc(p) + "</span>"; }).join("");
    return (
      "<div class='butler-card'>" +
        "<div>" +
          "<div class='butler-name'>" + esc(butler.name) + "</div>" +
          "<div class='butler-meta'>" + esc(butler.contact) + " · " + esc(butler.serviceArea || "No area set") + " · signed up " + fmtDate(butler.signedUpAt) + "</div>" +
          (prefs ? "<div class='butler-prefs'>" + prefs + "</div>" : "") +
        "</div>" +
        (unread ? "<span class='notif-badge'>" + unread + " new</span>" : "") +
      "</div>"
    );
  }

  function render() {
    var jobs = CBStore.getJobs().slice().sort(function (a, b) {
      var byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) { return byStatus; }
      return new Date(b.submittedAt) - new Date(a.submittedAt);
    });
    var butlers = CBStore.getButlers();

    renderStats(jobs, butlers);

    var jobList = document.getElementById("job-list");
    var jobCount = document.getElementById("job-count");
    jobCount.textContent = jobs.length + (jobs.length === 1 ? " request" : " requests");
    jobList.innerHTML = jobs.length
      ? jobs.map(function (j) { return jobCardHtml(j, butlers); }).join("")
      : "<div class='empty-state'>No job requests yet — submissions from /request will appear here.</div>";

    var butlerList = document.getElementById("butler-list");
    var butlerCount = document.getElementById("butler-count");
    butlerCount.textContent = butlers.length + (butlers.length === 1 ? " Butler" : " Butlers");
    butlerList.innerHTML = butlers.length
      ? butlers.map(butlerCardHtml).join("")
      : "<div class='empty-state'>No Butlers signed up yet — sign-ups from /auth will appear here.</div>";
  }

  function showDashboard() {
    var session = CBStore.getAdminSession();
    loginWrap.hidden = true;
    dashWrap.hidden = false;
    sessionEmail.textContent = session ? session.email : "";
    render();
  }
  function showLogin() {
    dashWrap.hidden = true;
    loginWrap.hidden = false;
  }

  if (CBStore.isAdminLoggedIn()) { showDashboard(); } else { showLogin(); }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("admin-email").value;
    var password = document.getElementById("admin-password").value;
    if (CBStore.adminLogin(email, password)) {
      loginError.classList.remove("is-visible");
      loginForm.reset();
      showDashboard();
    } else {
      loginError.textContent = "That email/password combo isn't on the admin allowlist.";
      loginError.classList.add("is-visible");
    }
  });

  logoutBtn.addEventListener("click", function () {
    CBStore.adminLogout();
    showLogin();
  });

  document.getElementById("job-list").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) { return; }
    var id = btn.dataset.id;
    var action = btn.dataset.action;

    if (action === "approve") {
      CBStore.approveJob(id);
    } else if (action === "reject") {
      var note = window.prompt("Reason for rejecting this request (optional):", "");
      if (note !== null) { CBStore.rejectJob(id, note); }
    } else if (action === "assign") {
      var select = document.querySelector("select[data-role='assign-select'][data-id='" + id + "']");
      var butlerId = select ? select.value : "";
      if (!butlerId) { window.alert("Pick a Butler to assign first."); return; }
      var job = CBStore.getJobs().find(function (j) { return j.id === id; });
      var message = "You've been assigned a new job: " + (job ? job.service : "a job") + ". Check the admin for details.";
      CBStore.assignJob(id, butlerId, message);
    } else if (action === "complete") {
      CBStore.completeJob(id);
    }
    render();
  });
})();
