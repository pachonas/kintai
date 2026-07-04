// ============================================================
// ひろ農林 勤怠 - Service Worker（PWA用・最小構成）
// ============================================================
// 役割:
//   - 静的ファイル（HTML・マニフェスト・アイコン）をキャッシュして起動を速くする
//   - GAS API（script.google.com / googleusercontent.com）には一切介入しない
//     → API応答をキャッシュすると「古い打刻状態」を返す事故になるため
//
// 【重要】index.html や sw.js 自体を更新したときは、下の CACHE_NAME の
//         バージョン番号（v1 → v2 → ...）を必ず上げること。
//         activate 時に旧バージョンのキャッシュが自動削除され、全端末に更新が行き渡る。
// ============================================================

const CACHE_NAME = 'hironorin-kintai-v6';

// 事前キャッシュする静的シェル一覧
// ※ logo_full.png（原寸・アイコン生成素材）はヘッダーで使わなくなったためキャッシュしない。
//   ヘッダー表示は軽量版 logo_header.png を使う。
const SHELL = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './assets/logo_header.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './apple-touch-icon.png',
];

// ------------------------------------------------------------
// install: 静的シェルを事前キャッシュ
// ------------------------------------------------------------
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(SHELL); })
      .then(function() { return self.skipWaiting(); }) // 待機せず即座に新バージョンへ切り替える
  );
});

// ------------------------------------------------------------
// activate: 旧バージョンのキャッシュを削除
// ------------------------------------------------------------
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
        );
      })
      .then(function() { return self.clients.claim(); }) // 開いているページを即座に管理下に置く
  );
});

// ------------------------------------------------------------
// fetch: 静的ファイルのみ cache-first、APIは素通し
// ------------------------------------------------------------
self.addEventListener('fetch', function(event) {
  // (1) GET以外（打刻のPOST等）には一切触れない
  if (event.request.method !== 'GET') return;

  // (2) GAS API へのリクエストにも一切触れない（応答をキャッシュしない）
  const url = new URL(event.request.url);
  if (url.host.indexOf('script.google.com') !== -1 ||
      url.host.indexOf('googleusercontent.com') !== -1) {
    return;
  }

  // (3) 同一オリジンの静的ファイルのみ cache-first で返す
  if (url.origin !== self.location.origin) return;

  // ignoreSearch: true → URLの ?t=... / ?admin=... を無視してキャッシュ照合する。
  //   iPhoneはトークン付きURLごとホーム画面に登録される方式のため、
  //   これがないとアイコン起動時のURLが事前キャッシュに一致せず、起動が遅くなる。
  //   （API向けリクエストは上の (2) で除外済みなので、打刻APIには影響しない）
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function(cached) {
      if (cached) return cached; // キャッシュヒット → そのまま返す

      // キャッシュミス → ネットワーク取得し、成功(200)ならキャッシュに保存
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
