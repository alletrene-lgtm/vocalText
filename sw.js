// Incrémenter ce numéro à chaque mise à jour pour forcer le rafraîchissement
// chez les utilisateurs ayant déjà installé la PWA.
const CACHE_VERSION = "texte-vers-audio-v7";

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

// Met en cache une réponse UNIQUEMENT si c'est possible et sûr (requête GET,
// statut 200). La Cache API rejette les réponses 206 "partielles" (souvent
// utilisées par les moteurs WASM pour du chargement par blocs) et les
// méthodes autres que GET : on les ignore silencieusement plutôt que de
// laisser une erreur interne se produire pendant un téléchargement en cours.
// La mise en cache est toujours un bonus en tâche de fond, jamais une
// condition qui pourrait bloquer ou perturber la réponse réelle.
async function cachePutSafely(request, response) {
  if (request.method !== "GET" || response.status !== 200) return;
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response);
  } catch (err) {
    console.warn("Mise en cache ignorée pour", request.url, err);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Modèles de voix Hugging Face : gros fichiers déjà pris en charge et
  // persistés par l'appli elle-même via OPFS. On n'y touche pas.
  if (url.hostname === "huggingface.co") {
    return;
  }

  // Moteur ONNX Runtime + WASM du phonémiseur Piper : cache-first, avec
  // mise en cache automatique en arrière-plan. Quoi qu'il arrive, on
  // retombe toujours sur une réponse réseau normale et directe : le cache
  // ne doit jamais pouvoir gêner le chargement du moteur vocal, même en
  // cas de téléchargements multiples simultanés.
  if (RUNTIME_CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(request);
          if (cached) return cached;
          const response = await fetch(request);
          event.waitUntil(cachePutSafely(request, response.clone()));
          return response;
        } catch (err) {
          return fetch(request);
        }
      })()
    );
    return;
  }

  // Toute autre origine externe non listée ci-dessus : comportement réseau
  // normal du navigateur, sans intervention.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first pour le HTML, le manifeste et les fichiers de l'app :
  // on tente d'aller chercher une version à jour, et on retombe sur le
  // cache si hors-ligne.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        event.waitUntil(cachePutSafely(request, response.clone()));
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
