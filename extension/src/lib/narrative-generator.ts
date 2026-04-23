import type { JourneyStep, JourneyMetrics } from './journey-analyzer'
import { NextJsDetector } from './nextjs-detector'

/**
 * Generates formal, business-friendly narratives for journey events
 */
export class NarrativeGenerator {
  /**
   * Generate a formal narrative for a journey step
   */
  static generateStepNarrative(step: JourneyStep): string {
    const { name, nextJsContext, requests, errors, duration } = step

    // Handle milestone-based steps
    if (step.milestones.length > 0) {
      return this.generateMilestoneNarrative(step)
    }

    // Handle interaction-based steps
    if (step.interactions.length > 0) {
      return this.generateInteractionNarrative(step)
    }

    // Handle request-based steps
    if (requests.length > 0) {
      return this.generateRequestNarrative(step)
    }

    // Handle error steps
    if (errors.length > 0) {
      return this.generateErrorNarrative(step)
    }

    return 'The system processed an operation.'
  }

  /**
   * Generate narrative for milestone events
   */
  private static generateMilestoneNarrative(step: JourneyStep): string {
    const milestone = step.milestones[0]
    const name = milestone.name
    const duration = step.duration

    switch (name) {
      case 'script_loaded':
        return 'The performance monitoring system initialized successfully.'

      case 'dom_ready':
        if (step.frameType === 'iframe') {
          return 'The embedded application content became available.'
        }
        return 'The page content became available for rendering.'

      case 'page_loaded':
        if (step.nextJsContext?.wasCached) {
          return `The system served a pre-rendered page from cache in ${this.formatDuration(duration)}.`
        }
        if (step.nextJsContext?.renderingStrategy === 'ssr') {
          return `The system rendered the page on the server in ${this.formatDuration(duration)}.`
        }
        return `The page loaded completely in ${this.formatDuration(duration)}.`

      case 'iframes_detected':
        const count = (milestone.metadata?.iframeCount as number) || 1
        return `The system detected ${count} embedded application${count > 1 ? 's' : ''} on the page.`

      case 'first_interaction':
        return 'The user performed their first interaction with the application.'

      case 'referral_started':
        return 'The user clicked "Refer Patient" to begin the implantable referral workflow.'

      default:
        return milestone.description || 'The system reached a milestone.'
    }
  }

  /**
   * Generate narrative for user interactions
   */
  private static generateInteractionNarrative(step: JourneyStep): string {
    const interaction = step.interactions[0]
    const type = interaction.interactionType
    const target = interaction.targetText || interaction.target

    switch (type) {
      case 'click':
        if (target.toLowerCase().includes('button')) {
          return `The user clicked the "${target}" button.`
        }
        return `The user clicked on ${target}.`

      case 'submit':
        return 'The user submitted the form.'

      case 'input':
        return `The user entered data into the ${target} field.`

      case 'focus':
        return `The user focused on the ${target} field.`

      case 'scroll':
        return 'The user scrolled the page.'

      default:
        return 'The user interacted with the application.'
    }
  }

  /**
   * Generate narrative for request events
   */
  private static generateRequestNarrative(step: JourneyStep): string {
    const request = step.requests[0]
    const nextJs = step.nextJsContext

    if (!nextJs) {
      return this.generateGenericRequestNarrative(request)
    }

    // API route calls
    if (nextJs.requestType === 'api-route') {
      const duration = this.formatDuration(step.duration)
      if (request.success) {
        return `The system processed the API request successfully in ${duration}.`
      }
      return `The system encountered an error processing the API request (${request.status || 'failed'}).`
    }

    // Static assets
    if (nextJs.requestType === 'static-asset') {
      if (nextJs.wasCached) {
        return 'The system loaded cached application resources.'
      }
      return 'The system loaded application resources.'
    }

    // Data fetching
    if (nextJs.requestType === 'data') {
      if (nextJs.wasCached) {
        return 'The system retrieved cached data for client-side navigation.'
      }
      return 'The system fetched data for client-side navigation.'
    }

    // Page requests
    if (nextJs.requestType === 'page') {
      if (nextJs.renderingStrategy === 'ssg' && nextJs.wasCached) {
        return 'The system served a pre-rendered page from cache.'
      }
      if (nextJs.renderingStrategy === 'ssr') {
        return 'The system rendered the page on the server.'
      }
      if (nextJs.renderingStrategy === 'isr') {
        return 'The system served a statically generated page with automatic updates.'
      }
      return 'The system loaded the page.'
    }

    return this.generateGenericRequestNarrative(request)
  }

  /**
   * Generate generic request narrative
   */
  private static generateGenericRequestNarrative(request: any): string {
    const duration = this.formatDuration(request.durationMs)

    if (request.requestKind === 'api-bff') {
      if (request.success) {
        return `The system completed an API call in ${duration}.`
      }
      return `The system encountered an error during an API call (${request.status || 'failed'}).`
    }

    if (request.success) {
      return `The system completed a network request in ${duration}.`
    }
    return `The system encountered a network error (${request.status || 'failed'}).`
  }

