(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var yearEl = document.getElementById("year");
    if (yearEl) { yearEl.textContent = new Date().getFullYear(); }
  });

  /* ---------- scroll reveal ---------- */
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

  /* ---------- mobile menu ---------- */
  var body = document.body;
  var burger = document.getElementById("burger");
  var nav = document.getElementById("site-nav");
  var backdrop = document.getElementById("menu-backdrop");

  function openMenu() {
    body.classList.add("menu-open");
    if (burger) { burger.setAttribute("aria-expanded", "true"); burger.setAttribute("aria-label", "Close menu"); }
  }
  function closeMenu() {
    body.classList.remove("menu-open");
    if (burger) { burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Open menu"); }
  }
  if (burger) { burger.addEventListener("click", function () { body.classList.contains("menu-open") ? closeMenu() : openMenu(); }); }
  if (backdrop) { backdrop.addEventListener("click", closeMenu); }
  if (nav) { nav.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", closeMenu); }); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); } });
  var mq = window.matchMedia("(min-width: 901px)");
  function handleResize(e) { if (e.matches) { closeMenu(); } }
  if (mq.addEventListener) { mq.addEventListener("change", handleResize); }
  else if (mq.addListener) { mq.addListener(handleResize); }

  /* ---------- 3D tilt-on-hover (feature cards + hero copy) ---------- */
  var canTilt = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function attachTilt(triggerEl, targetEl, maxDeg) {
    if (!triggerEl || !targetEl) { return; }
    triggerEl.addEventListener("mousemove", function (e) {
      var rect = triggerEl.getBoundingClientRect();
      var relX = (e.clientX - rect.left) / rect.width;
      var relY = (e.clientY - rect.top) / rect.height;
      var rotY = (relX - 0.5) * 2 * maxDeg;
      var rotX = (0.5 - relY) * 2 * maxDeg;
      targetEl.style.transform = "perspective(900px) rotateX(" + rotX.toFixed(2) + "deg) rotateY(" + rotY.toFixed(2) + "deg) translateZ(4px)";
    });
    triggerEl.addEventListener("mouseleave", function () {
      targetEl.style.transform = "";
    });
  }

  if (canTilt) {
    document.querySelectorAll(".feature-card").forEach(function (card) {
      attachTilt(card, card, 7);
    });
    document.querySelectorAll(".hero").forEach(function (heroEl) {
      var copy = heroEl.querySelector(".hero-copy");
      if (copy) { attachTilt(heroEl, copy, 2.5); }
    });
  }

  /* ---------- parallax hero backgrounds ---------- */
  var parallaxLayers = document.querySelectorAll(".hero-bg");
  if (parallaxLayers.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var raf = null;
    function updateParallax() {
      raf = null;
      parallaxLayers.forEach(function (layer) {
        var rect = layer.getBoundingClientRect();
        var offset = rect.top * 0.12;
        layer.style.transform = "translateY(" + offset.toFixed(1) + "px)";
      });
    }
    window.addEventListener("scroll", function () {
      if (raf === null) { raf = requestAnimationFrame(updateParallax); }
    }, { passive: true });
    updateParallax();
  }

  /* ---------- request form -> store ---------- */
  var requestForm = document.querySelector("form[data-request-form]");
  if (requestForm) {
    requestForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!requestForm.reportValidity()) { return; }
      if (window.CBStore) {
        CBStore.addJob({
          service: document.getElementById("service").value,
          name: document.getElementById("name").value,
          phone: document.getElementById("phone").value,
          email: document.getElementById("email").value,
          address: document.getElementById("address").value,
          date: document.getElementById("date").value,
          budget: document.getElementById("budget").value,
          details: document.getElementById("details").value
        });
      }
      showSuccess(requestForm);
    });
  }

  /* ---------- auth form -> store ---------- */
  var authForm = document.querySelector("form[data-auth-form]");
  if (authForm) {
    authForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!authForm.reportValidity()) { return; }
      var isSignup = document.querySelector(".auth-toggle button[data-mode='signup']").classList.contains("is-active");
      var successText = { h: "You're in", p: "This is a demo flow — account creation isn't wired up to a backend yet, but your details looked good." };
      if (isSignup && window.CBStore) {
        var prefs = Array.prototype.slice.call(document.querySelectorAll("input[name='jobTypePref']:checked")).map(function (cb) { return cb.value; });
        CBStore.addButler({
          name: document.getElementById("su-name").value,
          contact: document.getElementById("su-contact").value,
          serviceArea: document.getElementById("su-area").value,
          jobTypePrefs: prefs
        });
        successText = { h: "You're all set", p: "Your Butler profile was saved on this device. An admin will see you in the roster." };
      } else {
        successText = { h: "Welcome back", p: "This is a demo flow — sign-in isn't wired up to a backend yet, but your details looked good." };
      }
      showSuccess(authForm, successText);
    });
  }

  function showSuccess(form, textOverride) {
    var shell = form.closest(".form-shell");
    if (!shell) { return; }
    shell.classList.add("is-submitted");
    var success = shell.querySelector(".form-success");
    if (success) {
      if (textOverride) {
        var h3 = success.querySelector("h3");
        var p = success.querySelector("p");
        if (h3) { h3.textContent = textOverride.h; }
        if (p) { p.textContent = textOverride.p; }
      }
      success.classList.add("is-visible");
      success.setAttribute("tabindex", "-1");
      success.focus();
    }
  }

  /* ---------- /auth sign up <-> sign in toggle ---------- */
  var authToggle = document.querySelector(".auth-toggle");
  if (authToggle) {
    var buttons = authToggle.querySelectorAll("button");
    var panels = document.querySelectorAll(".auth-only");
    var heading = document.getElementById("auth-heading");
    var lede = document.getElementById("auth-lede");
    var submit = document.getElementById("auth-submit");

    var copy = {
      signup: { heading: "Get started", lede: "Create your Butler account to start seeing jobs near you.", submit: "Create account" },
      signin: { heading: "Butler sign in", lede: "Welcome back — sign in to see your jobs and schedule.", submit: "Sign in" }
    };

    function setMode(mode) {
      buttons.forEach(function (btn) { btn.classList.toggle("is-active", btn.dataset.mode === mode); });
      panels.forEach(function (panel) {
        var isActive = panel.dataset.mode === mode;
        panel.classList.toggle("is-active", isActive);
        // Hidden panels must not hold `required` fields hostage during validation/submit.
        panel.querySelectorAll("input").forEach(function (input) { input.disabled = !isActive; });
      });
      if (heading) { heading.textContent = copy[mode].heading; }
      if (lede) { lede.textContent = copy[mode].lede; }
      if (submit) { submit.textContent = copy[mode].submit; }
    }
    buttons.forEach(function (btn) { btn.addEventListener("click", function () { setMode(btn.dataset.mode); }); });

    var params = new URLSearchParams(window.location.search);
    setMode(params.get("mode") === "signin" ? "signin" : "signup");
  }
})();
