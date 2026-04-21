import type { SloDefinition } from './types'

/**
 * Built-in Eleos referral-flow SLOs (first shipped config).
 * Custom / org-defined SLOs can be merged or swapped at runtime later.
 */
export const ELEOS_DEFAULT_SLOS: SloDefinition[] = [
  {
    id: 'eleos-browser-success-rate',
    name: 'Browser success rate',
    description:
      'Share of captured browser-side referral flow signals that completed without client failures (flows + page errors).',
    metricType: 'browser_stability_rate',
    targetSummary: '>= 99.99%',
    operator: '>=',
    threshold: 99.99,
    severityOnBreach: 'critical',
    audienceImpact: {
      developer:
        'Browser-side flow completion rate is below SLO; check iframe messaging, client errors, and hydration.',
      product:
        'Referral flow reliability is below target; clinicians may see broken or incomplete Eleos steps.',
      business:
        'Referral flow reliability is below target; this erodes trust in the integrated experience.',
    },
    scope: { app: 'eleos' },
  },
  {
    id: 'eleos-api-success-rate',
    name: 'API success rate',
    description: 'Share of completed fetch/XHR calls that succeeded (HTTP and network outcome).',
    metricType: 'success_rate',
    targetSummary: '>= 99.99%',
    operator: '>=',
    threshold: 99.99,
    severityOnBreach: 'critical',
    audienceImpact: {
      developer:
        'API success rate is below SLO; inspect status codes, timeouts, and BFF/proxy behavior.',
      product:
        'Backend calls are failing more than allowed; evaluations or saves may not complete.',
      business:
        'Backend instability directly impacts revenue-critical referral and evaluation workflows.',
    },
    scope: { app: 'eleos', service: 'api' },
  },
  {
    id: 'eleos-api-latency-p9999',
    name: 'API latency (p99.99)',
    description: 'Tail latency for API calls; target is below threshold at p99.99.',
    metricType: 'latency_percentile',
    targetSummary: 'p99.99 < 750ms',
    operator: '<',
    threshold: 750,
    percentile: 0.9999,
    severityOnBreach: 'warning',
    audienceImpact: {
      developer:
        'Tail latency exceeds SLO; profile slow endpoints, caching, and cold starts.',
      product:
        'Slow API responses may feel like failures (timeouts, double-clicks, abandoned tasks).',
      business:
        'Slow API responses may create perceived failures and reduce trust.',
    },
    scope: { app: 'eleos', service: 'api' },
  },
  {
    id: 'eleos-api-error-rate',
    name: 'API error rate',
    description: 'Percentage of API calls that failed (non-success).',
    metricType: 'error_rate',
    targetSummary: '< 0.5%',
    operator: '<',
    threshold: 0.5,
    severityOnBreach: 'critical',
    audienceImpact: {
      developer:
        'Aggregate API error rate is above SLO; correlate with routes and deploy windows.',
      product:
        'Error rate is high enough to routinely interrupt clinician workflow.',
      business:
        'Operational risk: excessive errors degrade the referral experience and support load.',
    },
    scope: { app: 'eleos', service: 'api' },
  },
  {
    id: 'eleos-401-rate',
    name: 'Unauthenticated (401) rate',
    description: '401 responses as a share of API calls.',
    metricType: 'status_code_rate',
    targetSummary: '401 rate < 0.5%',
    operator: '<',
    threshold: 0.5,
    statusCode: 401,
    severityOnBreach: 'critical',
    audienceImpact: {
      developer:
        '401 rate is above SLO; validate tokens, cookie domains, refresh, and iframe auth handoff.',
      product:
        'Authentication failures may interrupt clinician workflow.',
      business:
        'Auth failures frustrate users and increase abandonment of the referral flow.',
    },
    scope: { app: 'eleos', service: 'api' },
  },
]
