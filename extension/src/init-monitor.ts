import { setupErrorInstrumentation } from './setup-errors'
import { setupNetworkInstrumentation } from './setup-network'

export type MonitorConfig = {
  mode: 'embedded' | 'extension' | 'hybrid'
  appName: string
  environment?: 'local' | 'dev' | 'staging' | 'prod'
  features?: {
    network?: boolean
    errors?: boolean
    slo?: boolean
    dom?: boolean
  }
  debug?: boolean
}

export function initMonitor(config: MonitorConfig) {
  if (config.debug) {
    console.log('[ELK Monitor] init', config)
  }

  if (config.features?.network) {
    setupNetworkInstrumentation(config.debug)
  }

  if (config.features?.errors) {
    setupErrorInstrumentation(config.debug)
  }
}
