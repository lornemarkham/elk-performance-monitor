export interface SLOConfig {
    id: string;
    name: string;
    target: number;
    unit: 'percentage' | 'milliseconds' | 'count';
    threshold: 'below' | 'above';
    critical: boolean;
    description: string;
    category: 'frontend' | 'backend' | 'latency' | 'errors';
}

export interface SLOMetric {
    config: SLOConfig;
    currentValue: number;
    isViolating: boolean;
    violationPercentage: number;
    trend: 'improving' | 'stable' | 'degrading';
    lastViolation?: Date;
    violationCount: number;
}

export interface SLOSnapshot {
    timestamp: Date;
    metrics: SLOMetric[];
    overallHealth: 'healthy' | 'warning' | 'critical';
    violatingCount: number;
}

class SLOMonitor {
    private sloConfigs: SLOConfig[] = [
        {
            id: 'browser-success-rate',
            name: 'Browser Success Rate (FE)',
            target: 99.99,
            unit: 'percentage',
            threshold: 'above',
            critical: true,
            description: 'Ensures the user-facing application is stable and free from client-side crashes',
            category: 'frontend'
        },
        {
            id: 'service-success-rate',
            name: 'Service Success Rate (BE)',
            target: 99.99,
            unit: 'percentage',
            threshold: 'above',
            critical: true,
            description: 'Guarantees the backend infrastructure is reliably processing every referral request',
            category: 'backend'
        },
        {
            id: 'nr-error-rate',
            name: 'NR Error Rate',
            target: 1,
            unit: 'percentage',
            threshold: 'below',
            critical: true,
            description: 'Overall health ceiling; any spike above this triggers an immediate response',
            category: 'errors'
        },
        {
            id: 'latency-p99',
            name: 'Latency (P99)',
            target: 750,
            unit: 'milliseconds',
            threshold: 'below',
            critical: true,
            description: 'Speed is a core component of health; slow response times create perceived failures',
            category: 'latency'
        },
        {
            id: 'unidentified-401-rate',
            name: 'Unidentified 401 Responses Rate',
            target: 0,
            unit: 'percentage',
            threshold: 'below',
            critical: true,
            description: 'Distinguishes legitimate session timeouts from system bugs that disrupt workflow',
            category: 'errors'
        },
        {
            id: 'ci-app-load-failure',
            name: 'CI App Load Failure Rate',
            target: 1,
            unit: 'percentage',
            threshold: 'below',
            critical: true,
            description: 'Tracks failures when loading the CI referral application',
            category: 'frontend'
        },
        {
            id: 'ci-app-submission-failure',
            name: 'CI App Submission Failure Rate',
            target: 0,
            unit: 'percentage',
            threshold: 'below',
            critical: true,
            description: 'Ensures every referral submission succeeds without errors',
            category: 'backend'
        }
    ];

    private metrics: Map<string, SLOMetric> = new Map();
    private snapshots: SLOSnapshot[] = [];
    private maxSnapshots = 100;

    constructor() {
        this.initializeMetrics();
    }

    private initializeMetrics(): void {
        this.sloConfigs.forEach(config => {
            this.metrics.set(config.id, {
                config,
                currentValue: config.threshold === 'above' ? 100 : 0,
                isViolating: false,
                violationPercentage: 0,
                trend: 'stable',
                violationCount: 0
            });
        });
    }

    updateMetric(sloId: string, value: number): void {
        const metric = this.metrics.get(sloId);
        if (!metric) return;

        const previousValue = metric.currentValue;
        metric.currentValue = value;

        const isViolating = this.checkViolation(metric.config, value);
        
        if (isViolating && !metric.isViolating) {
            metric.lastViolation = new Date();
            metric.violationCount++;
        }

        metric.isViolating = isViolating;
        metric.violationPercentage = this.calculateViolationPercentage(metric.config, value);
        metric.trend = this.calculateTrend(previousValue, value, metric.config.threshold);

        this.metrics.set(sloId, metric);
        this.createSnapshot();
    }

    private checkViolation(config: SLOConfig, value: number): boolean {
        if (config.threshold === 'above') {
            return value < config.target;
        } else {
            return value > config.target;
        }
    }

    private calculateViolationPercentage(config: SLOConfig, value: number): number {
        if (config.threshold === 'above') {
            if (value >= config.target) return 0;
            return ((config.target - value) / config.target) * 100;
        } else {
            if (value <= config.target) return 0;
            return ((value - config.target) / (config.target || 1)) * 100;
        }
    }

    private calculateTrend(previous: number, current: number, threshold: 'above' | 'below'): 'improving' | 'stable' | 'degrading' {
        const diff = Math.abs(current - previous);
        if (diff < 0.01) return 'stable';

        if (threshold === 'above') {
            return current > previous ? 'improving' : 'degrading';
        } else {
            return current < previous ? 'improving' : 'degrading';
        }
    }

