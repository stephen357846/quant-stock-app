// Service Worker - 量化炒股Pro
const CACHE_NAME = 'quant-stock-v1.0';
const CACHE_URLS = [
    './',
    './index.html',
    './css/style.css',
    './js/api.js',
    './js/indicators.js',
    './js/strategies.js',
    './js/backtest.js',
    './js/charts.js',
    './js/portfolio.js',
    './js/app.js',
    './manifest.json',
    './icons/icon.svg',
    'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js'
];

// 安装：预缓存核心资源
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(CACHE_URLS).catch(function(err) {
                console.log('Cache addAll error:', err);
            });
        })
    );
    self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        })
    );
    self.clients.claim();
});

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // API请求不走缓存
    if (url.hostname.includes('eastmoney.com') || url.hostname.includes('sinajs.cn')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) {
                // 同时更新缓存
                fetch(event.request).then(function(response) {
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, response.clone());
                    });
                }).catch(function() {});
                return cached;
            }
            return fetch(event.request).then(function(response) {
                if (response && response.status === 200 && event.request.method === 'GET') {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match('./index.html');
            });
        })
    );
});
