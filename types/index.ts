export type Role = 'admin' | 'area_lead' | 'team_member'

export interface Area {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  area_id: string | null
  created_at: string
  area?: Area
}

export interface CompanyObjective {
  id: string
  title: string
  quarter: number
  year: number
  created_by: string | null
  created_at: string
  key_results?: CompanyKeyResult[]
}

export interface CompanyKeyResult {
  id: string
  objective_id: string
  description: string
  target_value: number
  current_value: number
  unit: string | null
  owner_id: string | null
  created_at: string
  updates?: CompanyKRUpdate[]
  owner?: Profile
}

export interface AreaObjective {
  id: string
  area_id: string
  title: string
  quarter: number
  year: number
  aligned_to: string | null
  created_by: string | null
  created_at: string
  key_results?: AreaKeyResult[]
  aligned_objective?: CompanyObjective
  area?: Area
}

export interface AreaKeyResult {
  id: string
  objective_id: string
  description: string
  target_value: number
  current_value: number
  unit: string | null
  owner_id: string | null
  created_at: string
  updates?: AreaKRUpdate[]
  owner?: Profile
}

export interface AreaKRUpdate {
  id: string
  key_result_id: string
  update_text: string
  confidence_score: number
  current_value: number
  created_by: string | null
  week_date: string
  created_at: string
  author?: Profile
}

export interface CompanyKRUpdate {
  id: string
  key_result_id: string
  update_text: string
  confidence_score: number
  current_value: number
  created_by: string | null
  week_date: string
  created_at: string
  author?: Profile
}

export type HealthStatus = 'green' | 'yellow' | 'red' | 'none'

export function getHealthStatus(avgConfidence: number | null): HealthStatus {
  if (avgConfidence === null) return 'none'
  if (avgConfidence >= 4) return 'green'
  if (avgConfidence >= 3) return 'yellow'
  return 'red'
}

export function calcProgress(current: number, target: number): number {
  if (target === 0) return 0
  return Math.min(Math.round((current / target) * 100), 100)
}

export function getCurrentQuarter(): { quarter: number; year: number } {
  const now = new Date()
  const month = now.getMonth() + 1
  const quarter = Math.ceil(month / 3)
  return { quarter, year: now.getFullYear() }
}

export function quarterLabel(quarter: number, year: number): string {
  return `Q${quarter} ${year}`
}
