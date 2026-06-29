// Incrémenter ce numéro à chaque mise à jour pour forcer le rafraîchissement
// chez les utilisateurs ayant déjà installé la PWA.
const CACHE_VERSION = "texte-vers-audio-v3";

const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./piper-tts-web.js",
  "./piper-o91UDS6e.js",
  "./voices_static-D_OtJDHM.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les requêtes vers des origines externes
  // (esm.sh, cdnjs, jsdelivr, huggingface) : Piper gère déjà son propre
  // cache via OPFS. Le service worker ne gère que le shell de l'app.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first pour le HTML et le manifeste : on tente d'aller chercher
  // une version à jour, et on retombe sur le cache si hors-ligne.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
