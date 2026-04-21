// Performance monitoring service for tracking API calls and app performance
// DEV ONLY - for analyzing and optimizing the CI Referral app

export interface ApiCallLog {
    id: string;
    url: string;
    method: string;
    status?: number;
    duration?: number;
    startTime: number;
    endTime?: number;
    source: 'axios' | 'swr' | 'fetch';
    error?: string;
    size?: number;
    callOrigin: 'Frontend' | 'BFF' | 'SSR' | 'Unknown';
    apiType: 'REST' | 'GraphQL' | 'External';
}

export interface AppHealth {
    initTime: number;
    uptime: number;
    potentialFlakes: string[];
    healthScore: 'Good' | 'Warning' | 'Critical';
}

export interface PerformanceMetrics {
    apiCalls: ApiCallLog[];
    totalCalls: number;
    failedCalls: number;
    averageResponseTime: number;
    slowestCall?: ApiCallLog;
    fastestCall?: ApiCallLog;
    appHealth: AppHealth;
}

class PerformanceMonitor {
    private apiCalls: Map<string, ApiCallLog> = new Map();
    private listeners: Set<() => void> = new Set();
    private enabled: boolean = false;
    private initTime: number;

    constructor() {
        this.initTime = Date.now();
        if (typeof window !== 'undefined') {
            this.enabled = localStorage.getItem('PERF_MONITOR_ENABLED') === 'true';
            console.log(`[Performance Monitor] Initialized at ${new Date(this.initTime).toLocaleTimeString()}`);
        }
    }

    private detectCallOrigin(url: string): 'Frontend' | 'BFF' | 'SSR' | 'Unknown' {
        // BFF pattern: calls to /api/ or /bff/ endpoints
        if (url.includes('/api/') || url.includes('/bff/')) {
            return 'BFF';
        }

        // Direct microservice calls (Frontend)
        if (url.includes('service.') && (
            url.includes('/ldg') || 
            url.includes('/ci-refer') || 
            url.includes('/auth') ||
            url.includes('/vault') ||
            url.includes('/pdfkit')
        )) {
            return 'Frontend';
        }

        // Next.js API routes (could be SSR or BFF)
        if (url.includes('/_next/') || url.startsWith('/api/')) {
            return 'SSR';
        }

        // External APIs
        if (!url.includes('sycle.net') && !url.includes('localhost')) {
            return 'Frontend';
        }

        return 'Unknown';
    }

    private detectApiType(url: string): 'REST' | 'GraphQL' | 'External' {
        if (url.includes('/graphql')) {
            return 'GraphQL';
        }
        if (!url.includes('sycle.net') && !url.includes('localhost')) {
            return 'External';
        }
        return 'REST';
    }

    private detectFlakes(): string[] {
        const flakes: string[] = [];
        const calls = Array.from(this.apiCalls.values());
        const completedCalls = calls.filter(c => c.duration !== undefined);
        const failedCalls = calls.filter(c => !c.ok || c.error);

        // High failure rate
        if (calls.length > 5 && failedCalls.length / calls.length > 0.3) {
            flakes.push(`High failure rate: ${((failedCalls.length / calls.length) * 100).toFixed(0)}% of calls failing`);
        }

        // Slow calls (>3s could cause timeouts)
        const slowCalls = completedCalls.filter(c => c.duration && c.duration > 3000);
        if (slowCalls.length > 0) {
            flakes.push(`${slowCalls.length} call(s) >3s (timeout risk)`);
        }

        // Multiple consecutive failures
        const recentCalls = calls.slice(-5);
        const recentFailures = recentCalls.filter(c => !c.ok || c.error);
        if (recentFailures.length >= 3) {
            flakes.push(`${recentFailures.length} consecutive failures detected`);
        }

        // Network errors
        const networkErrors = calls.filter(c => c.error && (
            c.error.includes('Network') || 
            c.error.includes('timeout') ||
            c.error.includes('ECONNREFUSED')
        ));
        if (networkErrors.length > 0) {
            flakes.push(`${networkErrors.length} network error(s) detected`);
        }

        // Too many calls (potential infinite loop)
        if (calls.length > 50) {
            flakes.push(`High call volume: ${calls.length} calls (potential loop?)`);
        }

        // Duplicate calls to same endpoint
        const urlCounts = new Map<string, number>();
        calls.forEach(call => {
            const baseUrl = call.url.split('?')[0];
            urlCounts.set(baseUrl, (urlCounts.get(baseUrl) || 0) + 1);
        });
        const duplicates = Array.from(urlCounts.entries()).filter(([_, count]) => count > 5);
        if (duplicates.length > 0) {
            duplicates.forEach(([url, count]) => {
                flakes.push(`${url.split('/').pop()} called ${count} times (caching issue?)`);
            });
        }

        return flakes;
    }

