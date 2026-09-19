const CACHE = 'minigames-v2';
const ASSETS = ['./', './index.html', './styles/common.css', './othello/', './othello/index.html', './othello/style.css', './othello/game.js', './potion-sort/', './potion-sort/index.html', './potion-sort/style.css', './potion-sort/game.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))));
