import { precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.destination === "document",
  new NetworkFirst({ cacheName: "pages" }),
);

registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker",
  new CacheFirst({ cacheName: "static-resources" }),
);

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({ cacheName: "image-assets", matchOptions: { ignoreSearch: true } }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/conversations"),
  new NetworkFirst({ cacheName: "conversation-api-cache" }),
);

setCatchHandler(async ({ event }) => {
  if (event.request.destination === "document") {
    const cached = await caches.match("/index.html");
    return cached ?? Response.error();
  }

  return Response.error();
});