    private calculateHealthScore(): 'Good' | 'Warning' | 'Critical' {
        const flakes = this.detectFlakes();
        const calls = Array.from(this.apiCalls.values());
        const failedCalls = calls.filter(c => !c.ok || c.error);
        const failureRate = calls.length > 0 ? failedCalls.length / calls.length : 0;

        if (flakes.length >= 3 || failureRate > 0.5) {
            return 'Critical';
        }
        if (flakes.length > 0 || failureRate > 0.2) {
            return 'Warning';
        }
        return 'Good';
    }

    enable() {
        this.enabled = true;
        if (typeof window !== 'undefined') {
            localStorage.setItem('PERF_MONITOR_ENABLED', 'true');
        }
        this.notifyListeners();
    }

    disable() {
        this.enabled = false;
        if (typeof window !== 'undefined') {
            localStorage.removeItem('PERF_MONITOR_ENABLED');
        }
        this.notifyListeners();
    }

    isEnabled() {
        return this.enabled;
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    startApiCall(url: string, method: string, source: 'axios' | 'swr' | 'fetch' = 'axios'): string {
        if (!this.enabled) return '';

        const id = `${Date.now()}-${Math.random()}`;
        const call: ApiCallLog = {
            id,
            url,
            method: method.toUpperCase(),
            startTime: performance.now(),
            source,
            callOrigin: this.detectCallOrigin(url),
            apiType: this.detectApiType(url),
        };

        this.apiCalls.set(id, call);
        this.notifyListeners();
        return id;
    }

    endApiCall(id: string, status?: number, error?: string, size?: number) {
        if (!this.enabled || !id) return;

        const call = this.apiCalls.get(id);
        if (call) {
            call.endTime = performance.now();
            call.duration = call.endTime - call.startTime;
            call.status = status;
            call.error = error;
            call.size = size;
            this.apiCalls.set(id, call);
            this.notifyListeners();
        }
    }

    getMetrics(): PerformanceMetrics {
        const calls = Array.from(this.apiCalls.values());
        const completedCalls = calls.filter(c => c.duration !== undefined);
        const failedCalls = calls.filter(c => c.error || (c.status && c.status >= 400));

        const durations = completedCalls.map(c => c.duration!).filter(d => d > 0);
        const averageResponseTime = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

        const slowestCall = completedCalls.reduce((slowest, call) => {
            if (!slowest || (call.duration && call.duration > (slowest.duration || 0))) {
                return call;
            }
            return slowest;
        }, completedCalls[0]);

        const fastestCall = completedCalls.reduce((fastest, call) => {
            if (!fastest || (call.duration && call.duration < (fastest.duration || Infinity))) {
                return call;
            }
            return fastest;
        }, completedCalls[0]);

        const uptime = Date.now() - this.initTime;
        const potentialFlakes = this.detectFlakes();
        const healthScore = this.calculateHealthScore();

        return {
            apiCalls: calls.sort((a, b) => b.startTime - a.startTime),
            totalCalls: calls.length,
            failedCalls: failedCalls.length,
            averageResponseTime,
            slowestCall,
            fastestCall,
            appHealth: {
                initTime: this.initTime,
                uptime,
                potentialFlakes,
                healthScore,
            },
        };
    }

    clearLogs() {
        this.apiCalls.clear();
        this.notifyListeners();
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener());
    }

    logComponentRender(componentName: string, duration: number) {
        if (!this.enabled) return;
        console.log(`[PERF] ${componentName} rendered in ${duration.toFixed(2)}ms`);
    }
}

export const performanceMonitor = new PerformanceMonitor();

// Global access for debugging
if (typeof window !== 'undefined') {
    (window as any).perfMonitor = performanceMonitor;
}
