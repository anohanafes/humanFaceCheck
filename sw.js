// Service Worker - 缓存模型文件
const CACHE_NAME = 'face-models-v1';
const MODEL_FILES = [
    './faceModels/face_landmark_68_model-shard1',
    './faceModels/face_landmark_68_model-weights_manifest.json',
    './faceModels/face_landmark_68_tiny_model-shard1',
    './faceModels/face_landmark_68_tiny_model-weights_manifest.json',
    './faceModels/face_recognition_model-shard1',
    './faceModels/face_recognition_model-shard2',
    './faceModels/face_recognition_model-weights_manifest.json',
    './faceModels/tiny_face_detector_model-shard1',
    './faceModels/tiny_face_detector_model-weights_manifest.json',
    './faceTools/face-api.js',
    './faceTools/tf.min.js'
];

// 安装时预缓存模型文件
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] 预缓存模型文件...');
            return cache.addAll(MODEL_FILES);
        }).then(() => {
            console.log('[SW] 模型文件缓存完成');
            return self.skipWaiting();
        })
    );
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截请求，优先从缓存读取
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    
    // 只缓存模型相关文件
    if (url.includes('faceModels/') || url.includes('faceTools/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('[SW] 从缓存加载:', url);
                    return cachedResponse;
                }
                
                // 缓存未命中，从网络获取并缓存
                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                });
            })
        );
    }
});
