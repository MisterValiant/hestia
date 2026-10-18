/* Hestia PWA: app-shell caching + Firebase Cloud Messaging background push. */
const CACHE='hestia-shell-v7';
const ASSETS=['./','./index.html','./styles.css','./app.js','./backend.js','./firebase-settings.js','./manifest.webmanifest','./icons/hestia.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hestia-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()
])));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('./index.html')));return;
  }
  // Network-first script/style updates so installed Android apps refresh after releases.
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&request.url.startsWith(self.registration.scope)){
      const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));
    }
    return response;
  }).catch(()=>caches.match(request)));
});
// Background push notifications are not included in this frontend-only build.