    private createSnapshot(): void {
        const metrics = Array.from(this.metrics.values());
        const violatingCount = metrics.filter(m => m.isViolating).length;
        const criticalViolations = metrics.filter(m => m.isViolating && m.config.critical).length;

        let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
        if (criticalViolations > 0) {
            overallHealth = 'critical';
        } else if (violatingCount > 0) {
            overallHealth = 'warning';
        }

        const snapshot: SLOSnapshot = {
            timestamp: new Date(),
            metrics,
            overallHealth,
            violatingCount
        };

        this.snapshots.push(snapshot);
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }
    }

    calculateFromPerformanceData(performanceMetrics: any): void {
        const totalCalls = performanceMetrics.totalCalls || 0;
        const failedCalls = performanceMetrics.failedCalls || 0;
        const avgResponseTime = performanceMetrics.averageResponseTime || 0;

        if (totalCalls > 0) {
            const successRate = ((totalCalls - failedCalls) / totalCalls) * 100;
            this.updateMetric('browser-success-rate', successRate);
            this.updateMetric('service-success-rate', successRate);

            const errorRate = (failedCalls / totalCalls) * 100;
            this.updateMetric('nr-error-rate', errorRate);
        }

        this.updateMetric('latency-p99', avgResponseTime);

        const unauthorizedCalls = performanceMetrics.apiCalls?.filter((call: any) => 
            call.status === 401 && !call.url.includes('/auth/')
        ).length || 0;
        
        if (totalCalls > 0) {
            const unauthorizedRate = (unauthorizedCalls / totalCalls) * 100;
            this.updateMetric('unidentified-401-rate', unauthorizedRate);
        }

        const ciLoadFailures = performanceMetrics.apiCalls?.filter((call: any) => 
            call.url.includes('/cochlear') && call.error
        ).length || 0;
        
        const ciCalls = performanceMetrics.apiCalls?.filter((call: any) => 
            call.url.includes('/cochlear')
        ).length || 0;

        if (ciCalls > 0) {
            const ciLoadFailureRate = (ciLoadFailures / ciCalls) * 100;
            this.updateMetric('ci-app-load-failure', ciLoadFailureRate);
        }

        const ciSubmissionFailures = performanceMetrics.apiCalls?.filter((call: any) => 
            call.url.includes('/cochlear') && call.method === 'POST' && call.error
        ).length || 0;
        
        const ciSubmissions = performanceMetrics.apiCalls?.filter((call: any) => 
            call.url.includes('/cochlear') && call.method === 'POST'
        ).length || 0;

        if (ciSubmissions > 0) {
            const ciSubmissionFailureRate = (ciSubmissionFailures / ciSubmissions) * 100;
            this.updateMetric('ci-app-submission-failure', ciSubmissionFailureRate);
        }
    }

    getCurrentSnapshot(): SLOSnapshot | null {
        return this.snapshots[this.snapshots.length - 1] || null;
    }

    getMetric(sloId: string): SLOMetric | undefined {
        return this.metrics.get(sloId);
    }

    getAllMetrics(): SLOMetric[] {
        return Array.from(this.metrics.values());
    }

    getViolations(): SLOMetric[] {
        return Array.from(this.metrics.values()).filter(m => m.isViolating);
    }

    getCriticalViolations(): SLOMetric[] {
        return this.getViolations().filter(m => m.config.critical);
    }

    getSLOReport(): string {
        const snapshot = this.getCurrentSnapshot();
        if (!snapshot) return 'No SLO data available';

        const violations = this.getViolations();
        const critical = this.getCriticalViolations();

        let report = `🎯 SLO COMPLIANCE REPORT\n\n`;
        report += `Overall Health: ${snapshot.overallHealth.toUpperCase()}\n`;
        report += `Violations: ${violations.length}/${this.metrics.size}\n`;
        report += `Critical Violations: ${critical.length}\n\n`;

        if (critical.length > 0) {
            report += `🔴 CRITICAL SLO VIOLATIONS:\n\n`;
            critical.forEach(metric => {
                report += `• ${metric.config.name}\n`;
                report += `  Target: ${this.formatValue(metric.config.target, metric.config.unit)}\n`;
                report += `  Current: ${this.formatValue(metric.currentValue, metric.config.unit)}\n`;
                report += `  Violation: ${metric.violationPercentage.toFixed(2)}% off target\n`;
                report += `  Trend: ${metric.trend}\n\n`;
            });
        }

        if (violations.length > critical.length) {
            report += `⚠️ OTHER VIOLATIONS:\n\n`;
            violations.filter(m => !m.config.critical).forEach(metric => {
                report += `• ${metric.config.name}: ${this.formatValue(metric.currentValue, metric.config.unit)}\n`;
            });
            report += `\n`;
        }

        report += `✅ COMPLIANT SLOs:\n\n`;
        this.getAllMetrics().filter(m => !m.isViolating).forEach(metric => {
            report += `• ${metric.config.name}: ${this.formatValue(metric.currentValue, metric.config.unit)} `;
            report += `(Target: ${this.formatValue(metric.config.target, metric.config.unit)})\n`;
        });

        return report;
    }

    private formatValue(value: number, unit: 'percentage' | 'milliseconds' | 'count'): string {
        switch (unit) {
            case 'percentage':
                return `${value.toFixed(2)}%`;
            case 'milliseconds':
                return `${value.toFixed(0)}ms`;
            case 'count':
                return value.toString();
        }
    }
}

export const sloMonitor = new SLOMonitor();
