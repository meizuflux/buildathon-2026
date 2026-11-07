import type { Household, HouseholdInput, ResponsePlan, DisasterAlert, AssistanceInput, AssistanceRequest, SituationReport, ReportInput, Update, Changes, MessageInput, SupportMessage } from '../../types/models';
export interface ApiAdapter {
  getMessages(): Promise<SupportMessage[]>;
  sendMessage(input: MessageInput): Promise<SupportMessage>;
  getHousehold(): Promise<Household | null>;
  createHousehold(input: HouseholdInput): Promise<Household>;
  updateHousehold(input: HouseholdInput): Promise<Household>;
  getCurrentPlan(): Promise<ResponsePlan | null>;
  getPlanHistory(): Promise<ResponsePlan[]>;
  getDisasterAlerts(): Promise<DisasterAlert[]>;
  getUpdates(): Promise<Update[]>;
  getAssistanceRequests(): Promise<AssistanceRequest[]>;
  createAssistanceRequest(input: AssistanceInput): Promise<AssistanceRequest>;
  getAssistanceRequestDetails(id: string): Promise<AssistanceRequest>;
  submitSituationReport(input: ReportInput): Promise<SituationReport>;
  getSituationReports(): Promise<SituationReport[]>;
  watchForChanges(cursor: string | undefined, signal: AbortSignal): Promise<Changes>;
}
