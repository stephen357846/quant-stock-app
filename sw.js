// Service Worker - 量化炒股Pro v1.1
var CACHE_NAME = 'quant-stock-v1.1';
var CACHE_URLS = [
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
    './icons/icon.svg'
];

// CDN域名白名单（允许缓存的第三方资源）
var CDN_HOSTS = [
    'cdn.bootcdn.net',
    'lib.baomitu.com',
    'cdn.jsdelivr.net'
];

// 单个文件缓存（带超时，不阻塞整体）
function cacheOne(cache, url, timeout) {
    timeout = timeout || 8000;
    return new Promise(function(resolve) {
        var timer = setTimeout(function() { resolve(); }, timeout);
        fetch(url, { mode: 'no-cors' }).then(function(response) {
            clearTimeout(timer);
            if (response && response.ok !== false) {
                cache.put(url, response.clone());
            }
            resolve();
        }).catch(function() {
            clearTimeout(timer);
            resolve();
        });
    });
}

// 安装：逐个预缓存，单个失败不影响整体
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all(
                CACHE_URLS.map(function(url) {
                    return cacheOne(cache, url, 5000);
                })
            );
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

// 请求拦截：缓存优先（stale-while-revalidate）
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // API请求不缓存（实时行情数据）
    if (url.hostname.includes('eastmoney.com') || url.hostname.includes('sinajs.cn')) {
        return;
    }

    // 只处理GET请求
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) {
                // 后台更新缓存（stale-while-revalidate）
                fetch(event.request).then(function(response) {
                    if (response && response.status === 200) {
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, response.clone());
                        });
                    }
                }).catch(function() {});
                return cached;
            }

            // 网络请求
            return fetch(event.request).then(function(response) {
                if (!response || response.status !== 200) return response;

                // 缓存同源资源 + CDN资源
                var shouldCache = url.origin === self.location.origin;
                if (!shouldCache) {
                    shouldCache = CDN_HOSTS.some(function(h) {
                        return url.hostname === h;
                    });
                }

                if (shouldCache) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                // 网络失败：回退到首页
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                // 其他资源失败，返回空响应
                return new Response('', { status: 408 });
            });
        })
    );
});