  /**
   * Generate narrative for error events
   */
  private static generateErrorNarrative(step: JourneyStep): string {
    const error = step.errors[0]

    if (error.type === 'runtime-error') {
      return `The system encountered a runtime error: ${error.message}`
    }

    if (error.type === 'unhandled-rejection') {
      return `The system encountered an unhandled promise rejection: ${error.message}`
    }

    return `The system encountered an error: ${error.message}`
  }

  /**
   * Generate complete journey narrative
   */
  static generateJourneyNarrative(steps: JourneyStep[], metrics: JourneyMetrics): string[] {
    const narratives: string[] = []

    // Opening statement
    if (metrics.errorCount === 0) {
      narratives.push(
        `The user journey completed successfully in ${this.formatDuration(metrics.timeToComplete)}.`,
      )
    } else {
      narratives.push(
        `The user journey completed with ${metrics.errorCount} error${metrics.errorCount > 1 ? 's' : ''} in ${this.formatDuration(metrics.timeToComplete)}.`,
      )
    }

    // Add step narratives
    steps.forEach((step, index) => {
      const stepNumber = index + 1
      const narrative = this.generateStepNarrative(step)
      const statusIcon = step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '⚠'
      narratives.push(`${statusIcon} ${narrative}`)
    })

    // Closing summary
    if (metrics.cacheHitRate > 70) {
      narratives.push(
        `The system efficiently utilized caching (${Math.round(metrics.cacheHitRate)}% cache hit rate).`,
      )
    }

    if (metrics.serverCalls > 0) {
      narratives.push(`The system made ${metrics.serverCalls} server-side call${metrics.serverCalls > 1 ? 's' : ''}.`)
    }

    return narratives
  }

  /**
   * Generate why this was fast/slow explanation
   */
  static generatePerformanceExplanation(step: JourneyStep): string {
    const { nextJsContext, duration } = step

    if (!nextJsContext) {
      if (duration < 100) {
        return 'This operation completed quickly.'
      }
      if (duration > 1000) {
        return 'This operation took longer than expected.'
      }
      return 'This operation completed in a reasonable time.'
    }

    // Fast explanations
    if (duration < 100 && nextJsContext.wasCached) {
      const cacheDesc = NextJsDetector.getCacheStatusDescription(
        nextJsContext.cacheStatus,
        nextJsContext.cacheLayer,
      )
      return `This operation was fast because it ${cacheDesc.toLowerCase()}.`
    }

    if (nextJsContext.renderingStrategy === 'ssg' && nextJsContext.wasCached) {
      return 'This page loaded quickly because it was pre-rendered at build time and served from cache.'
    }

    // Slow explanations
    if (duration > 1000) {
      if (nextJsContext.requestType === 'api-route') {
        return 'This API call was slow, likely due to database queries or external service calls.'
      }

      if (nextJsContext.renderingStrategy === 'ssr') {
        return 'This page took time to load because it was rendered on the server for each request.'
      }

      if (!nextJsContext.wasCached) {
        return 'This operation was slow because it required a fresh server request without caching.'
      }

      return 'This operation took longer than expected.'
    }

    // Normal timing
    return 'This operation completed in a reasonable time.'
  }

  /**
   * Generate optimization suggestion
   */
  static generateOptimizationSuggestion(step: JourneyStep): string | null {
    const { nextJsContext, duration } = step

    if (!nextJsContext) return null

    // Suggest caching for slow API routes
    if (nextJsContext.requestType === 'api-route' && duration > 500 && !nextJsContext.wasCached) {
      return 'Consider implementing caching for this API endpoint to improve response times.'
    }

    // Suggest SSG for slow SSR pages
    if (nextJsContext.renderingStrategy === 'ssr' && duration > 1000) {
      return 'Consider using Static Site Generation (SSG) instead of Server-Side Rendering (SSR) if this page content does not change frequently.'
    }

    // Suggest prefetching
    if (nextJsContext.requestType === 'data' && duration > 300) {
      return 'Consider prefetching this data to improve perceived performance.'
    }

    return null
  }

  /**
   * Format duration in human-readable format
   */
  private static formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`
    }
    return `${(ms / 1000).toFixed(1)}s`
  }

  /**
   * Generate session summary
   */
  static generateSessionSummary(metrics: JourneyMetrics): string {
    const health = this.getHealthDescription(metrics)
    const parts: string[] = []

    parts.push(`Session Health: ${health}`)
    parts.push(`Completion: ${metrics.stepsCompleted}/${metrics.totalSteps} steps (${Math.round(metrics.completionRate)}%)`)

    if (metrics.errorCount === 0) {
      parts.push('No errors encountered')
    } else {
      parts.push(`${metrics.errorCount} error${metrics.errorCount > 1 ? 's' : ''} encountered`)
    }

    if (metrics.cacheHitRate > 0) {
      parts.push(`Cache efficiency: ${Math.round(metrics.cacheHitRate)}%`)
    }

    return parts.join(' | ')
  }

  /**
   * Get health description
   */
  private static getHealthDescription(metrics: JourneyMetrics): string {
    const score =
      (metrics.completionRate / 100) * 40 +
      (metrics.cacheHitRate / 100) * 30 +
      (metrics.errorCount === 0 ? 1 : 0) * 30

    if (score >= 0.9) return 'Excellent ✓'
    if (score >= 0.7) return 'Good'
    if (score >= 0.5) return 'Fair'
    return 'Poor'
  }
}
