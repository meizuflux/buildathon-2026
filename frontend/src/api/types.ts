import type { Haven } from './api-specs'

export type { Haven }

export type Location = { latitude: number; longitude: number }

export type User = Haven.ApiMeMe.Http200.ResponseBody
export type Session = Haven.ApiAuthLoginLogin.Http200.ResponseBody

export type Disaster = Haven.ApiDisastersListDisasters.Http200.ResponseBody['disasters'][number]

export type Family = Haven.ApiFamiliesFamilyIdGetFamily.Http200.ResponseBody
export type FamilyPage = Haven.ApiFamiliesListFamilies.Http200.ResponseBody
export type FamilyPatch = Haven.ApiFamiliesFamilyIdPatchFamily.RequestBody

export type Shelter = Haven.ApiSheltersListShelters.Http200.ResponseBody['shelters'][number]
export type ShelterInput = Haven.ApiSheltersCreateShelter.RequestBody
export type ShelterDraft = ShelterInput

export type MapLayers = {
  shelters: boolean
  families: boolean
  reports: boolean
}
export type ShelterPatch = Haven.ApiSheltersShelterIdUpdateShelter.RequestBody
export type ShelterCapabilities = Shelter['capabilities']
export type ShelterResources = Shelter['resources']
export type ShelterStatus = Shelter['status']
export type ResourceKey = keyof ShelterResources
export type ResourceAvailability = ShelterResources[ResourceKey]

export type Plan = Haven.ApiFamiliesFamilyIdPlanGetPlan.Http200.ResponseBody
export type PlanPage = Haven.ApiDisastersDisasterIdPlansListPlans.Http200.ResponseBody
export type PlanShelter = NonNullable<Plan['shelter']>
export type PlanAlert = Plan['alerts'][number]

export type Alert = Haven.ApiDisastersDisasterIdAlertsListAlerts.Http200.ResponseBody['alerts'][number]
export type AlertPage = Haven.ApiDisastersDisasterIdAlertsListAlerts.Http200.ResponseBody

export type ActivityEntry =
  Haven.ApiDisastersDisasterIdActivityListActivity.Http200.ResponseBody['activity'][number]

export type Report = Haven.ApiDisastersDisasterIdReportsListReports.Http200.ResponseBody['reports'][number]
export type ReportType = Report['type']
export type ReportStatus = Report['status']
export type ReportStatusPatch = Haven.ApiReportsReportIdUpdateReport.RequestBody

export type BroadcastTarget =
  | { type: 'all'; shelter_id?: null }
  | { type: 'shelter'; shelter_id: string }

export type Severity = 'info' | 'warning' | 'critical'

// The generated schema types `target` loosely, so the dashboard models it here.
export type Update = {
  id: string
  disaster_id: string
  title: string
  message: string
  severity: Severity
  published_at: string
  target?: BroadcastTarget | null
}

export type UpdateList = { updates: Update[] }

export type UpdateInput = {
  title: string
  message: string
  severity: Severity
  target?: BroadcastTarget | null
}

export type PreviewInput = { target: BroadcastTarget }
export type Preview = Haven.ApiDisastersDisasterIdUpdatesPreviewPreviewUpdate.Http200.ResponseBody

export type Me = Haven.ApiMeMe.Http200.ResponseBody

// ---------------------------------------------------------------------------
// Hurricane demo (docs/hurricane-demo.md)
// Hand-written to mirror the contract; not generated.
// ---------------------------------------------------------------------------

export type HurricanePhase = 'peace' | 'active'

export type HurricaneStatus = {
  disaster_id: string
  phase: HurricanePhase
  hurricane: { name: string; category: number } | null
  started_at: string | null
  updated_at: string | null
}

export type HurricaneInitiateInput = { name?: string; category?: number }

export type Requirement =
  | 'medication'
  | 'medical_staff'
  | 'wheelchair_accessible'
  | 'pets'
  | 'child_friendly'
  | 'special_care'

export type Destination = {
  shelter_id: string | null
  distance_km: number | null
  unmet: Requirement[]
}

export type EvacuationShelterMetrics = {
  shelter_id: string
  name: string
  people: number
  total_people: number
  utilization: number | null
  people_over_capacity: number
  unmet_households: number
}

export type EvacuationMetrics = {
  households: number
  people: number
  unassigned_households: number
  households_with_needs: number
  unmet_households: number
  needs: { requirement: Requirement; households: number; unmet_households: number }[]
  people_over_capacity: number
  overcrowded_shelters: number
  idle_shelters: number
  max_utilization: number | null
  min_utilization: number | null
  travel: {
    mean_km: number | null
    p95_km: number | null
    max_km: number | null
    total_km: number
    no_car_mean_km: number | null
  }
  shelters: EvacuationShelterMetrics[]
}

export type EvacuationHousehold = {
  family_id: string
  location: Location
  people: number
  has_car: boolean
  requirements: Requirement[]
  naive: Destination
  personalized: Destination
}

export type EvacuationPreview = {
  disaster_id: string
  generated_at: string
  households: EvacuationHousehold[]
  naive: EvacuationMetrics
  personalized: EvacuationMetrics
}
