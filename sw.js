// Incrémenter ce numéro à chaque mise à jour pour forcer le rafraîchissement
// chez les utilisateurs ayant déjà installé la PWA.
const CACHE_VERSION = "texte-vers-audio-v5";

const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./piper-tts-web.js",
  "./piper-o91UDS6e.js",
  "./voices_static-D_OtJDHM.js",
  "./icon-192.png",
  "./icon-512.png",
];

// Hôtes externes dont le contenu (moteur ONNX Runtime, fichiers WASM du
// phonémiseur Piper) doit être mis en cache automatiquement dès la
// première utilisation en ligne, pour pouvoir fonctionner hors-ligne ensuite.
// On ne connaît pas à l'avance les noms exacts des fichiers (ort-web choisit
// des variantes selon le navigateur : simd, threaded, etc.), donc on les
// capture "à la volée" plutôt que de les lister un par un.
const RUNTIME_CACHEABLE_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"];

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

  // Modèles de voix Hugging Face : gros fichiers déjà pris en charge et
  // persistés par l'appli elle-même via OPFS. On ne les met pas en cache
  // ici pour éviter de les stocker en double.
  if (url.hostname === "huggingface.co") {
    return;
  }

  // Moteur ONNX Runtime + WASM du phonémiseur Piper : cache-first, avec
  // mise en cache automatique de tout fichier récupéré avec succès.
  // C'est ce qui manquait : ces ressources étaient auparavant totalement
  // ignorées par le service worker, donc jamais disponibles hors-ligne.
  if (RUNTIME_CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request, { mode: "cors" }).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
    return;
  }

  // Toute autre origine externe non listée ci-dessus : on laisse passer
  // sans intervenir (comportement réseau normal du navigateur).
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first pour le HTML, le manifeste et les fichiers de l'app :
  // on tente d'aller chercher une version à jour, et on retombe sur le
  // cache si hors-ligne.
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
