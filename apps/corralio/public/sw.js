/* Corralio Weekend Ready service worker. No caching or private-data storage. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title === "Your weekend is ready"
    ? payload.title
    : "Your weekend is ready";
  const body = payload.body === "Open Corralio to see your family plan."
    ? payload.body
    : "Open Corralio to see your family plan.";
  let url = "/?src=weekend_ready_push";
  try {
    const candidate = new URL(payload.url, self.location.origin);
    if (candidate.origin === self.location.origin) url = `${candidate.pathname}${candidate.search}`;
  } catch {
    // Keep the fixed same-origin fallback.
  }

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/corralio-icon-192.png",
    badge: "/icons/corralio-icon-96.png",
    tag: "corralio-weekend-ready",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = typeof event.notification.data?.url === "string"
    ? event.notification.data.url
    : "/?src=weekend_ready_push";

  event.waitUntil((async () => {
    const targetUrl = new URL(target, self.location.origin);
    if (targetUrl.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl.href);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});
