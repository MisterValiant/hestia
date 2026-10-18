/* Hestia v0.5 — Independent Firebase project.
   Same model as Chronos: Google Authentication + dashboards/{uid}, a single
   Firestore document per account containing an events array.
   Hestia never reads or writes to the Chronos Firebase project.
   Writes use transactions to avoid lost events when both phones save at once.
*/
(function () {
  'use strict';
  const subscribers = new Set();
  const state = {mode:'connecting',user:null,spaceId:null,space:null,events:[],members:[],invites:[],error:null,push:false};
  function emit(changes) {
    Object.assign(state, changes);
    for (const cb of subscribers) { try {cb({...state});} catch (e) {console.error(e);} }
  }
  function subscribe(cb) { subscribers.add(cb); cb({...state}); return ()=>subscribers.delete(cb); }
  function unavailable(message) {
    emit({mode:'unavailable',error:message});
    const err=()=>{throw Error(message);};
    window.HestiaBackend={ready:false,subscribe,signIn:err,signOut:err,saveEvent:err,removeEvent:err,enableNotifications:err};
  }
  const cfg=window.HESTIA_CONFIG?.firebase;
  const required=['apiKey','authDomain','projectId','messagingSenderId','appId'];
  if (!window.firebase || !cfg || required.some(k=>!cfg[k] || String(cfg[k]).includes('REPLACE_'))) {
    unavailable('Hestia is not connected yet. Create its own Firebase project and paste the Web app configuration into firebase-settings.js.');
    return;
  }
  // Safety guard prevents accidentally pointing Hestia at the old Chronos project.
  if (cfg.projectId === 'dashboard-countdown') {
    unavailable('Hestia must use its NEW Firebase project, not the Chronos project. Update firebase-settings.js.');
    return;
  }
  const fb=window.firebase;
  let app,auth,db,unsub=()=>{};
  try {
    app=fb.apps.length?fb.app():fb.initializeApp(cfg);
    if (app.options.projectId!==cfg.projectId)throw Error('A different Firebase app is already initialized on this page.');
    auth=app.auth();db=app.firestore();
    try {db.settings({experimentalAutoDetectLongPolling:true,useFetchStreams:false});} catch (_) {}
  } catch (e) {unavailable('Firebase initialization failed: '+(e.message||String(e)));return;}

  const MAX_EVENTS=300; // The Chronos-style single-document model has a Firestore 1 MiB size limit.
  const ref=uid=>db.collection('dashboards').doc(uid);
  const validId=id=>typeof id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  const normEvents=data=>Array.isArray(data?.events)
    ?data.events.filter(e=>e&&validId(e.id)&&typeof e.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date))
    :[];
  function fail(e) {console.error('[Hestia Firebase]',e);emit({mode:'error',error:e?.message||String(e)});}

  auth.onAuthStateChanged(user=>{
    unsub();unsub=()=>{};
    if (!user) {
      emit({mode:'signed-out',user:null,spaceId:null,space:null,events:[],members:[],invites:[],error:null,push:false});
      return;
    }
    const profile={uid:user.uid,email:user.email||'',displayName:user.displayName||'',photoURL:user.photoURL||''};
    emit({mode:'syncing',user:profile,spaceId:user.uid,space:{name:'Our little corner',ownerUid:user.uid},events:[],members:[],invites:[],error:null,push:false});
    // Real-time listener shared by both Android devices using the same login.
    unsub=ref(user.uid).onSnapshot(snap=>{
      if (auth.currentUser?.uid!==user.uid)return;
      emit({mode:'connected',events:normEvents(snap.exists?snap.data():{}),error:null});
    },fail);
  },fail);

  async function signIn() {
    try { await auth.signInWithPopup(new fb.auth.GoogleAuthProvider()); }
    catch (e) {
      if (['auth/popup-blocked','auth/cancelled-popup-request'].includes(e.code))
        throw Error('Google sign-in popup was blocked. Open Hestia in Chrome and try again.');
      throw e;
    }
  }
  async function signOut() {await auth.signOut();}
  function eventRecord(e,old) {
    const title=String(e.title||'').trim().slice(0,90);
    if (!title)throw Error('Enter a title for the plan.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!/^\d{2}:\d{2}$/.test(e.time))throw Error('Invalid date or time.');
    if (!Number.isFinite(new Date(`${e.date}T${e.time}:00`).getTime()))throw Error('Invalid date or time.');
    return {
      id:e.id,title,date:e.date,time:e.time,duration:Number(e.duration)||0,
      category:['outing','appointment','errand','home'].includes(e.category)?e.category:'outing',
      departure:e.departure||'',location:String(e.location||'').slice(0,120),
      notes:String(e.notes||'').slice(0,600),
      reminders:(Array.isArray(e.reminders)?e.reminders:[]).filter(n=>[30,60,180,1440].includes(Number(n))).map(Number),
      completed:!!e.completed,createdAt:old?.createdAt||new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
  }
  async function saveEvent(e) {
    const user=auth.currentUser;
    if (!user)throw Error('Sign in with Google first.');
    if (!validId(e.id))throw Error('Invalid plan ID.');
    await db.runTransaction(async tx=>{
      const docRef=ref(user.uid);
      const doc=await tx.get(docRef);
      const current=normEvents(doc.exists?doc.data():{});
      const index=current.findIndex(item=>item.id===e.id);
      if (index<0 && current.length>=MAX_EVENTS)throw Error('This calendar has reached its 300-event limit; archive old plans first.');
      const record=eventRecord(e,index>=0?current[index]:null);
      const next=index>=0?current.map(item=>item.id===record.id?record:item):[...current,record];
      // Same write pattern as Chronos: per-user dashboards document containing arrays.
      tx.set(docRef,{events:next},{merge:true});
    });
  }
  async function removeEvent(id) {
    const user=auth.currentUser;
    if (!user)throw Error('Sign in with Google first.');
    if (!validId(id))throw Error('Invalid plan ID.');
    await db.runTransaction(async tx=>{
      const docRef=ref(user.uid);
      const doc=await tx.get(docRef);
      const current=normEvents(doc.exists?doc.data():{});
      if (!current.some(e=>e.id===id))return;
      tx.set(docRef,{events:current.filter(e=>e.id!==id)},{merge:true});
    });
  }
  async function enableNotifications() {
    throw Error('Background alerts need a notification sender (e.g. scheduled Cloud Function). The calendar sync is working, but push reminders are not active yet.');
  }
  window.HestiaBackend={ready:true,subscribe,signIn,signOut,saveEvent,removeEvent,enableNotifications};
})();
