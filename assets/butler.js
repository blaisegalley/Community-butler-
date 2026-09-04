/*
 * Butler dashboard on /auth — shown once a Butler is signed in (session
 * from CBStore.butlerLoginById / butlerLoginByContact). Lets a Butler
 * browse admin-approved open jobs and accept the ones they want, plus
 * see what they've already taken.
 */
(function () {
  "use strict";

  var guest = document.getElementById("auth-guest");
  var dash = document.getElementById("auth-dashboard");
  if (!guest || !dash || !window.CBStore) { return; }

  function esc(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) { return ""; }
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function jobTileHtml(job, opts) {
    opts = opts || {};
    var badge = opts.matched
      ? "<span class='match-badge'>Matches your prefs</span>"
      : (opts.showStatus ? "<span class='status-pill status-" + job.status + "'>" + job.status + "</span>" : "");
    var actions = opts.acceptable
      ? "<div class='job-tile-actions'><button class='btn btn-solid' data-accept='" + job.id + "'>Accept job</button></div>"
      : "";
    return (
      "<div class='job-tile'>" +
        "<div class='job-tile-top'>" +
          "<div>" +
            "<div class='job-tile-title'>" + esc(job.service || "Job") + "</div>" +
            "<div class='job-tile-meta'>" + esc(job.address) + " · submitted " + fmtDate(job.submittedAt) + "</div>" +
          "</div>" +
          badge +
        "</div>" +
        "<div class='job-tile-details'>" + esc(job.details || "") + "</div>" +
        "<dl class='job-tile-grid'>" +
          "<div><dt>Preferred date</dt><dd>" + esc(job.date || "Flexible") + "</dd></div>" +
          "<div><dt>Budget</dt><dd>" + (job.budget ? "$" + esc(job.budget) : "Not specified") + "</dd></div>" +
        "</dl>" +
        actions +
      "</div>"
    );
  }

  function render() {
    var butler = CBStore.getCurrentButler();
    if (!butler) {
      guest.hidden = false;
      dash.hidden = true;
      return;
    }
    guest.hidden = true;
    dash.hidden = false;

    document.getElementById("dash-greeting").textContent = "Welcome back, " + (butler.name || "").split(" ")[0];
    document.getElementById("dash-sub").textContent =
      (butler.serviceArea ? butler.serviceArea + " · " : "") + "Signed in as " + butler.contact;

    var prefs = butler.jobTypePrefs || [];
    var available = CBStore.getAvailableJobsForButler(butler.id);
    var availableCountEl = document.getElementById("available-count");
    availableCountEl.textContent = available.length ? "(" + available.length + ")" : "";
    document.getElementById("available-list").innerHTML = available.length
      ? available.map(function (j) { return jobTileHtml(j, { acceptable: true, matched: prefs.indexOf(j.service) > -1 }); }).join("")
      : "<div class='empty-state'>No open jobs right now — check back soon.</div>";

    var mine = CBStore.getMyJobsForButler(butler.id);
    document.getElementById("my-jobs-list").innerHTML = mine.length
      ? mine.map(function (j) { return jobTileHtml(j, { showStatus: true }); }).join("")
      : "<div class='empty-state'>Jobs you accept will show up here.</div>";
  }

  document.getElementById("available-list").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-accept]");
    if (!btn) { return; }
    var butler = CBStore.getCurrentButler();
    if (!butler) { return; }
    var ok = CBStore.acceptJob(btn.dataset.accept, butler.id);
    if (!ok) { window.alert("Sorry — that job was just taken."); }
    render();
  });

  var logoutBtn = document.getElementById("butler-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      CBStore.butlerLogout();
      render();
    });
  }

  window.CBButlerDash = { render: render };
  render();
})();
