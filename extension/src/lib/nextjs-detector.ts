import type { RequestPayload } from '../core/bridge-protocol'

export type NextJsRenderingStrategy = 'ssg' | 'ssr' | 'isr' | 'csr' | 'unknown'
export type NextJsCacheStatus = 'HIT' | 'MISS' | 'STALE' | 'BYPASS' | 'UNKNOWN'
export type NextJsCacheLayer = 'cdn' | 'full-route' | 'data' | 'router' | 'none'
export type NextJsRequestType = 'page' | 'data' | 'api-route' | 'static-asset' | 'rsc' | 'prefetch' | 'unknown'
export type NavigationType = 'hard' | 'soft' | 'prefetch' | 'back-forward' | 'unknown'

export type NextJsContext = {
  renderingStrategy: NextJsRenderingStrategy
  cacheStatus: NextJsCacheStatus
  cacheLayer: NextJsCacheLayer
  requestType: NextJsRequestType
  navigationType: NavigationType
  ttfb?: number
  wasCached: boolean
  wasServerRendered: boolean
  buildId?: string
  isNextJsApp: boolean
}

/**
 * Detects Next.js patterns from request/response data.
 * Analyzes URLs, headers, timing to determine rendering strategy and caching.
 */
export class NextJsDetector {
  /**
   * Analyze a request to detect Next.js patterns
   */
  static analyzeRequest(request: RequestPayload): NextJsContext {
    const url = request.url
    const duration = request.durationMs
    const status = request.status

    // Default context
    const context: NextJsContext = {
      renderingStrategy: 'unknown',
      cacheStatus: 'UNKNOWN',
      cacheLayer: 'none',
      requestType: 'unknown',
      navigationType: 'unknown',
      wasCached: false,
      wasServerRendered: false,
      isNextJsApp: false,
    }

    // Detect if this is a Next.js app
    context.isNextJsApp = this.isNextJsRequest(url)

    if (!context.isNextJsApp) {
      return context
    }

    // Detect request type
    context.requestType = this.detectRequestType(url)

    // Detect navigation type
    context.navigationType = this.detectNavigationType(url, duration)

    // Detect caching
    const cacheInfo = this.detectCaching(url, duration, status)
    context.cacheStatus = cacheInfo.status
    context.cacheLayer = cacheInfo.layer
    context.wasCached = cacheInfo.wasCached

    // Detect rendering strategy
    context.renderingStrategy = this.detectRenderingStrategy(
      url,
      duration,
      context.cacheStatus,
      context.requestType,
    )

    // Determine if server-rendered
    context.wasServerRendered = this.wasServerRendered(context.renderingStrategy, context.requestType)

    // Calculate TTFB (approximate from duration)
    context.ttfb = duration

    // Extract build ID if present
    context.buildId = this.extractBuildId(url)

    return context
  }

  /**
   * Check if URL indicates a Next.js application
   */
  private static isNextJsRequest(url: string): boolean {
    try {
      const urlObj = new URL(url)
      const path = urlObj.pathname

      // Next.js specific paths
      if (path.startsWith('/_next/')) return true
      if (path.startsWith('/api/')) return true

      // Check for Next.js data fetching patterns
      if (path.includes('/_next/data/')) return true

      return false
    } catch {
      return false
    }
  }

