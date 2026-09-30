/* ============================================================================
   Teacher Hub — boot.js
   Loaded last, once everything it calls exists.
   ============================================================================ */

window.addEventListener("DOMContentLoaded", () => {
  initUiLang();       // put the page into its language before anything is read
  showAppVersion();   // so "which build am I looking at" is a glance, not an inspection
  Backend.init();
  hubAuthBoot();      // recognise a teacher already signed in on this device
});
