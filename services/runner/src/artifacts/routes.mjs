// D05's frozen createWebHistory routes. Never use a catch-all SPA fallback.
export const DOCUMENT_ROUTES = Object.freeze(['/', '/tasks', '/catalog'])
export const isDocumentRoute = (pathname) => DOCUMENT_ROUTES.includes(pathname)

export function artifactFile(pathname, mainDocument) {
  if (isDocumentRoute(pathname)) return mainDocument ? 'index.html' : null
  return pathname.slice(1)
}
