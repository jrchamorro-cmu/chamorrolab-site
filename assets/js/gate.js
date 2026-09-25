// Group passphrase gate for the members pages. Each page wraps its content in
// <div id="members" hidden> and carries the form in <div id="gate">. The page compares a
// SHA-256 hash of what is typed with HASH and remembers a match in this browser's
// localStorage, so one entry unlocks every members page on this browser. It keeps casual
// visitors out; it is not security, since this source is public. To change the passphrase,
// replace HASH with the output of: printf %s "newphrase" | shasum -a 256
// (lower case, no spaces). Every browser then asks once for the new one.
(function () {
  var HASH = "0a8d171a0f9b8fe0ae4ff1871604bbaea03feae754cec2b9ba930421da9acfbe";
  var KEY = "crg-members";
  function show() {
    document.getElementById("gate").hidden = true;
    document.getElementById("members").hidden = false;
    document.dispatchEvent(new Event("members-open"));
  }
  async function sha256(text) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function init() {
    try { if (localStorage.getItem(KEY) === HASH) { show(); return; } } catch (e) {}
    document.getElementById("gateform").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var typed = document.getElementById("gatepass").value.trim().toLowerCase().replace(/\s+/g, "");
      if (await sha256(typed) === HASH) {
        try { localStorage.setItem(KEY, HASH); } catch (e) {}
        show();
      } else {
        document.getElementById("gatemsg").hidden = false;
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
