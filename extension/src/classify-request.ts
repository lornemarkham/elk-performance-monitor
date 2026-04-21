import type { RequestKind } from './core/bridge-protocol'

/**
 * Coarse request labels for the panel. Cross-origin → `external`.
 * Same-origin: API-like paths first, then static / bundler patterns → `frontend`;
 * everything else → `unknown` (not confident).
 */
export function classifyRequest(url: string): RequestKind {
  let u: URL
  try {
    u = new URL(url, window.location.href)
  } catch {
    return 'unknown'
  }
  if (u.origin !== window.location.origin) return 'external'

  const p = u.pathname.toLowerCase()

  const apiLike =
    p.startsWith('/api/') ||
    p === '/api' ||
    p.startsWith('/bff/') ||
    p === '/bff' ||
    p.includes('/graphql') ||
    p.startsWith('/rest/') ||
    p === '/rest' ||
    p.startsWith('/rpc/') ||
    p === '/rpc' ||
    p.startsWith('/v1/') ||
    p === '/v1' ||
    p.startsWith('/v2/') ||
    p === '/v2' ||
    p.startsWith('/v3/') ||
    p === '/v3'

  if (apiLike) return 'api-bff'

  const frontendLike =
    /\.(js|mjs|cjs|ts|tsx|css|map|json|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|ico|wasm)(\?|$)/i.test(
      p,
    ) ||
    p.includes('/_next/') ||
    p.includes('/static/') ||
    p.includes('/assets/') ||
    p.includes('/chunk') ||
    p.includes('/chunks/') ||
    p.includes('/dist/') ||
    p.includes('/build/') ||
    p.includes('/@vite/') ||
    p.includes('/vite/') ||
    p.includes('/node_modules/')

  if (frontendLike) return 'frontend'

  return 'unknown'
}
