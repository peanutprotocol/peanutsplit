export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Status = 'confirmed' | 'conditional' | 'accepted risk'
export type Decision = 'unreviewed' | 'fix-now' | 'plan' | 'mockup-review' | 'accept' | 'defer' | 'disagree'

export interface FindingDecision {
    decision: Decision
    note: string
    updatedAt?: string
}

export interface PriorConflict {
    decision: string
    explanation: string
}

export interface AuditRecommendation extends FindingDecision {
    priorConflict?: PriorConflict
}

export interface Finding {
    id: string
    severity: Severity
    area: string
    title: string
    summary: string
    impact: string
    action: string
    evidence: string[]
    effort: 'S' | 'M' | 'L' | 'XL'
    horizon: 'Now' | 'Next' | 'Later'
    status?: Status
}

export const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low']

export const severityStyle: Record<Severity, string> = {
    critical: 'bg-error text-white border-error',
    high: 'bg-error-1 text-error border-error',
    medium: 'bg-primary-3 text-n-1 border-n-1',
    low: 'bg-grey-4 text-grey-1 border-grey-1',
}