  /**
   * Detect the type of Next.js request
   */
  private static detectRequestType(url: string): NextJsRequestType {
    try {
      const urlObj = new URL(url)
      const path = urlObj.pathname

      // Static assets
      if (path.startsWith('/_next/static/')) return 'static-asset'

      // Client-side navigation data
      if (path.includes('/_next/data/')) return 'data'

      // API routes
      if (path.startsWith('/api/')) return 'api-route'

      // RSC (React Server Components)
      if (path.includes('.rsc')) return 'rsc'

      // Prefetch requests
      if (urlObj.searchParams.has('_rsc')) return 'prefetch'

      // Regular page request
      return 'page'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Detect navigation type based on URL and timing
   */
  private static detectNavigationType(url: string, duration: number): NavigationType {
    try {
      const urlObj = new URL(url)

      // Prefetch requests
      if (urlObj.searchParams.has('_rsc') || urlObj.pathname.includes('/_next/data/')) {
        return 'prefetch'
      }

      // Very fast responses likely from cache (back/forward)
      if (duration < 10) {
        return 'back-forward'
      }

      // Client-side navigation (data fetch)
      if (urlObj.pathname.includes('/_next/data/')) {
        return 'soft'
      }

      // Default to hard navigation
      return 'hard'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Detect caching based on URL patterns and timing
   */
  private static detectCaching(
    url: string,
    duration: number,
    status: number | null,
  ): { status: NextJsCacheStatus; layer: NextJsCacheLayer; wasCached: boolean } {
    try {
      const urlObj = new URL(url)
      const path = urlObj.pathname

      // 304 Not Modified = cache hit
      if (status === 304) {
        return { status: 'HIT', layer: 'cdn', wasCached: true }
      }

      // Static assets are always cached
      if (path.startsWith('/_next/static/')) {
        return { status: 'HIT', layer: 'cdn', wasCached: true }
      }

      // Very fast responses (< 50ms) likely cached
      if (duration < 50) {
        return { status: 'HIT', layer: 'full-route', wasCached: true }
      }

      // API routes typically not cached (unless explicitly configured)
      if (path.startsWith('/api/')) {
        return { status: 'BYPASS', layer: 'none', wasCached: false }
      }

      // Data fetching (50-200ms) might be cached or ISR
      if (duration < 200 && path.includes('/_next/data/')) {
        return { status: 'HIT', layer: 'data', wasCached: true }
      }

      // Slower responses likely cache miss
      if (duration > 200) {
        return { status: 'MISS', layer: 'none', wasCached: false }
      }

      return { status: 'UNKNOWN', layer: 'none', wasCached: false }
    } catch {
      return { status: 'UNKNOWN', layer: 'none', wasCached: false }
    }
  }

  /**
   * Detect rendering strategy based on timing and request type
   */
  private static detectRenderingStrategy(
    url: string,
    duration: number,
    cacheStatus: NextJsCacheStatus,
    requestType: NextJsRequestType,
  ): NextJsRenderingStrategy {
    // Static assets are always SSG
    if (requestType === 'static-asset') {
      return 'ssg'
    }

    // API routes are server-side
    if (requestType === 'api-route') {
      return 'ssr'
    }

    // Cached pages are likely SSG or ISR
    if (cacheStatus === 'HIT' && duration < 100) {
      return 'ssg'
    }

    // Stale responses indicate ISR
    if (cacheStatus === 'STALE') {
      return 'isr'
    }

    // Slow responses (> 200ms) likely SSR
    if (duration > 200 && requestType === 'page') {
      return 'ssr'
    }

    // Client-side data fetching
    if (requestType === 'data' || requestType === 'prefetch') {
      return 'csr'
    }

    return 'unknown'
  }

  /**
   * Determine if request was server-rendered
   */
  private static wasServerRendered(
    strategy: NextJsRenderingStrategy,
    requestType: NextJsRequestType,
  ): boolean {
    if (strategy === 'ssr') return true
    if (strategy === 'ssg') return true // Pre-rendered on server at build time
    if (strategy === 'isr') return true
    if (requestType === 'api-route') return true
    return false
  }

  /**
   * Extract Next.js build ID from URL
   */
  private static extractBuildId(url: string): string | undefined {
    try {
      const urlObj = new URL(url)
      const path = urlObj.pathname

      // Build ID is in /_next/data/[buildId]/...
      const match = path.match(/\/_next\/data\/([^/]+)\//)
      if (match) {
        return match[1]
      }

      // Build ID in static assets /_next/static/[buildId]/...
      const staticMatch = path.match(/\/_next\/static\/([^/]+)\//)
      if (staticMatch) {
        return staticMatch[1]
      }

      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Get human-readable description of rendering strategy
   */
  static getRenderingStrategyDescription(strategy: NextJsRenderingStrategy): string {
    switch (strategy) {
      case 'ssg':
        return 'Static Site Generation (pre-rendered at build time)'
      case 'ssr':
        return 'Server-Side Rendering (rendered on each request)'
      case 'isr':
        return 'Incremental Static Regeneration (static with revalidation)'
      case 'csr':
        return 'Client-Side Rendering (rendered in browser)'
      default:
        return 'Unknown rendering strategy'
    }
  }

  /**
   * Get human-readable description of cache status
   */
  static getCacheStatusDescription(status: NextJsCacheStatus, layer: NextJsCacheLayer): string {
    if (status === 'HIT') {
      switch (layer) {
        case 'cdn':
          return 'Served from CDN cache (very fast)'
        case 'full-route':
          return 'Served from Next.js route cache'
        case 'data':
          return 'Served from Next.js data cache'
        case 'router':
          return 'Served from client-side router cache'
        default:
          return 'Served from cache'
      }
    }
    if (status === 'MISS') {
      return 'Not cached (fresh server request)'
    }
    if (status === 'STALE') {
      return 'Served stale content while revalidating'
    }
    if (status === 'BYPASS') {
      return 'Cache bypassed (dynamic content)'
    }
    return 'Cache status unknown'
  }
}
