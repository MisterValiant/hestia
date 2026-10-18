/* Hestia v0.5 — independent Firebase project. Google Auth + dashboards/{uid}. */
(() => {
  'use strict';
  const DATA_KEY = 'hestia_preview_events_v1';
  const THEME_KEY = 'hestia_preview_theme_v1';
  const main = document.getElementById('mainContent');
  const eventDialog = document.getElementById('eventDialog');
  const detailDialog = document.getElementById('detailDialog');
  const dayDialog = document.getElementById('dayDialog');
  const topProgress = document.getElementById('topProgress');
  const eventForm = document.getElementById('eventForm');
  const toastEl = document.getElementById('toast');
  const dateNow = new Date();
  const todayISO = isoDate(dateNow);
  let selectedDate = todayISO;
  let monthCursor = startMonth(dateNow);
  let view = ['today','calendar','plans','us'].includes(new URLSearchParams(location.search).get('view')) ? new URLSearchParams(location.search).get('view') : 'today';
  let filter = 'upcoming';
  let query = '';
  let currentCategory = 'errand';
  let pendingOperations = 0;
  let formSaving = false;
  let editingId = null;
  let openedId = null;
  let installEvent = null;
  let toastTimeout = null;

  function pad(v) { return String(v).padStart(2,'0'); }
  function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function fromISO(iso) { const [y,m,d] = iso.split('-').map(Number);return new Date(y,m-1,d,12); }
  function addDays(iso,offset) { const d=fromISO(iso);d.setDate(d.getDate()+offset);return isoDate(d); }
  function startMonth(d) { return new Date(d.getFullYear(),d.getMonth(),1,12); }
  function startWeek(iso) { const d=fromISO(iso);const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return d; }
  function moveDay(iso,days) { return addDays(iso,days); }
  function formatDay(iso,opts={weekday:'long',month:'long',day:'numeric'}) { return fromISO(iso).toLocaleDateString('en-GB',opts); }
  function formatTime(time) { if(!time)return 'All day'; const [h,m] = time.split(':').map(Number);return new Date(2026,1,1,h,m).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); }
  function startAt(ev){return new Date(`${ev.date}T${ev.time||'00:00'}:00`).getTime();}
  function sortEvents(list){return [...list].sort((a,b)=>startAt(a)-startAt(b));}
  function escapeHTML(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const ico = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const categoryLabels = {outing:'Outing',appointment:'Appointment',errand:'Errand',home:'Home'};
  const categoryEmoji = {outing:'✿',appointment:'◷',errand:'◈',home:'⌂'};
  function seedEvents(){return [
    {id:cryptoId(),title:'Coffee & a little catch-up',date:addDays(todayISO,1),time:'10:30',duration:90,category:'outing',location:'Our favourite café',departure:'10:00',notes:'A relaxed morning together.',reminders:[1440,30],completed:false,sample:true},
    {id:cryptoId(),title:'Pick up a few things',date:addDays(todayISO,3),time:'15:00',duration:60,category:'errand',location:'Town centre',departure:'14:20',notes:'Remember the shopping list.',reminders:[180,30],completed:false,sample:true},
    {id:cryptoId(),title:'Family lunch',date:addDays(todayISO,6),time:'12:30',duration:120,category:'home',location:'Family home',departure:'11:45',notes:'Bring something sweet.',reminders:[1440,30],completed:false,sample:true}
  ];}
  function cryptoId(){return typeof crypto!=='undefined'&&crypto.randomUUID ? crypto.randomUUID() : 'h-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
  function load(){try{const raw=localStorage.getItem(DATA_KEY);if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed.filter(e=>e&&typeof e.title==='string'&&/^\d{4}-\d\d-\d\d$/.test(e.date));}}catch(err){console.warn('Could not load preview:',err);}return seedEvents();}
  let events=load();
  let backendState={mode:'connecting',user:null,spaceId:null,space:null,events:[],members:[],invites:[],error:null,push:false};
  const backend=window.HestiaBackend;
  const cloudUser=()=>!!backendState.user;
  const sharedSpace=()=>!!(backendState.user&&backendState.spaceId);
  const pushConfigured=()=>false;
  function setState(s){
    const oldSpace=backendState.spaceId;
    backendState=s;
    if(cloudUser())events=(s.events||[]).map(e=>({id:e.id,title:e.title,date:e.date,time:e.time,duration:e.duration,category:e.category,departure:e.departure,location:e.location,notes:e.notes,reminders:e.reminders||[],completed:!!e.completed}));
    else events=load();
    if(s.spaceId&&oldSpace!==s.spaceId){selectedDate=todayISO;monthCursor=startMonth(new Date());}
    updateCloudStatus();render();
  }
  function initialsForPair(){
    return ['S','T'];
  }
  function updateAvatarGroup(root){
    if(!root)return;
    const first=root.querySelector('.avatar-one, .big-face:first-child');
    const second=root.querySelector('.avatar-two, .big-face:nth-child(2)');
    const isHeader=root.classList.contains('member-pill');
    const user=backendState.user;
    const photo=user?.photoURL||'';
    const initial=((user?.displayName||user?.email||'S').trim().charAt(0)||'S').toUpperCase();
    root.classList.toggle('is-signed-in',!!user && isHeader);
    if(isHeader)root.setAttribute('aria-label',user?'Open account for '+(user.displayName||user.email||'signed-in user'):'Open sign-in and Our Space');
    if(first){
      if(user && photo){
        first.dataset.fallback=initial;
        first.innerHTML=`<img src="${escapeHTML(photo)}" alt="" class="avatar-photo" referrerpolicy="no-referrer">`;
        first.classList.add('avatar-has-photo');
      }else{
        first.textContent=user?initial:'S';
        first.classList.remove('avatar-has-photo');
      }
    }
    if(second)second.textContent='T';
  }
  document.addEventListener('error',e=>{
    if(e.target?.classList?.contains('avatar-photo')){
      const holder=e.target.parentElement;if(!holder)return;
      holder.textContent=holder.dataset.fallback||'S';holder.classList.remove('avatar-has-photo');
    }
  },true);
  function updateLoading(){
    const backendBusy=['connecting','syncing'].includes(backendState.mode);
    const active=pendingOperations>0||backendBusy;
    topProgress?.classList.toggle('active',active);
    topProgress?.setAttribute('aria-hidden',active?'false':'true');
  }
  function beginLoading(){pendingOperations++;updateLoading();}
  function finishLoading(){pendingOperations=Math.max(0,pendingOperations-1);updateLoading();}
  function updateCloudStatus(){
    const node=document.querySelector('.local-status');
    if(!node)return;
    const label=backendState.mode==='unavailable'?'OFFLINE':backendState.mode==='error'?'SYNC ERROR':backendState.user?(backendState.spaceId?(backendState.mode==='syncing'?'SYNCING':'SYNCED'):'SIGNED IN'):'LOCAL';
    node.innerHTML=`<span class="status-dot"></span> ${label}`;
    node.title=backendState.error||'Hestia connection status';
    updateAvatarGroup(document.querySelector('.member-pill'));
    updateAvatarGroup(document.querySelector('.together-faces'));
    updateLoading();
  }
  async function doCloud(action,success){beginLoading();try{await action();if(success)showToast(success);}catch(err){console.error(err);showToast(err?.message||'Action failed; try again.');}finally{finishLoading();}}

  function persist(){try{localStorage.setItem(DATA_KEY,JSON.stringify(events));}catch(err){showToast('Storage is unavailable in this browser.');}}
  // Seed examples are intentionally examples rather than actual commitments.
  try { if(localStorage.getItem(DATA_KEY)===null)persist(); } catch(err) { /* local preview still displays when storage is blocked */ }
  try{if(localStorage.getItem(THEME_KEY)==='night')document.body.classList.add('night');}catch(err){}
  function getDayEvents(iso){return sortEvents(events.filter(e=>e.date===iso));}
  function upcoming(){return sortEvents(events.filter(e=>!e.completed&&startAt(e)>=Date.now()-60*60*1000));}
  function monthText(d){return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
  function isThisWeek(iso){return startWeek(isoDate(new Date())).getTime()===startWeek(iso).getTime();}
  function showToast(s){toastEl.textContent=s;toastEl.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toastEl.classList.remove('show'),2800);}
  function heading(kicker,title,desc='',action=''){return `<section class="page-head"><div><span class="eyebrow">${kicker}</span><h1 class="page-title">${title}</h1>${desc?`<p class="page-sub">${desc}</p>`:''}</div>${action}</section>`;}
  function eventCard(ev){const type=categoryLabels[ev.category]||'Plan';return `<button type="button" class="event-card ${ev.completed?'completed-card':''}" data-event="${escapeHTML(ev.id)}" aria-label="View ${escapeHTML(ev.title)}"><div class="event-time">${formatTime(ev.time)}</div><span class="event-rule ${escapeHTML(ev.category||'outing')}"></span><div class="event-content"><div class="event-title">${escapeHTML(ev.title)}</div><div class="event-desc">${ev.location?`${ico('pin')}<span>${escapeHTML(ev.location)}</span>`:`${ico('calendar')}<span>${type}${ev.completed?' · Completed':''}</span>`}</div>${ev.sample?'<span class="sample-chip">SAMPLE EVENT</span>':''}</div><span class="event-right">${ico('right')}</span></button>`;}
  function emptyState(iso,emptyLabel='Nothing planned yet'){return `<div class="empty-card"><span class="empty-icon">${ico('spark')}</span><h3>${emptyLabel}</h3><p>${iso?'A lovely bit of breathing room. Add something if plans come up.':'Your shared moments will find a home here.'}</p><button type="button" class="inline-add" data-action="add">+ Add a plan</button></div>`;}
  function listDayEvents(iso){const list=getDayEvents(iso);return list.length?`<div class="event-stack">${list.map(eventCard).join('')}</div>`:emptyState(iso);}
  function previewNote(){
    if(sharedSpace())return !pushConfigured()
      ? `<div class="preview-note">${ico('bell')}<div><strong>Your plans sync across devices.</strong> Sign into Hestia with the same Google account on both Android phones. Background reminders still require a separate push setup.</div></div>`:'';
    return `<div class="preview-note">${ico('spark')}<div><strong>Local preview.</strong> Sign in under <button type="button" class="text-link" data-view="us">Our space</button> with the Google account authorised for Hestia. Sample plans aren't automatically uploaded.</div></div>`;
  }
  function weekStrip(){const mon=startWeek(selectedDate),dates=Array.from({length:7},(_,i)=>addDays(isoDate(mon),i));return `<div class="surface-card week-card"><div class="week-header"><span class="week-month">${fromISO(selectedDate).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</span><div class="arrows"><button type="button" class="small-icon-btn" data-action="prev-week" aria-label="Previous week">${ico('left')}</button><button type="button" class="small-icon-btn" data-action="next-week" aria-label="Next week">${ico('right')}</button></div></div><div class="week-days">${dates.map(day=>{const count=getDayEvents(day).length;return `<button type="button" class="week-day ${day===selectedDate?'selected':''} ${day===todayISO?'today-ring':''}" data-day="${day}" aria-pressed="${day===selectedDate}" aria-label="${formatDay(day)}, ${count} events"><span class="dayname">${fromISO(day).toLocaleDateString('en-GB',{weekday:'short'})}</span><span class="daynum">${fromISO(day).getDate()}</span><span class="daydots">${count?'<span class="daydot"></span>'.repeat(Math.min(count,3)):''}</span></button>`}).join('')}</div></div>`;}
  function nextCard(){const next=upcoming()[0];if(!next)return `<section class="up-next-card up-next-empty"><span class="eyebrow">COMING UP NEXT</span><h3>Something lovely could go here.</h3><p class="mini-caption">Add a plan and keep your next moment close.</p><button class="next-action" type="button" data-action="add">Add a plan ${ico('arrow')}</button></section>`;return `<section class="up-next-card"><span class="eyebrow">COMING UP NEXT</span><h3>${escapeHTML(next.title)}</h3><div class="next-meta"><span>${ico('calendar')}${formatDay(next.date,{weekday:'short',day:'numeric',month:'short'})}</span><span>${ico('clock')}${formatTime(next.time)}</span></div><button type="button" class="next-action" data-event="${escapeHTML(next.id)}">View plan ${ico('arrow')}</button></section>`;}
  function renderToday(){const active=upcoming().length;const hello=new Date().getHours()<12?'Good morning':new Date().getHours()<17?'Good afternoon':'Good evening';return `
    ${heading('YOUR LITTLE CORNER',`${hello}<span style="color:var(--terra)">.</span>`,'Here’s what your days are looking like.')}
    <section class="hero"><div class="hero-content"><span class="eyebrow">HESTIA · TOGETHER</span><h2>Make room for<br><em>moments.</em></h2><p>${active?`${active} lovely ${active===1?'plan':'plans'} on the horizon.`:'A fresh page for your next memory.'}</p></div><div class="hero-art" aria-hidden="true"><span class="hero-spark sp1">✧</span><span class="hero-spark sp2">✦</span><div class="sun-arch"></div><div class="leaf-stem stem-one"></div><div class="leaf-stem stem-two"></div></div></section>
    ${previewNote()}
    <div class="home-two-col"><div class="main-events">
      <div class="section-label-row"><h2 class="section-title">A week at a glance</h2><button class="text-link" type="button" data-view="calendar">Full calendar ${ico('right')}</button></div>
      ${weekStrip()}
      <section class="agenda-block"><div class="section-label-row"><div><h2 class="section-title">${selectedDate===todayISO?'Today’s plans':'Plans for the day'}</h2><span class="mini-caption">${formatDay(selectedDate)}</span></div><span class="mini-caption">${getDayEvents(selectedDate).length} ${getDayEvents(selectedDate).length===1?'plan':'plans'}</span></div>${listDayEvents(selectedDate)}</section>
    </div><div class="secondary-events"><div class="section-label-row"><h2 class="section-title">The next moment</h2></div>${nextCard()}<div class="surface-card insight-card" style="margin-top:15px"><span class="insight-icon">${ico('heart')}</span><div><strong>The little things matter.</strong><p>Keep every plan in one shared place, and make room for more moments together.</p></div></div></div></div>`;}
  function renderCalendar(){const y=monthCursor.getFullYear(),m=monthCursor.getMonth(),firstWeekday=(new Date(y,m,1).getDay()+6)%7,daysInMonth=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();const cells=[];for(let i=0;i<42;i++){let day,mo=m,yr=y,other=false;if(i<firstWeekday){day=prevDays-firstWeekday+i+1;mo=m-1;other=true;}else if(i>=firstWeekday+daysInMonth){day=i-firstWeekday-daysInMonth+1;mo=m+1;other=true;}else{day=i-firstWeekday+1;}const dt=new Date(yr,mo,day,12),iso=isoDate(dt),count=getDayEvents(iso).length;cells.push(`<button type="button" class="month-cell ${other?'outside':''} ${iso===selectedDate?'selected':''} ${iso===todayISO?'today':''}" data-day="${iso}" aria-label="${formatDay(iso)}, ${count} plans" aria-pressed="${iso===selectedDate}"><span class="num">${day}</span><span class="daydots">${count?'<span class="daydot"></span>'.repeat(Math.min(count,3)):''}</span></button>`);}return `<div class="calendar-page">${heading('THE DAYS WE SHARE','Our calendar','A home for all the dates worth remembering.',`<div class="calendar-header-actions"><button type="button" class="tiny-button" data-action="go-today">${ico('calendar')} Today</button><button type="button" class="calendar-new-button" data-action="add">${ico('plus')} New plan</button></div>`)}<section class="surface-card month-card"><div class="month-toolbar"><div class="month-label">${monthText(monthCursor)}</div><div class="arrows"><button class="small-icon-btn" type="button" data-action="prev-month" aria-label="Previous month">${ico('left')}</button><button class="small-icon-btn" type="button" data-action="next-month" aria-label="Next month">${ico('right')}</button></div></div><div class="month-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<span class="month-weekday">${x}</span>`).join('')}${cells.join('')}</div></section><section class="month-agenda"><div class="section-label-row"><h2 class="month-agenda-title">${formatDay(selectedDate,{weekday:'long',month:'long',day:'numeric'})}</h2><button class="calendar-new-button" type="button" data-action="add">${ico('plus')} New plan</button></div>${listDayEvents(selectedDate)}</section></div>`;}
  function planResults(){const now=Date.now()-60*60*1000;let chosen=events.filter(ev=>{
    const matchQuery=!query||`${ev.title} ${ev.location||''} ${ev.notes||''}`.toLowerCase().includes(query.toLowerCase());
    if(!matchQuery)return false;
    if(filter==='upcoming')return !ev.completed&&startAt(ev)>=now;
    if(filter==='completed')return !!ev.completed;
    return true;
  });chosen=sortEvents(chosen);if(filter==='all')chosen=chosen.reverse();if(!chosen.length)return emptyState(null,query?'No matching plans':'Nothing here yet');let parts=[],lastDay='';chosen.forEach(ev=>{if(ev.date!==lastDay){parts.push(`<div class="plan-date-heading">${formatDay(ev.date,{weekday:'long',month:'long',day:'numeric'})}</div>`);lastDay=ev.date;}parts.push(eventCard(ev));});return parts.join('');}
  function renderPlans(){return `<div class="plans-page">${heading('ALL THE LITTLE THINGS','Our plans','Everything coming up, gathered in one place.',`<button type="button" class="tiny-button" data-action="add">${ico('plus')} Add plan</button>`)}<div class="filters"><button class="filter-chip ${filter==='upcoming'?'active':''}" data-filter="upcoming">Upcoming</button><button class="filter-chip ${filter==='all'?'active':''}" data-filter="all">All plans</button><button class="filter-chip ${filter==='completed'?'active':''}" data-filter="completed">Completed</button></div><label class="search-box">${ico('search')}<input id="planSearch" type="search" placeholder="Search your plans..." value="${escapeHTML(query)}" aria-label="Search plans"></label><div id="plansList">${planResults()}</div></div>`;}
  function renderUs(){
    const samples=events.filter(e=>e.sample).length;
    const u=backendState.user;
    const ready=sharedSpace();
    const oldLocalPlans=load().filter(ev=>!ev.sample);
    const accountArea=!u
      ? `<button class="setting-row google-sign-in" data-action="sign-in" type="button"><span class="setting-icon google-mark" aria-hidden="true"><svg viewBox="0 0 48 48" width="23" height="23"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.47 14.47 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span><span class="setting-copy"><strong>Sign in with Google</strong><small>Use the Google account authorised for Hestia on both phones</small></span>${ico('right')}</button>`
      : `<div class="account-summary"><strong>${escapeHTML(u.displayName||'Your Google account')}</strong><span>${escapeHTML(u.email||'')}</span><button type="button" class="tiny-button" data-action="sign-out">Sign out</button></div>`;
    const migration=ready&&oldLocalPlans.length
      ? `<button type="button" class="setting-row" data-action="import-local"><span class="setting-icon">${ico('share')}</span><span class="setting-copy"><strong>Import ${oldLocalPlans.length} local ${oldLocalPlans.length===1?'plan':'plans'}</strong><small>Copy your browser's personal plans to the synced calendar</small></span>${ico('right')}</button>`:'';
    return `<div class="us-page">${heading('A SPACE OF OUR OWN','Our little corner','A thoughtful home for shared plans, just the two of you.')}
    <section class="together-card"><span class="eyebrow">A PLACE TOGETHER</span><h2>Better days,<br>planned together.</h2><p>The things we do, the places we go, and the moments we don’t want to miss.</p><div class="together-faces"><span class="big-face">S</span><span class="big-face">T</span><span class="big-face face-add">${ico('heart')}</span></div></section>
    <div class="us-section"><div class="section-label-row"><h2 class="section-title">Your Google account</h2><span class="mini-caption">${backendState.mode==='error'?'Connection failed':ready?(backendState.mode==='syncing'?'Syncing…':'Connected on this phone'):'Sign in to sync'}</span></div><div class="setting-card">${accountArea}</div></div>
    <div class="us-section"><h2 class="section-title">Our shared calendar</h2><div class="setting-card"><div class="setting-row"><span class="setting-icon">${ico('people')}</span><span class="setting-copy"><strong>One account, two phones</strong><small>Sign in with this same Google account on your fiancée’s Android phone. Events sync automatically when online.</small></span>${ico('check')}</div>${migration}</div></div>
    <div class="us-section"><div class="section-label-row"><h2 class="section-title">Your Hestia</h2></div><div class="setting-card">
    <button class="setting-row" type="button" data-action="install"><span class="setting-icon">${ico('home')}</span><span class="setting-copy"><strong>Install Hestia</strong><small>Add Hestia to your Android home screen</small></span>${ico('right')}</button>
    <button class="setting-row" type="button" data-action="theme"><span class="setting-icon">${ico(document.body.classList.contains('night')?'sun':'moon')}</span><span class="setting-copy"><strong>${document.body.classList.contains('night')?'Use daylight colours':'Use evening colours'}</strong><small>Switch between cream-and-sage and forest-night</small></span>${ico('right')}</button>
    <button class="setting-row" type="button" data-action="notify" ${!ready||!pushConfigured()?'disabled':''}><span class="setting-icon">${ico('bell')}</span><span class="setting-copy"><strong>${backendState.push?'Notifications enabled on this device':'Android reminder notifications'}</strong><small>${!pushConfigured()?'Coming later: background push needs Cloud Functions and Web Push deployment':backendState.push?'Phone registered for alerts':'Enable separately on each phone'}</small></span><span class="mini-tag">${backendState.push?'ON':pushConfigured()?'SET UP':'COMING SOON'}</span></button>
    ${!u&&samples?`<button class="setting-row" type="button" data-action="clear-samples"><span class="setting-icon">${ico('trash')}</span><span class="setting-copy"><strong>Remove sample events</strong><small>Remove ${samples} demonstration plans</small></span>${ico('right')}</button>`:''}
    </div></div>
    <div class="explain-box"><strong>Hestia has its own Firebase project.</strong><p>Your plans are saved under <code>dashboards/{uid}</code> as an <code>events</code> array, following Chronos’s single-document-per-user structure, but completely independently. ${ready?'Your calendar is connected.':'Set up Hestia Firebase, then sign in on both Android phones with the same authorised Google account.'} Background Android alerts are not yet active.</p>${backendState.error?`<p class="sync-error">Firebase error: ${escapeHTML(backendState.error)}. Check the Hestia configuration, Google sign-in and Firestore rules.</p>`:''}</div></div>`;
  }
  function render(){main.innerHTML=view==='today'?renderToday():view==='calendar'?renderCalendar():view==='plans'?renderPlans():renderUs();document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);if(button.classList.contains('bottom-item')||button.classList.contains('nav-btn')){if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}});updateCloudStatus();}
  function navigate(to){view=to;if(to==='calendar')monthCursor=startMonth(fromISO(selectedDate));render();window.scrollTo({top:0,behavior:'instant'});}
  function resetFormErrors(){
    document.getElementById('formAlert').hidden=true;
    document.querySelectorAll('.field-error').forEach(el=>el.remove());
    eventForm.querySelectorAll('[aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
  }
  function fieldError(id,message){
    const el=document.getElementById(id);
    if(!el)return;
    el.setAttribute('aria-invalid','true');
    el.setAttribute('aria-describedby',id+'Error');
    const note=document.createElement('span');note.className='field-error';note.id=id+'Error';note.textContent=message;
    el.insertAdjacentElement('afterend',note);
  }
  function validPlanDateTime(date,time){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
    const [y,m,d]=date.split('-').map(Number),[h,mi]=time.split(':').map(Number);
    const dt=new Date(y,m-1,d,h,mi,0,0);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d&&dt.getHours()===h&&dt.getMinutes()===mi?dt:null;
  }
  function validatePlanForm(existing,title,date,time,departure){
    resetFormErrors();let first=null;
    function fail(id,msg){fieldError(id,msg);first=first||document.getElementById(id);}
    if(!title)fail('fTitle','Please give your plan a name.');
    else if(title.length>90)fail('fTitle','Please keep the name under 90 characters.');
    if(!date)fail('fDate','Choose the day of your plan.');
    if(!time)fail('fTime','Choose a time for your plan.');
    const dt=date&&time?validPlanDateTime(date,time):null;
    if(date&&time&&!dt)fail('fTime','Please choose a valid date and time.');
    if(dt){
      const changedTime=!existing||existing.date!==date||existing.time!==time;
      if(changedTime && dt.getTime()<=Date.now())fail('fTime','This time has already passed. Choose a future time.');
    }
    if(departure){
      const leave=validPlanDateTime(date,departure);
      if(!leave)fail('fDeparture','Choose a valid departure time.');
      else if(dt&&leave.getTime()>=dt.getTime())fail('fDeparture','You need to leave before the plan starts.');
      else if(dt&&(!existing||existing.date!==date||existing.departure!==departure)&&leave.getTime()<=Date.now())fail('fDeparture','Your leaving time has passed. Choose a later time.');
    }
    if(first){
      const alert=document.getElementById('formAlert');alert.hidden=false;alert.textContent='Please check the highlighted fields before saving.';
      first.scrollIntoView({block:'nearest',behavior:'smooth'});first.focus({preventScroll:true});return false;
    }
    return true;
  }
  function defaultFutureTime(date){
    if(date!==isoDate(new Date()))return '10:00';
    const now=new Date();const next=Math.ceil((now.getHours()*60+now.getMinutes()+1)/15)*15;
    return next<24*60?`${pad(Math.floor(next/60))}:${pad(next%60)}`:'23:59';
  }
  function openForm(id=null){
    if(cloudUser()&&!sharedSpace()){navigate('us');showToast('Sign in to your Google account first.');return;}
    editingId=id;const ev=id?events.find(x=>x.id===id):null;if(id&&!ev)return;
    eventForm.reset();resetFormErrors();formSaving=false;
    currentCategory=ev?.category||'errand';
    document.getElementById('eventDialogTitle').textContent=ev?'Edit plan':'New plan';
    const btn=document.getElementById('saveEvent');btn.disabled=false;btn.classList.remove('is-saving');btn.innerHTML=(ev?'Save changes':'Save plan')+' '+ico('arrow');
    document.getElementById('fTitle').value=ev?.title||'';
    document.getElementById('fDate').value=ev?.date||selectedDate;
    document.getElementById('fTime').value=ev?.time||defaultFutureTime(selectedDate);
    document.getElementById('fDuration').value=String(ev?.duration??60);
    document.getElementById('fDeparture').value=ev?.departure||'';
    document.getElementById('fLocation').value=ev?.location||'';
    document.getElementById('fNotes').value=ev?.notes||'';
    document.querySelectorAll('.category-opt').forEach(b=>b.classList.toggle('chosen',b.dataset.cat===currentCategory));
    document.querySelectorAll('input[name="reminder"]').forEach(el=>el.checked=ev?ev.reminders?.includes(Number(el.value)):el.value==='30');
    if(detailDialog.open)detailDialog.close();if(dayDialog.open)dayDialog.close();
    eventDialog.showModal();setTimeout(()=>document.getElementById('fTitle').focus(),70);
  }
  function openDayDialog(iso){
    const list=getDayEvents(iso);
    if(!list.length)return;
    const count=list.length;
    document.getElementById('dayDialogBody').innerHTML=`<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-head"><div><span class="eyebrow">DAY AT A GLANCE</span><h2 id="dayDialogTitle">${escapeHTML(formatDay(iso))}</h2></div><button type="button" class="icon-button" data-action="close-day" aria-label="Close date details">${ico('close')}</button></div><div class="day-dialog-content"><p class="day-dialog-summary">${count} ${count===1?'plan':'plans'} on this day</p><div class="event-stack">${list.map(eventCard).join('')}</div><button type="button" class="calendar-new-button day-add" data-action="add">${ico('plus')} Add another plan</button></div>`;
    dayDialog.showModal();
  }
  function openDetail(id){const ev=events.find(x=>x.id===id);if(!ev)return;openedId=id;const label=categoryLabels[ev.category]||'Plan';const remText=(ev.reminders||[]).map(m=>m===1440?'1 day before':m===180?'3 hours before':m===60?'1 hour before':`${m} minutes before`).join(', ');document.getElementById('detailBody').innerHTML=`<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-head"><span class="eyebrow">${escapeHTML(label.toUpperCase())}${ev.sample?' · SAMPLE':''}</span><button type="button" class="icon-button" data-action="close-detail" aria-label="Close">${ico('close')}</button></div><div class="detail-body"><div class="detail-top-icon">${categoryEmoji[ev.category]||'✿'}</div><h2 class="detail-heading" id="detailTitle">${escapeHTML(ev.title)}</h2><span class="mini-caption">${ev.completed?'Completed':'On the calendar'}</span><div class="detail-meta"><div class="detail-line">${ico('calendar')}<span>${formatDay(ev.date)} · ${formatTime(ev.time)}${ev.duration?` · ${ev.duration} min`:''}</span></div>${ev.location?`<div class="detail-line">${ico('pin')}<span>${escapeHTML(ev.location)}</span></div>`:''}${ev.departure?`<div class="detail-line">${ico('clock')}<span>Leave home at <strong>${formatTime(ev.departure)}</strong></span></div>`:''}<div class="detail-line">${ico('bell')}<span>${remText?`Preference: ${escapeHTML(remText)}`:'No reminder preferences saved'}</span></div></div>${ev.notes?`<div class="detail-note">${escapeHTML(ev.notes)}</div>`:''}<div class="detail-footer-note">${pushConfigured()?'Reminder schedule is saved. Enable phone alerts under Our space on each device.':'Reminder times are saved, but push notification delivery needs server setup.'}</div><div class="detail-actions"><button class="button button-ghost" type="button" data-action="toggle-complete">${ico('check')} ${ev.completed?'Reopen plan':'Mark done'}</button><button class="button button-primary" type="button" data-action="edit-detail">${ico('pencil')} Edit plan</button><button class="button button-ghost" type="button" data-action="copy-event">${ico('share')} Copy details</button><button class="button button-danger" type="button" data-action="delete-detail">${ico('trash')} Delete</button></div></div>`;detailDialog.showModal();}
  async function saveEvent(e){
    e.preventDefault();if(formSaving)return;
    const data=new FormData(eventForm);
    const title=String(data.get('title')||'').trim(),date=String(data.get('date')||''),time=String(data.get('time')||'');
    const departure=String(data.get('departure')||'');
    const existing=events.find(x=>x.id===editingId);
    if(!validatePlanForm(existing,title,date,time,departure))return;
    const reminders=data.getAll('reminder').map(Number).filter(x=>[1440,180,60,30].includes(x));
    const updated={id:existing?.id||cryptoId(),title,date,time,duration:Number(data.get('duration'))||0,category:currentCategory,departure,location:String(data.get('location')||'').trim().slice(0,120),notes:String(data.get('notes')||'').trim().slice(0,600),reminders,completed:existing?.completed||false,sample:false};
    const btn=document.getElementById('saveEvent');formSaving=true;btn.disabled=true;btn.classList.add('is-saving');
    btn.innerHTML='<span class="button-spinner" aria-hidden="true"></span> '+(existing?'Saving changes…':'Saving plan…');
    beginLoading();
    try{
      if(cloudUser()){if(!sharedSpace())throw new Error('Sign in first.');await backend.saveEvent(updated);}
      else {if(existing)events=events.map(x=>x.id===updated.id?updated:x);else events.push(updated);persist();}
      eventDialog.close();selectedDate=date;monthCursor=startMonth(fromISO(date));render();showToast(existing?'Plan updated.':'A new plan is on your calendar.');
    }catch(err){showToast(err?.message||'Could not save plan.');console.error(err);}finally{
      formSaving=false;finishLoading();btn.disabled=false;btn.classList.remove('is-saving');btn.innerHTML=(existing?'Save changes':'Save plan')+' '+ico('arrow');
    }
  }
  function copyEvent(){const ev=events.find(x=>x.id===openedId);if(!ev)return;const content=`${ev.title}\n${formatDay(ev.date)} at ${formatTime(ev.time)}${ev.location?'\nPlace: '+ev.location:''}${ev.departure?'\nLeave at: '+formatTime(ev.departure):''}${ev.notes?'\n'+ev.notes:''}`;const promise=navigator.clipboard?.writeText(content);if(promise)promise.then(()=>showToast('Plan copied to clipboard.')).catch(()=>showToast('Clipboard access was denied.'));else showToast('Clipboard unavailable in this browser.');}
  document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
    if(button.dataset.view){navigate(button.dataset.view);return;}
    if(button.dataset.event){if(dayDialog.open)dayDialog.close();openDetail(button.dataset.event);return;}
    if(button.dataset.day){selectedDate=button.dataset.day;if(view==='calendar')monthCursor=startMonth(fromISO(selectedDate));render();if(view==='calendar'&&getDayEvents(selectedDate).length)openDayDialog(selectedDate);return;}
    if(button.dataset.cat){currentCategory=button.dataset.cat;document.querySelectorAll('.category-opt').forEach(b=>b.classList.toggle('chosen',b.dataset.cat===currentCategory));return;}
    if(button.dataset.filter){filter=button.dataset.filter;render();return;}
    switch(button.dataset.action){
      case 'sign-in':doCloud(()=>backend.signIn());break;
      case 'sign-out':doCloud(()=>backend.signOut(),'Signed out of Hestia.');break;
      case 'notify':doCloud(()=>backend.enableNotifications(),'Phone registered for shared reminders.');break;
      case 'import-local': if(confirm('Copy all your non-sample local plans to the shared calendar?')){
        doCloud(async()=>{
          const local=load().filter(ev=>!ev.sample);
          for(const ev of local){await backend.saveEvent({...ev,id:cryptoId(),sample:false});}
          try{localStorage.setItem(DATA_KEY,JSON.stringify(load().filter(ev=>ev.sample)));}catch(_){}
        },'Your local plans were copied to the shared calendar.');
      }break;
      case 'add':openForm();break;
      case 'close-form':eventDialog.close();break;
      case 'close-detail':detailDialog.close();break;
      case 'close-day':dayDialog.close();break;
      case 'prev-week':selectedDate=moveDay(selectedDate,-7);render();break;
      case 'next-week':selectedDate=moveDay(selectedDate,7);render();break;
      case 'prev-month':monthCursor=new Date(monthCursor.getFullYear(),monthCursor.getMonth()-1,1,12);render();break;
      case 'next-month':monthCursor=new Date(monthCursor.getFullYear(),monthCursor.getMonth()+1,1,12);render();break;
      case 'go-today':selectedDate=todayISO;monthCursor=startMonth(dateNow);render();break;
      case 'edit-detail':{const id=openedId;detailDialog.close();openForm(id);break;}
      case 'toggle-complete':{const ev=events.find(x=>x.id===openedId);if(!ev)break;const next={...ev,completed:!ev.completed,sample:false};if(cloudUser()){doCloud(()=>backend.saveEvent(next),'Plan status updated.');}else{events=events.map(x=>x.id===ev.id?next:x);persist();render();showToast('Plan status updated.');}detailDialog.close();break;}
      case 'delete-detail':if(confirm('Delete this plan? This cannot be undone.')){const id=openedId;if(cloudUser())doCloud(()=>backend.removeEvent(id),'Plan removed.');else{events=events.filter(ev=>ev.id!==id);persist();render();showToast('Plan removed.');}detailDialog.close();}break;
      case 'copy-event':copyEvent();break;
      case 'clear-samples':if(confirm('Remove the sample plans? Your own plans will stay.')){events=events.filter(ev=>!ev.sample);persist();render();showToast('Sample plans removed.');}break;
      case 'sync-info':navigate('us');break;
      case 'theme':document.body.classList.toggle('night');try{localStorage.setItem(THEME_KEY,document.body.classList.contains('night')?'night':'light');}catch(err){}render();break;
      case 'install':installPWA();break;
    }
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='planSearch'){query=e.target.value;const list=document.getElementById('plansList');if(list)list.innerHTML=planResults();}
    if(eventDialog.open&&e.target.closest('#eventForm')&&['fTitle','fDate','fTime','fDeparture'].includes(e.target.id)){
      const error=document.getElementById(e.target.id+'Error');if(error)error.remove();
      e.target.removeAttribute('aria-invalid');e.target.removeAttribute('aria-describedby');
      if(!eventForm.querySelector('[aria-invalid="true"]'))document.getElementById('formAlert').hidden=true;
    }
  });
  eventForm.addEventListener('submit',saveEvent);
  document.addEventListener('hestia-push',e=>showToast(e.detail||'New Hestia reminder'));

  [eventDialog,detailDialog,dayDialog].forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
  window.addEventListener('appinstalled',()=>{installEvent=null;showToast('Hestia was installed. Welcome home!');});
  async function installPWA(){if(window.matchMedia('(display-mode:standalone)').matches){showToast('Hestia is already running as an app.');return;}if(installEvent){installEvent.prompt();await installEvent.userChoice;installEvent=null;return;}showToast('In Android Chrome: tap ⋮ → Add to Home screen → Install.');}
  if('serviceWorker' in navigator&& (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline worker unavailable:',err));
  if(backend?.subscribe)backend.subscribe(setState);else{backendState={...backendState,mode:'unavailable'};render();}
})();
