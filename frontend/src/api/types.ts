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
