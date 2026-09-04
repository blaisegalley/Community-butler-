(function () {
  "use strict";

  document.querySelectorAll(".appear").forEach(function (el) {
    el.addEventListener("animationend", function () {
      el.classList.add("is-in");
    }, { once: true });
  });

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var nodes = document.querySelectorAll(".appear");
      var anyRunning = false;
      nodes.forEach(function (el) {
        if (typeof el.getAnimations !== "function") { return; }
        var anims = el.getAnimations();
        for (var i = 0; i < anims.length; i++) {
          if (anims[i].playState === "running" || anims[i].playState === "finished") {
            anyRunning = true;
            break;
          }
        }
      });
      if (!anyRunning) {
        nodes.forEach(function (el) { el.classList.add("is-in"); });
      }
    });
  });

  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: "0px 0px -10% 0px" });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("is-in"); });
    }
  }

  var body = document.body;
  var burger = document.getElementById("burger");
  var nav = document.getElementById("site-nav");
  var backdrop = document.getElementById("menu-backdrop");

  function openMenu() {
    body.classList.add("menu-open");
    if (burger) {
      burger.setAttribute("aria-expanded", "true");
      burger.setAttribute("aria-label", "Close menu");
    }
  }
  function closeMenu() {
    body.classList.remove("menu-open");
    if (burger) {
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "Open menu");
    }
  }
  function toggleMenu() {
    if (body.classList.contains("menu-open")) { closeMenu(); } else { openMenu(); }
  }

  if (burger) { burger.addEventListener("click", toggleMenu); }
  if (backdrop) { backdrop.addEventListener("click", closeMenu); }
  if (nav) {
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeMenu(); }
  });

  var mq = window.matchMedia("(min-width: 901px)");
  function handleResize(e) { if (e.matches) { closeMenu(); } }
  if (mq.addEventListener) { mq.addEventListener("change", handleResize); }
  else if (mq.addListener) { mq.addListener(handleResize); }

  /* forms: no backend wired up yet, so submissions surface a local success state */
  document.querySelectorAll("form[data-local-submit]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) { return; }
      var shell = form.closest(".form-shell");
      if (shell) {
        shell.classList.add("is-submitted");
        var success = shell.querySelector(".form-success");
        if (success) {
          success.classList.add("is-visible");
          success.setAttribute("tabindex", "-1");
          success.focus();
        }
      }
    });
  });

  /* /auth sign up <-> sign in toggle, seeded from ?mode= */
  var authToggle = document.querySelector(".auth-toggle");
  if (authToggle) {
    var buttons = authToggle.querySelectorAll("button");
    var panels = document.querySelectorAll(".auth-only");
    var heading = document.getElementById("auth-heading");
    var lede = document.getElementById("auth-lede");
    var submit = document.getElementById("auth-submit");

    var copy = {
      signup: {
        heading: "Get started",
        lede: "Create your Butler account to start seeing jobs near you.",
        submit: "Create account"
      },
      signin: {
        heading: "Butler sign in",
        lede: "Welcome back — sign in to see your jobs and schedule.",
        submit: "Sign in"
      }
    };

    function setMode(mode) {
      buttons.forEach(function (btn) {
        btn.classList.toggle("is-active", btn.dataset.mode === mode);
      });
      panels.forEach(function (panel) {
        panel.classList.toggle("is-active", panel.dataset.mode === mode);
      });
      if (heading) { heading.textContent = copy[mode].heading; }
      if (lede) { lede.textContent = copy[mode].lede; }
      if (submit) { submit.textContent = copy[mode].submit; }
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () { setMode(btn.dataset.mode); });
    });

    var params = new URLSearchParams(window.location.search);
    var initial = params.get("mode") === "signin" ? "signin" : "signup";
    setMode(initial);
  }
})();
