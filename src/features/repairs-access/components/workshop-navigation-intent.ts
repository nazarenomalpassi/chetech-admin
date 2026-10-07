export function getWorkshopLinkIntent(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;
  const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return null;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin && url.pathname === "/reparaciones-access" ? url : null;
}
