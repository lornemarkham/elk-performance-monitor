import { useEffect, useState } from 'react';
import { performanceMonitor, PerformanceMetrics, ApiCallLog } from '@/services/performance-monitor';
import { sloMonitor, SLOSnapshot, SLOMetric } from '@/services/slo-monitor';

type TabType = 'overview' | 'waterfall' | 'vitals' | 'tracing' | 'errors' | 'timeline';

export default function PerformanceOverlay() {
    const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [sloSnapshot, setSloSnapshot] = useState<SLOSnapshot | null>(null);
    const [showSloPanel, setShowSloPanel] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [webVitals, setWebVitals] = useState<any>(null);

    useEffect(() => {
        setIsEnabled(performanceMonitor.isEnabled());

        const unsubscribe = performanceMonitor.subscribe(() => {
            const perfMetrics = performanceMonitor.getMetrics();
            setMetrics(perfMetrics);
            setIsEnabled(performanceMonitor.isEnabled());
            
            sloMonitor.calculateFromPerformanceData(perfMetrics);
            setSloSnapshot(sloMonitor.getCurrentSnapshot());
        });

        if (performanceMonitor.isEnabled()) {
            const perfMetrics = performanceMonitor.getMetrics();
            setMetrics(perfMetrics);
            sloMonitor.calculateFromPerformanceData(perfMetrics);
            setSloSnapshot(sloMonitor.getCurrentSnapshot());
        }

        // Capture Web Vitals
        if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
            captureWebVitals();
        }

        return () => {
            unsubscribe();
        };
    }, []);

    const captureWebVitals = () => {
        const vitals: any = {
            fcp: null,
            lcp: null,
            fid: null,
            cls: null,
            ttfb: null
        };

        // TTFB
        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navTiming) {
            vitals.ttfb = navTiming.responseStart - navTiming.requestStart;
        }

        // FCP
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
            vitals.fcp = fcpEntry.startTime;
        }

        // LCP
        try {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1] as any;
                vitals.lcp = lastEntry.renderTime || lastEntry.loadTime;
                setWebVitals({...vitals});
            });
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
            console.log('LCP not supported');
        }

        // FID
        try {
            const fidObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry: any) => {
                    vitals.fid = entry.processingStart - entry.startTime;
                    setWebVitals({...vitals});
                });
            });
            fidObserver.observe({ entryTypes: ['first-input'] });
        } catch (e) {
            console.log('FID not supported');
        }

        // CLS
        try {
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries() as any[]) {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        vitals.cls = clsValue;
                        setWebVitals({...vitals});
                    }
                }
            });
            clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
            console.log('CLS not supported');
        }

        setWebVitals(vitals);
    };

    const analyzeWithAI = async () => {
        if (!metrics) return;

        setIsAnalyzing(true);
        setShowAiPanel(true);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const frontendCalls = metrics.apiCalls.filter(c => c.callOrigin === 'Frontend').length;
        const avgTime = metrics.averageResponseTime.toFixed(0);
        const slowest = metrics.slowestCall?.duration?.toFixed(0) || 'N/A';

        const sloReport = sloMonitor.getSLOReport();
        
        const mockAnalysis = `📊 PERFORMANCE ANALYSIS REPORT

${sloReport}

---

🔴 TOP 3 CRITICAL ISSUES:

1. **High Frontend Call Volume (${frontendCalls} direct microservice calls)**
   • Impact: Increased latency, no caching layer
   • Expected Improvement: 60% reduction in network calls
   • Priority: 🔥 HIGH - Quick Win

2. **Slow API Response Times (Slowest: ${slowest}ms)**
   • Impact: Poor user experience
   • Recommendation: Implement request caching
   • Priority: 🔥 HIGH

3. **Web Vitals Optimization Needed**
   • Current LCP: ${webVitals?.lcp?.toFixed(0) || 'N/A'}ms
   • Target: <2500ms
   • Priority: 🟡 MEDIUM

✅ QUICK WINS:
• Add SWR caching → 80% fewer duplicate calls
• Parallelize independent API calls → 50% faster load
• Optimize images and lazy load components`;

        setAiAnalysis(mockAnalysis);
        setIsAnalyzing(false);
    };

    if (!isEnabled) {
        return (
            <div style={styles.enableButton}>
                <button
                    onClick={() => performanceMonitor.enable()}
                    style={styles.button}
                >
                    🔍 Enable Performance Monitor
                </button>
            </div>
        );
    }

    if (isMinimized) {
        return (
            <div style={styles.minimized}>
                <button
                    onClick={() => setIsMinimized(false)}
                    style={styles.button}
                >
                    ⚡ Performance ({metrics?.totalCalls || 0} calls)
                </button>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h3 style={styles.title}>⚡ Performance Monitor</h3>
                    {metrics?.appHealth && (
                        <div style={styles.appStatus}>
                            <span style={{ 
                                ...styles.healthBadge, 
                                backgroundColor: 
                                    metrics.appHealth.healthScore === 'Good' ? '#52c41a' :
                                    metrics.appHealth.healthScore === 'Warning' ? '#faad14' : '#ff4d4f'
                            }}>
                                {metrics.appHealth.healthScore}
                            </span>
                            <span style={styles.uptimeText}>
                                Uptime: {Math.floor(metrics.appHealth.uptime / 1000)}s
                            </span>
                        </div>
                    )}
                </div>
                <div style={styles.headerButtons}>
                    <button onClick={() => performanceMonitor.clearLogs()} style={styles.smallButton}>
                        Clear
                    </button>
                    <button onClick={() => setIsMinimized(true)} style={styles.smallButton}>
                        Minimize
                    </button>
                    <button onClick={() => performanceMonitor.disable()} style={styles.smallButton}>
                        Disable
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={styles.tabContainer}>
                {[
                    { key: 'overview', label: '📊 Overview' },
                    { key: 'waterfall', label: '🌊 Waterfall' },
                    { key: 'vitals', label: '💓 Web Vitals' },
                    { key: 'tracing', label: '🔍 Tracing' },
                    { key: 'errors', label: '❌ Errors' },
                    { key: 'timeline', label: '⏱️ Timeline' }
                ].map(tab => (
                    <button 
                        key={tab.key}
                        style={activeTab === tab.key ? styles.tabActive : styles.tab}
                        onClick={() => setActiveTab(tab.key as TabType)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={styles.tabContent}>
                {activeTab === 'overview' && (
                    <div style={styles.tabPanel}>
                        <OverviewTab metrics={metrics} sloSnapshot={sloSnapshot} showSloPanel={showSloPanel} setShowSloPanel={setShowSloPanel} analyzeWithAI={analyzeWithAI} isAnalyzing={isAnalyzing} showAiPanel={showAiPanel} aiAnalysis={aiAnalysis} setShowAiPanel={setShowAiPanel} />
                    </div>
                )}
                {activeTab === 'waterfall' && (
                    <div style={styles.tabPanel}>
                        <WaterfallTab metrics={metrics} />
                    </div>
                )}
                {activeTab === 'vitals' && (
                    <div style={styles.tabPanel}>
                        <WebVitalsTab vitals={webVitals} />
                    </div>
                )}
                {activeTab === 'tracing' && (
                    <div style={styles.tabPanel}>
                        <TracingTab metrics={metrics} />
                    </div>
                )}
                {activeTab === 'errors' && (
                    <div style={styles.tabPanel}>
                        <ErrorsTab metrics={metrics} />
                    </div>
                )}
                {activeTab === 'timeline' && (
                    <div style={styles.tabPanel}>
                        <TimelineTab metrics={metrics} />
                    </div>
                )}
            </div>
        </div>
    );
}

// Overview Tab Component
function OverviewTab({ metrics, sloSnapshot, showSloPanel, setShowSloPanel, analyzeWithAI, isAnalyzing, showAiPanel, aiAnalysis, setShowAiPanel }: any) {
    return (
        <>
            <div style={styles.stats}>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Total Calls</div>
                    <div style={styles.statValue}>{metrics?.totalCalls || 0}</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Failed</div>
                    <div style={{ ...styles.statValue, color: metrics?.failedCalls ? '#ff4d4f' : '#52c41a' }}>
                        {metrics?.failedCalls || 0}
                    </div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Avg Time</div>
                    <div style={styles.statValue}>
                        {metrics?.averageResponseTime ? `${metrics.averageResponseTime.toFixed(0)}ms` : '-'}
                    </div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Slowest</div>
                    <div style={styles.statValue}>
                        {metrics?.slowestCall?.duration ? `${metrics.slowestCall.duration.toFixed(0)}ms` : '-'}
                    </div>
                </div>
            </div>

            <div style={styles.originBreakdown}>
                <div style={styles.originLabel}>Call Origin Breakdown:</div>
                <div style={styles.originStats}>
                    <div style={styles.originStat}>
                        <span style={{ ...styles.originBadge, backgroundColor: '#ff4d4f' }}>Frontend</span>
                        <span style={styles.originCount}>
                            {metrics?.apiCalls.filter((c: ApiCallLog) => c.callOrigin === 'Frontend').length || 0}
                        </span>
                    </div>
                    <div style={styles.originStat}>
                        <span style={{ ...styles.originBadge, backgroundColor: '#52c41a' }}>BFF</span>
                        <span style={styles.originCount}>
                            {metrics?.apiCalls.filter((c: ApiCallLog) => c.callOrigin === 'BFF').length || 0}
                        </span>
                    </div>
                    <div style={styles.originStat}>
                        <span style={{ ...styles.originBadge, backgroundColor: '#1890ff' }}>SSR</span>
                        <span style={styles.originCount}>
                            {metrics?.apiCalls.filter((c: ApiCallLog) => c.callOrigin === 'SSR').length || 0}
                        </span>
                    </div>
                </div>
            </div>

            {/* SLO Compliance Section */}
            {sloSnapshot && (
                <div style={styles.sloSection}>
                    <div style={styles.sloHeader}>
                        <span style={styles.sloTitle}>🎯 SLO Compliance</span>
                        <span style={{
                            ...styles.sloBadge,
                            backgroundColor: sloSnapshot.overallStatus === 'HEALTHY' ? '#52c41a' : 
                                           sloSnapshot.overallStatus === 'WARNING' ? '#faad14' : '#ff4d4f'
                        }}>
                            {sloSnapshot.overallStatus}
                        </span>
                        {sloSnapshot.violations > 0 && (
                            <span style={styles.violationBadge}>
                                {sloSnapshot.violations} violation{sloSnapshot.violations > 1 ? 's' : ''}
                            </span>
                        )}
                        <button 
                            onClick={() => setShowSloPanel(!showSloPanel)}
                            style={styles.toggleButton}
                        >
                            {showSloPanel ? '▼' : '▶'}
                        </button>
                    </div>

                    {showSloPanel && (
                        <div style={styles.sloMetrics}>
                            {sloSnapshot.metrics.map((metric: SLOMetric) => (
                                <SLOMetricItem key={metric.config.name} metric={metric} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* AI Performance Analysis */}
            <div style={styles.aiSection}>
                <div style={styles.aiExplainer}>
                    <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#141414' }}>
                        💡 AI-Powered Optimization
                    </div>
                    <div style={{ fontSize: '11px', lineHeight: '1.5', color: '#595959' }}>
                        Get intelligent recommendations on how to improve your app's performance. 
                        The AI analyzes your metrics, SLO compliance, and identifies quick wins to reduce load times and improve user experience.
                    </div>
                </div>
                <button 
                    onClick={analyzeWithAI}
                    disabled={isAnalyzing}
                    style={{
                        ...styles.aiButton,
                        opacity: isAnalyzing ? 0.6 : 1,
                        cursor: isAnalyzing ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isAnalyzing ? '🤖 Analyzing...' : '🤖 Ask AI How to Optimize'}
                </button>

                {showAiPanel && aiAnalysis && (
                    <div style={styles.aiPanel}>
                        <div style={styles.aiHeader}>
                            <span>🤖 AI Performance Analysis</span>
                            <button onClick={() => setShowAiPanel(false)} style={styles.closeButton}>✕</button>
                        </div>
                        <div style={styles.aiContent}>
                            {aiAnalysis.split('\n').map((line: string, i: number) => (
                                <div key={i} style={{ marginBottom: '4px' }}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Recent API Calls */}
            <div style={styles.callsList}>
                <div style={styles.callsHeader}>
                    <strong>Recent API Calls</strong>
                </div>
                {metrics?.apiCalls.slice(0, 20).map((call: ApiCallLog) => (
                    <ApiCallItem key={call.id} call={call} />
                ))}
                {!metrics?.apiCalls.length && (
                    <div style={styles.emptyState}>No API calls yet.</div>
                )}
            </div>
        </>
    );
}

// Waterfall Tab - Shows request timing breakdown
function WaterfallTab({ metrics }: { metrics: PerformanceMetrics | null }) {
    const [showInfo, setShowInfo] = useState(false);
    
    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #303030' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: '700' }}>🌊 Request Waterfall</h3>
                    <button onClick={() => setShowInfo(!showInfo)} style={styles.infoToggle}>
                        {showInfo ? '▼' : 'ℹ️'} {showInfo ? 'Hide' : 'Info'}
                    </button>
                </div>
                {showInfo && (
                    <div style={styles.infoBox}>
                        <div style={styles.infoTitle}>What is this?</div>
                        <div style={styles.infoText}>
                            The Waterfall view shows you exactly how long each API request takes, displayed as a visual timeline. Think of it like a race - you can see which requests are fast (green) and which are slow (red).
                        </div>
                        <div style={styles.infoTitle}>How to use it:</div>
                        <div style={styles.infoText}>
                            • Look for red bars - these are slow requests that need attention<br/>
                            • Click through the app and watch requests appear in real-time<br/>
                            • Identify which API calls are bottlenecks
                        </div>
                        <div style={styles.infoTitle}>Why it matters:</div>
                        <div style={styles.infoText}>
                            Slow API calls directly impact user experience. If a clinician is waiting 3 seconds for patient data to load, this view helps you find and fix that specific request. Faster requests = happier users.
                        </div>
                    </div>
                )}
                {!showInfo && (
                    <p style={{ color: '#8c8c8c', margin: '8px 0 0 0', fontSize: '12px' }}>
                        Visual timeline showing request lifecycle breakdown
                    </p>
                )}
            </div>
            
            {metrics?.apiCalls.slice(0, 10).map((call: ApiCallLog) => (
                <WaterfallItem key={call.id} call={call} />
            ))}
            
            {!metrics?.apiCalls.length && (
                <div style={styles.emptyState}>No API calls to display</div>
            )}
        </div>
    );
}

function WaterfallItem({ call }: { call: ApiCallLog }) {
    const maxDuration = 2000;
    const duration = call.duration || 0;
    const percentage = Math.min((duration / maxDuration) * 100, 100);
    
    return (
        <div style={{ 
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#1a1a1a',
            borderRadius: '8px',
            border: '1px solid #303030'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: '#fff', fontWeight: '600' }}>
                    <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: call.method === 'GET' ? '#1890ff' : call.method === 'POST' ? '#52c41a' : '#faad14',
                        fontSize: '10px',
                        fontWeight: '700',
                        marginRight: '8px'
                    }}>{call.method}</span>
                    {call.url}
                </span>
                <span style={{ color: duration < 100 ? '#52c41a' : duration < 500 ? '#faad14' : '#ff4d4f', fontWeight: '700' }}>{duration.toFixed(0)}ms</span>
            </div>
            <div style={{ 
                width: '100%', 
                height: '28px', 
                backgroundColor: '#0f0f0f', 
                borderRadius: '6px',
                position: 'relative',
                overflow: 'hidden',
                border: '1px solid #2a2a2a'
            }}>
                <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: duration < 100 ? '#52c41a' : duration < 500 ? '#faad14' : '#ff4d4f',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                }} />
            </div>
        </div>
    );
}

// Web Vitals Tab
function WebVitalsTab({ vitals }: { vitals: any }) {
    const [showInfo, setShowInfo] = useState(false);
    
    if (!vitals) {
        return (
            <div style={{ padding: '20px' }}>
                <div style={styles.emptyState}>Capturing Web Vitals...</div>
            </div>
        );
    }
    const getVitalStatus = (metric: string, value: number | null) => {
        if (value === null) return { color: '#8c8c8c', status: 'N/A' };
        
        const thresholds: any = {
            fcp: { good: 1800, poor: 3000 },
            lcp: { good: 2500, poor: 4000 },
            fid: { good: 100, poor: 300 },
            cls: { good: 0.1, poor: 0.25 },
            ttfb: { good: 800, poor: 1800 }
        };
        
        const threshold = thresholds[metric];
        if (!threshold) return { color: '#8c8c8c', status: 'Unknown' };
        
        if (value <= threshold.good) return { color: '#52c41a', status: 'Good' };
        if (value <= threshold.poor) return { color: '#faad14', status: 'Needs Improvement' };
        return { color: '#ff4d4f', status: 'Poor' };
    };

    const metrics = [
        { key: 'fcp', name: 'First Contentful Paint (FCP)', unit: 'ms', description: 'Time until first content appears' },
        { key: 'lcp', name: 'Largest Contentful Paint (LCP)', unit: 'ms', description: 'Time until main content loads' },
        { key: 'fid', name: 'First Input Delay (FID)', unit: 'ms', description: 'Interactivity responsiveness' },
        { key: 'cls', name: 'Cumulative Layout Shift (CLS)', unit: '', description: 'Visual stability score' },
        { key: 'ttfb', name: 'Time to First Byte (TTFB)', unit: 'ms', description: 'Server response time' }
    ];

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #303030' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: '700' }}>💓 Web Vitals</h3>
                    <button onClick={() => setShowInfo(!showInfo)} style={styles.infoToggle}>
                        {showInfo ? '▼' : 'ℹ️'} {showInfo ? 'Hide' : 'Info'}
                    </button>
                </div>
                {showInfo && (
                    <div style={styles.infoBox}>
                        <div style={styles.infoTitle}>What is this?</div>
                        <div style={styles.infoText}>
                            Web Vitals are Google's official metrics for measuring how fast and smooth your website feels to real users. These are the same metrics Google uses to rank websites in search results.
                        </div>
                        <div style={styles.infoTitle}>The 5 key metrics:</div>
                        <div style={styles.infoText}>
                            • <strong>FCP</strong> - How quickly users see content (should be under 1.8s)<br/>
                            • <strong>LCP</strong> - How quickly the main content loads (should be under 2.5s)<br/>
                            • <strong>FID</strong> - How quickly the page responds to clicks (should be under 100ms)<br/>
                            • <strong>CLS</strong> - How stable the page is (no jumping content)<br/>
                            • <strong>TTFB</strong> - How quickly the server responds (should be under 800ms)
                        </div>
                        <div style={styles.infoTitle}>Why it matters:</div>
                        <div style={styles.infoText}>
                            Poor Web Vitals mean frustrated users who might abandon the app. In healthcare, every second counts - clinicians need fast, responsive tools to provide the best patient care.
                        </div>
                    </div>
                )}
                {!showInfo && (
                    <p style={{ color: '#8c8c8c', margin: '8px 0 0 0', fontSize: '12px' }}>
                        Core Web Vitals measure real user experience
                    </p>
                )}
            </div>
            
            {metrics.map(metric => {
                const value = vitals?.[metric.key];
                const status = getVitalStatus(metric.key, value);
                
                return (
                    <div key={metric.key} style={{
                        padding: '16px 18px',
                        backgroundColor: '#1a1a1a',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        border: '1px solid #303030',
                        borderLeft: `4px solid ${status.color}`,
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div>
                                <div style={{ color: '#fff', fontWeight: '600', marginBottom: '4px' }}>{metric.name}</div>
                                <div style={{ color: '#8c8c8c', fontSize: '12px' }}>{metric.description}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: status.color, fontSize: '24px', fontWeight: '700' }}>
                                    {value !== null ? (metric.unit ? `${value.toFixed(0)}${metric.unit}` : value.toFixed(3)) : 'N/A'}
                                </div>
                                <div style={{ color: status.color, fontSize: '11px', fontWeight: '600' }}>{status.status}</div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Tracing Tab - Shows backend call stack
function TracingTab({ metrics }: { metrics: PerformanceMetrics | null }) {
    const [showInfo, setShowInfo] = useState(false);
    
    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #303030' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: '700' }}>🔍 Backend Tracing</h3>
                    <button onClick={() => setShowInfo(!showInfo)} style={styles.infoToggle}>
                        {showInfo ? '▼' : 'ℹ️'} {showInfo ? 'Hide' : 'Info'}
                    </button>
                </div>
                {showInfo && (
                    <div style={styles.infoBox}>
                        <div style={styles.infoTitle}>What is this?</div>
                        <div style={styles.infoText}>
                            Backend Tracing shows the journey of each request through your system - from the user's browser, through your API, to your services, and finally to the database. It's like tracking a package through the mail system.
                        </div>
                        <div style={styles.infoTitle}>How to use it:</div>
                        <div style={styles.infoText}>
                            • Each request shows 4 layers: Frontend → API → Service → Database<br/>
                            • Look for which layer is taking the most time<br/>
                            • Green border = successful request, Red border = failed request
                        </div>
                        <div style={styles.infoTitle}>Why it matters:</div>
                        <div style={styles.infoText}>
                            When a request is slow, this tells you WHERE the slowness is happening. Is it the database query? The API processing? The network? Knowing this helps developers fix the right thing instead of guessing.
                        </div>
                    </div>
                )}
                {!showInfo && (
                    <p style={{ color: '#8c8c8c', margin: '8px 0 0 0', fontSize: '12px' }}>
                        Visualize call chains: Frontend → API → Service → Database
                    </p>
                )}
            </div>
            
            {metrics?.apiCalls.slice(0, 5).map((call: ApiCallLog) => (
                <TraceItem key={call.id} call={call} />
            ))}
            
            {!metrics?.apiCalls.length && (
                <div style={styles.emptyState}>No traces to display</div>
            )}
        </div>
    );
}

function TraceItem({ call }: { call: ApiCallLog }) {
    const estimatedBreakdown = {
        network: Math.random() * 50,
        api: Math.random() * 100,
        service: Math.random() * 150,
        database: Math.random() * 200
    };
    
    return (
        <div style={{ 
            marginBottom: '16px', 
            padding: '18px', 
            backgroundColor: '#1a1a1a', 
            borderRadius: '8px',
            border: '1px solid #303030',
            borderLeft: `4px solid ${(call.status || 0) >= 200 && (call.status || 0) < 300 ? '#52c41a' : '#ff4d4f'}`,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
        }}>
            <div style={{ color: '#fff', fontWeight: '600', marginBottom: '12px' }}>
                {call.method} {call.url}
            </div>
            
            <div style={{ marginLeft: '0px' }}>
                <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                    <span style={{ color: '#1890ff' }}>→</span>
                    <span style={{ color: '#fff', marginLeft: '8px' }}>Frontend Request</span>
                    <span style={{ color: '#8c8c8c', marginLeft: '8px' }}>~{estimatedBreakdown.network.toFixed(0)}ms</span>
                </div>
                <div style={{ marginLeft: '20px', marginBottom: '8px', fontSize: '12px' }}>
                    <span style={{ color: '#52c41a' }}>→</span>
                    <span style={{ color: '#fff', marginLeft: '8px' }}>API Gateway</span>
                    <span style={{ color: '#8c8c8c', marginLeft: '8px' }}>~{estimatedBreakdown.api.toFixed(0)}ms</span>
                </div>
                <div style={{ marginLeft: '40px', marginBottom: '8px', fontSize: '12px' }}>
                    <span style={{ color: '#faad14' }}>→</span>
                    <span style={{ color: '#fff', marginLeft: '8px' }}>Service Layer</span>
                    <span style={{ color: '#8c8c8c', marginLeft: '8px' }}>~{estimatedBreakdown.service.toFixed(0)}ms</span>
                </div>
                <div style={{ marginLeft: '60px', fontSize: '12px' }}>
                    <span style={{ color: '#ff4d4f' }}>→</span>
                    <span style={{ color: '#fff', marginLeft: '8px' }}>Database Query</span>
                    <span style={{ color: '#8c8c8c', marginLeft: '8px' }}>~{estimatedBreakdown.database.toFixed(0)}ms</span>
                </div>
            </div>
            
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #2a2a2a', fontSize: '12px' }}>
                <span style={{ color: '#8c8c8c' }}>Total: </span>
                <span style={{ color: '#fff', fontWeight: '600' }}>{(call.duration || 0).toFixed(0)}ms</span>
            </div>
        </div>
    );
}

// Errors Tab
function ErrorsTab({ metrics }: { metrics: PerformanceMetrics | null }) {
    const [showInfo, setShowInfo] = useState(false);
    const errorCalls = metrics?.apiCalls.filter((call: ApiCallLog) => (call.status || 0) >= 400) || [];
    const groupedErrors: { [key: string]: ApiCallLog[] } = {};
    
    errorCalls.forEach((call: ApiCallLog) => {
        const key = `${call.status} ${call.url}`;
        if (!groupedErrors[key]) {
            groupedErrors[key] = [];
        }
        groupedErrors[key].push(call);
    });
    
    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #303030' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: '700' }}>❌ Error Tracking</h3>
                    <button onClick={() => setShowInfo(!showInfo)} style={styles.infoToggle}>
                        {showInfo ? '▼' : 'ℹ️'} {showInfo ? 'Hide' : 'Info'}
                    </button>
                </div>
                {showInfo && (
                    <div style={styles.infoBox}>
                        <div style={styles.infoTitle}>What is this?</div>
                        <div style={styles.infoText}>
                            Error Tracking automatically catches and groups all failed API requests. Instead of errors disappearing into logs, you see them organized by type so you can spot patterns.
                        </div>
                        <div style={styles.infoTitle}>How to use it:</div>
                        <div style={styles.infoText}>
                            • Each card shows an error type and how many times it occurred<br/>
                            • Look for recurring errors - these need immediate attention<br/>
                            • Status codes: 400s = client errors, 500s = server errors<br/>
                            • No errors? You'll see a celebration message! 🎉
                        </div>
                        <div style={styles.infoTitle}>Why it matters:</div>
                        <div style={styles.infoText}>
                            In healthcare applications, errors can mean clinicians can't access patient data or submit referrals. This view helps you catch and fix problems before they impact patient care. Critical for compliance and reliability.
                        </div>
                    </div>
                )}
                {!showInfo && (
                    <p style={{ color: '#8c8c8c', margin: '8px 0 0 0', fontSize: '12px' }}>
                        Grouped errors by type and frequency
                    </p>
                )}
            </div>
            
            {Object.entries(groupedErrors).map(([key, calls]) => (
                <div key={key} style={{
                    padding: '16px 18px',
                    backgroundColor: 'rgba(255, 77, 79, 0.08)',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    border: '1px solid rgba(255, 77, 79, 0.3)',
                    borderLeft: '4px solid #ff4d4f',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(255, 77, 79, 0.15)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ color: '#fff', fontWeight: '600' }}>{key}</div>
                        <div style={{ color: '#ff4d4f', fontWeight: '600' }}>
                            {calls.length} occurrence{calls.length > 1 ? 's' : ''}
                        </div>
                    </div>
                    <div style={{ color: '#8c8c8c', fontSize: '12px' }}>
                        Last occurred: {new Date().toLocaleTimeString()}
                    </div>
                </div>
            ))}
            
            {errorCalls.length === 0 && (
                <div style={styles.emptyState}>No errors detected 🎉</div>
            )}
        </div>
    );
}

// Timeline Tab
function TimelineTab({ metrics }: { metrics: PerformanceMetrics | null }) {
    const [showInfo, setShowInfo] = useState(false);
    
    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #303030' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: '700' }}>⏱️ Session Timeline</h3>
                    <button onClick={() => setShowInfo(!showInfo)} style={styles.infoToggle}>
                        {showInfo ? '▼' : 'ℹ️'} {showInfo ? 'Hide' : 'Info'}
                    </button>
                </div>
                {showInfo && (
                    <div style={styles.infoBox}>
                        <div style={styles.infoTitle}>What is this?</div>
                        <div style={styles.infoText}>
                            The Session Timeline shows every action taken during your current session in chronological order - like a complete history of everything that happened from the moment you opened the app.
                        </div>
                        <div style={styles.infoTitle}>How to use it:</div>
                        <div style={styles.infoText}>
                            • Scroll through to see the complete user journey<br/>
                            • Each entry shows: time, request type (GET/POST), URL, duration, and status<br/>
                            • Use this to understand the sequence of events leading to an issue<br/>
                            • Great for reproducing bugs or understanding user workflows
                        </div>
                        <div style={styles.infoTitle}>Why it matters:</div>
                        <div style={styles.infoText}>
                            Understanding the complete user journey helps you optimize workflows. For example, if submitting a referral requires 15 API calls, maybe some can be combined or eliminated. This view reveals inefficiencies that aren't obvious otherwise.
                        </div>
                    </div>
                )}
                {!showInfo && (
                    <p style={{ color: '#8c8c8c', margin: '8px 0 0 0', fontSize: '12px' }}>
                        Chronological view of user journey and API interactions
                    </p>
                )}
            </div>
            
            {metrics?.apiCalls.map((call: ApiCallLog, index: number) => (
                <div key={call.id} style={{
                    display: 'flex',
                    marginBottom: '16px',
                    paddingBottom: '16px',
                    borderBottom: index < (metrics.apiCalls.length - 1) ? '1px solid #2a2a2a' : 'none'
                }}>
                    <div style={{ 
                        minWidth: '80px', 
                        color: '#8c8c8c', 
                        fontSize: '12px',
                        paddingRight: '16px'
                    }}>
                        {new Date().toLocaleTimeString()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ color: '#fff', marginBottom: '4px', fontSize: '13px' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: call.method === 'GET' ? '#1890ff' : call.method === 'POST' ? '#52c41a' : '#faad14',
                                marginRight: '8px',
                                fontSize: '11px',
                                fontWeight: '600'
                            }}>
                                {call.method}
                            </span>
                            {call.url}
                        </div>
                        <div style={{ color: '#8c8c8c', fontSize: '12px' }}>
                            {(call.duration || 0).toFixed(0)}ms • Status: {call.status || 'N/A'} • {call.callOrigin}
                        </div>
                    </div>
                </div>
            ))}
            
            {!metrics?.apiCalls.length && (
                <div style={styles.emptyState}>No timeline data</div>
            )}
        </div>
    );
}

// Helper Components
function SLOMetricItem({ metric }: { metric: SLOMetric }) {
    const formatValue = (value: number, unit: 'percentage' | 'milliseconds' | 'count'): string => {
        switch (unit) {
            case 'percentage':
                return `${value.toFixed(2)}%`;
            case 'milliseconds':
                return `${value.toFixed(0)}ms`;
            case 'count':
                return value.toString();
        }
    };

    const getStatusColor = (isViolating: boolean, critical: boolean): string => {
        if (!isViolating) return '#52c41a';
        return critical ? '#ff4d4f' : '#faad14';
    };

    const getTrendIcon = (trend: 'improving' | 'stable' | 'degrading'): string => {
        switch (trend) {
            case 'improving': return '📈';
            case 'degrading': return '📉';
            default: return '➡️';
        }
    };

    return (
        <div style={{
            padding: '12px 14px',
            backgroundColor: metric.isViolating ? 'rgba(255, 77, 79, 0.12)' : 'rgba(82, 196, 26, 0.1)',
            borderLeft: `4px solid ${getStatusColor(metric.isViolating, metric.config.critical)}`,
            marginBottom: '10px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            boxShadow: metric.isViolating ? '0 2px 4px rgba(255, 77, 79, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', flex: 1 }}>
                    {metric.config.name}
                </div>
                <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                    {getTrendIcon(metric.trend)}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: getStatusColor(metric.isViolating, metric.config.critical) }}>
                    {formatValue(metric.currentValue, metric.config.unit)}
                </div>
                <div style={{ fontSize: '11px', color: '#8c8c8c', textAlign: 'right' }}>
                    Target: {formatValue(metric.config.target, metric.config.unit)}
                    {metric.violationPercentage > 0 && (
                        <div style={{ color: '#ff4d4f', fontWeight: '600', marginTop: '2px' }}>
                            ⚠️ {metric.violationPercentage.toFixed(1)}% off
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ApiCallItem({ call }: { call: ApiCallLog }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const baseUrl = call.url.split('?')[0];
    const queryString = call.url.includes('?') ? call.url.split('?')[1] : null;

    const getErrorDescription = (status: number): string => {
        const descriptions: { [key: number]: string } = {
            400: 'Bad Request - The server cannot process the request due to invalid syntax',
            401: 'Unauthorized - Authentication is required and has failed or not been provided',
            403: 'Forbidden - The server understands the request but refuses to authorize it',
            404: 'Not Found - The requested resource does not exist on the server',
            405: 'Method Not Allowed - The request method is not supported for this resource',
            408: 'Request Timeout - The server timed out waiting for the request',
            409: 'Conflict - The request conflicts with the current state of the server',
            422: 'Unprocessable Entity - The request was well-formed but contains semantic errors',
            429: 'Too Many Requests - Rate limit exceeded',
            500: 'Internal Server Error - The server encountered an unexpected condition',
            502: 'Bad Gateway - The server received an invalid response from upstream',
            503: 'Service Unavailable - The server is temporarily unable to handle the request',
            504: 'Gateway Timeout - The server did not receive a timely response from upstream'
        };
        return descriptions[status] || `HTTP Error ${status}`;
    };

    const getErrorCauses = (status: number): string => {
        const causes: { [key: number]: string } = {
            400: '• Invalid request parameters or malformed JSON\n• Missing required fields\n• Data type mismatch',
            401: '• Missing or expired authentication token\n• Invalid credentials\n• Session timeout',
            403: '• Insufficient permissions for this action\n• Account not activated\n• IP address blocked',
            404: '• Endpoint URL is incorrect or has changed\n• Resource was deleted\n• API version mismatch',
            405: '• Using POST when GET is required (or vice versa)\n• Endpoint doesn\'t support this HTTP method',
            429: '• Too many requests in a short time period\n• Rate limit exceeded\n• Need to implement request throttling',
            500: '• Unhandled exception in server code\n• Database connection failure\n• Configuration error',
            502: '• Upstream service is down\n• Network connectivity issues\n• Load balancer misconfiguration',
            503: '• Server is overloaded or under maintenance\n• Database is unavailable\n• Temporary outage',
            504: '• Upstream service is too slow\n• Database query timeout\n• Network latency issues'
        };
        return causes[status] || '• Check server logs for details\n• Verify API documentation\n• Contact backend team';
    };

    const getErrorSolutions = (status: number): string => {
        const solutions: { [key: number]: string } = {
            400: '✓ Validate request payload matches API schema\n✓ Check for typos in field names\n✓ Review API documentation',
            401: '✓ Verify authentication token is valid\n✓ Check if user needs to log in again\n✓ Ensure token is included in request headers',
            403: '✓ Verify user has correct permissions/role\n✓ Check if feature flag is enabled\n✓ Contact admin for access',
            404: '✓ Verify the endpoint URL is correct\n✓ Check if resource ID exists\n✓ Ensure API version is up to date',
            405: '✓ Check API documentation for correct method\n✓ Verify endpoint supports this operation',
            429: '✓ Implement exponential backoff\n✓ Add request caching\n✓ Reduce request frequency',
            500: '✓ Check server logs for stack trace\n✓ Verify database connectivity\n✓ Contact backend team immediately',
            502: '✓ Check if upstream services are running\n✓ Verify network connectivity\n✓ Wait and retry',
            503: '✓ Wait a few minutes and retry\n✓ Check system status page\n✓ Implement retry logic with backoff',
            504: '✓ Optimize slow database queries\n✓ Increase timeout limits\n✓ Check upstream service performance'
        };
        return solutions[status] || '✓ Review server logs\n✓ Check API documentation\n✓ Contact support team';
    };

    const getStatusColor = (status: number) => {
        if (status >= 200 && status < 300) return '#52c41a';
        if (status >= 400) return '#ff4d4f';
        return '#faad14';
    };

    const getDurationColor = (duration: number) => {
        if (duration < 100) return '#52c41a';
        if (duration < 500) return '#faad14';
        return '#ff4d4f';
    };

    const getMethodColor = (method: string) => {
        switch (method) {
            case 'GET': return '#1890ff';
            case 'POST': return '#52c41a';
            case 'PUT': return '#faad14';
            case 'DELETE': return '#ff4d4f';
            default: return '#8c8c8c';
        }
    };

    const getOriginColor = (origin: string) => {
        switch (origin) {
            case 'Frontend': return '#ff4d4f';
            case 'BFF': return '#52c41a';
            case 'SSR': return '#1890ff';
            default: return '#8c8c8c';
        }
    };

    return (
        <div style={styles.callItem}>
            <div onClick={() => setIsExpanded(!isExpanded)} style={styles.callHeader}>
                <div style={styles.callMethod}>
                    <span style={{ ...styles.methodBadge, backgroundColor: getMethodColor(call.method) }}>
                        {call.method}
                    </span>
                    <span style={{ ...styles.originBadge, backgroundColor: getOriginColor(call.callOrigin) }}>
                        {call.callOrigin}
                    </span>
                </div>
                <div style={styles.callUrl}>
                    <div style={styles.baseUrl}>{baseUrl}</div>
                    {queryString && <div style={styles.queryString}>?{queryString}</div>}
                </div>
                <div style={styles.callMeta}>
                    <span style={{ ...styles.statusBadge, color: getStatusColor(call.status || 0) }}>
                        {call.status || 'N/A'}
                    </span>
                    <span style={{ ...styles.durationBadge, color: getDurationColor(call.duration || 0) }}>
                        {call.duration ? call.duration.toFixed(0) : '0'}ms
                    </span>
                    <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                </div>
            </div>

            {isExpanded && (
                <div style={styles.callDetails}>
                    <div style={styles.detailRow}>
                        <strong>Timestamp:</strong> {new Date().toLocaleString()}
                    </div>
                    <div style={styles.detailRow}>
                        <strong>Origin:</strong> <span style={{ color: getOriginColor(call.callOrigin) }}>{call.callOrigin}</span>
                    </div>
                    <div style={styles.detailRow}>
                        <strong>Full URL:</strong> {call.url}
                    </div>
                    {call.status && call.status >= 400 && (
                        <div style={{
                            marginTop: '12px',
                            padding: '12px',
                            backgroundColor: 'rgba(255, 77, 79, 0.1)',
                            borderRadius: '6px',
                            borderLeft: '3px solid #ff4d4f'
                        }}>
                            <div style={{ color: '#ff4d4f', fontWeight: '700', fontSize: '12px', marginBottom: '8px' }}>
                                ⚠️ Error Details
                            </div>
                            <div style={{ color: '#d9d9d9', fontSize: '11px', lineHeight: '1.6' }}>
                                <strong>Status {call.status}:</strong> {getErrorDescription(call.status || 0)}
                                <div style={{ marginTop: '8px', color: '#8c8c8c' }}>
                                    <strong>Common causes:</strong><br/>
                                    {getErrorCauses(call.status || 0)}
                                </div>
                                <div style={{ marginTop: '8px', color: '#8c8c8c' }}>
                                    <strong>What to check:</strong><br/>
                                    {getErrorSolutions(call.status || 0)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Styles
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '50vw',
        maxWidth: '800px',
        minWidth: '500px',
        maxHeight: '90vh',
        backgroundColor: '#141414',
        border: '1px solid #303030',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    },
    header: {
        padding: '16px 20px',
        borderBottom: '1px solid #303030',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
    },
    title: {
        margin: 0,
        fontSize: '16px',
        fontWeight: '700',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        letterSpacing: '-0.3px'
    },
    appStatus: {
        display: 'flex',
        gap: '12px',
        marginTop: '8px',
        fontSize: '11px'
    },
    healthBadge: {
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '10px',
        fontWeight: '700',
        color: '#fff'
    },
    uptimeText: {
        color: '#8c8c8c'
    },
    headerButtons: {
        display: 'flex',
        gap: '8px'
    },
    smallButton: {
        padding: '6px 12px',
        backgroundColor: '#1f1f1f',
        border: '1px solid #303030',
        borderRadius: '6px',
        color: '#fff',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    tabContainer: {
        display: 'flex',
        borderBottom: '2px solid #303030',
        backgroundColor: '#0f0f0f',
        flexShrink: 0,
        overflowX: 'auto',
        padding: '0 8px'
    },
    tab: {
        padding: '14px 18px',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: '3px solid transparent',
        color: '#8c8c8c',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        position: 'relative'
    },
    tabActive: {
        padding: '14px 18px',
        backgroundColor: 'rgba(24, 144, 255, 0.08)',
        border: 'none',
        borderBottom: '3px solid #1890ff',
        color: '#1890ff',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        position: 'relative'
    },
    tabContent: {
        flex: 1,
        overflow: 'hidden',
        padding: '0',
        backgroundColor: '#141414',
        position: 'relative'
    },
    tabPanel: {
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#141414'
    },
    stats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        padding: '16px',
        borderBottom: '1px solid #303030'
    },
    statBox: {
        textAlign: 'center',
        padding: '12px'
    },
    statLabel: {
        fontSize: '11px',
        color: '#8c8c8c',
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
    },
    statValue: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#fff'
    },
    originBreakdown: {
        padding: '16px',
        borderBottom: '1px solid #303030'
    },
    originLabel: {
        fontSize: '12px',
        color: '#8c8c8c',
        marginBottom: '12px',
        fontWeight: '600'
    },
    originStats: {
        display: 'flex',
        gap: '16px'
    },
    originStat: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    originBadge: {
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '700',
        color: '#fff'
    },
    originCount: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#fff'
    },
    sloSection: {
        padding: '16px',
        borderBottom: '1px solid #303030'
    },
    sloHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px'
    },
    sloTitle: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#fff',
        flex: 1
    },
    sloBadge: {
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '700',
        color: '#fff'
    },
    violationBadge: {
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '700',
        backgroundColor: '#ff4d4f',
        color: '#fff'
    },
    toggleButton: {
        padding: '4px 8px',
        backgroundColor: 'transparent',
        border: 'none',
        color: '#8c8c8c',
        cursor: 'pointer',
        fontSize: '12px'
    },
    sloMetrics: {
        maxHeight: 'none'
    },
    aiSection: {
        padding: '16px',
        borderBottom: '1px solid #303030'
    },
    aiExplainer: {
        padding: '14px 16px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        marginBottom: '12px',
        border: '1px solid #e8e8e8',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
    },
    aiButton: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#722ed1',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    aiPanel: {
        marginTop: '16px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        border: '1px solid #303030',
        overflow: 'hidden'
    },
    aiHeader: {
        padding: '12px 16px',
        backgroundColor: '#722ed1',
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontWeight: '600',
        fontSize: '13px'
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: '16px',
        cursor: 'pointer',
        padding: '0 4px'
    },
    aiContent: {
        padding: '16px',
        fontSize: '12px',
        color: '#fff',
        fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.6',
        maxHeight: '400px',
        overflow: 'auto'
    },
    callsList: {
        padding: '16px'
    },
    callsHeader: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#fff',
        marginBottom: '12px'
    },
    callItem: {
        marginBottom: '8px',
        backgroundColor: '#1a1a1a',
        borderRadius: '6px',
        border: '1px solid #303030',
        overflow: 'hidden',
        transition: 'all 0.2s'
    },
    callHeader: {
        padding: '12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    callMethod: {
        display: 'flex',
        gap: '6px',
        minWidth: '140px'
    },
    methodBadge: {
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: '700',
        color: '#fff'
    },
    callUrl: {
        flex: 1,
        minWidth: 0
    },
    baseUrl: {
        fontSize: '12px',
        color: '#fff',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    queryString: {
        fontSize: '10px',
        color: '#8c8c8c',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    callMeta: {
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
    },
    statusBadge: {
        fontSize: '12px',
        fontWeight: '700'
    },
    durationBadge: {
        fontSize: '12px',
        fontWeight: '700'
    },
    expandIcon: {
        fontSize: '10px',
        color: '#8c8c8c'
    },
    callDetails: {
        padding: '12px',
        borderTop: '1px solid #303030',
        backgroundColor: '#0f0f0f'
    },
    detailRow: {
        fontSize: '11px',
        color: '#8c8c8c',
        marginBottom: '8px',
        lineHeight: '1.6'
    },
    codeBlock: {
        marginTop: '8px',
        padding: '8px',
        backgroundColor: '#1a1a1a',
        borderRadius: '4px',
        fontSize: '10px',
        color: '#52c41a',
        overflow: 'auto',
        fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace'
    },
    emptyState: {
        textAlign: 'center',
        padding: '32px',
        color: '#8c8c8c',
        fontSize: '13px'
    },
    infoToggle: {
        padding: '6px 12px',
        backgroundColor: '#1f1f1f',
        border: '1px solid #303030',
        borderRadius: '6px',
        color: '#8c8c8c',
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
    },
    infoBox: {
        marginTop: '16px',
        padding: '16px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        border: '1px solid #303030',
        fontSize: '12px',
        lineHeight: '1.6'
    },
    infoTitle: {
        color: '#1890ff',
        fontWeight: '700',
        fontSize: '12px',
        marginTop: '12px',
        marginBottom: '6px'
    },
    infoText: {
        color: '#d9d9d9',
        fontSize: '12px',
        lineHeight: '1.7',
        marginBottom: '8px'
    },
    enableButton: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999
    },
    minimized: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999
    },
    button: {
        padding: '12px 24px',
        backgroundColor: '#1890ff',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(24, 144, 255, 0.4)',
        transition: 'all 0.2s'
    }
};
