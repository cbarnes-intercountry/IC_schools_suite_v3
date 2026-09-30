/* ============================================================================
   Teacher Hub — core/backend.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* The database, and the one place that talks to Firebase.

   This is a SECOND SITE sharing the app's Firebase project, not a copy of the app's backend:
   the same teacher accounts, the same sign-in, a different tree. It deliberately carries none
   of the app's session, quiz or participant methods — the hub has no lessons in it, and dead
   methods are how a file drifts out of step with the thing it was copied from. */

/* ---------- Firebase config ----------
   The app's project, because the hub's whole point is one sign-in for both. Not a secret —
   real protection comes from the security rules in firebase-rules.json. */
const firebaseConfig = {
  apiKey: "AIzaSyCDnTwzXufyJcg9teybNp9Z-hmL7BCl8Po",
  authDomain: "icquizapp-api.firebaseapp.com",
  databaseURL: "https://icquizapp-api-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "icquizapp-api",
  storageBucket: "icquizapp-api.firebasestorage.app",
  messagingSenderId: "149736129678",
  appId: "1:149736129678:web:318900fbcb9431e04c75df"
};

/* Where the app lives, for the one button that matters most on the front page.

   THE HUB IS THE FRONT DOOR. It sits at the root of the site and the app sits in /app/ beneath
   it, which is the arrangement the decisions log describes: the tools are launched from inside
   the hub rather than linked alongside it. So this path goes DOWN, not up.

   Relative, so the repo name and any later custom domain are none of the hub's business. And
   deliberately carrying no version number: a link that has to be edited on every release is a
   link that will one day point at a build nobody is running. */
const APP_URL = "app/";

let db = null;

const Backend = {
  live: false,
  _authReady: null,

  init(){
    if(!firebaseConfig.apiKey || firebaseConfig.apiKey.indexOf("PASTE_YOUR")!==-1){
      backendUnavailable(t("backend.no_settings", "This copy of the hub has no database settings — the Firebase API key is still a placeholder."));
      return;
    }
    if(typeof firebase==="undefined"){
      backendUnavailable(t("backend.library_missing", "The Firebase library did not load. Check the internet connection, and any content blocker in the browser."));
      return;
    }
    try{
      firebase.initializeApp(firebaseConfig); db = firebase.database();
    }catch(e){
      db = null;
      backendUnavailable(t("backend.could_not_start", "Firebase could not start: {why}", {why:(e&&e.message)||e}));
      return;
    }
    /* Unlike the app, the hub signs nobody in anonymously. There is no student door here and
       nothing an anonymous visitor may read, so the only identity the hub ever holds is a
       teacher's own. */
    this.live = true;
  },

  async _ref(path){ return db.ref(path); },

  /* ---------- teachers, prefs, config: the app's tree, read the same way ---------- */
  async getTeacher(uid){
    const s = await db.ref("teachers/"+uid).once("value");
    return s.val();
  },
  async getPrefs(uid){
    const s = await db.ref("prefs/"+uid).once("value");
    return s.val() || {};
  },
  async setPrefs(uid, rec){
    await db.ref("prefs/"+uid).update(rec);
    return { ok:true };
  },

  /* ---------- the hub's own tree ----------

     One small tree of text under hub/, not "a database": six sections, each a flat map of
     records keyed by a generated id. Read by any active teacher, written by an owner — which
     is what keeps staff email addresses behind the sign-in and out of the public repo that
     GitHub Pages requires. */
  async getHub(section){
    const s = await db.ref("hub/"+section).once("value");
    return s.val() || {};
  },
  async getHubAll(){
    const s = await db.ref("hub").once("value");
    return s.val() || {};
  },
  async setHubItem(section, key, rec){
    await db.ref("hub/"+section+"/"+key).set(rec);
    return { ok:true, key:key };
  },
  async deleteHubItem(section, key){
    await db.ref("hub/"+section+"/"+key).remove();
    return { ok:true };
  },
  async replaceHubSection(section, map){
    await db.ref("hub/"+section).set(map || null);
    return { ok:true };
  }
};

/* The blocking screen. The hub is a reference site: a page that silently shows nothing is worse
   than one that says it cannot reach anything, because a teacher who sees an empty contacts list
   concludes there are no contacts. */
function backendUnavailable(why){
  Backend.live = false;
  const box = document.getElementById("db-down");
  const msg = document.getElementById("db-down-why");
  if(msg) msg.textContent = why || "";
  if(box) box.hidden = false;
}

function backendRetry(){ location.reload(); }
