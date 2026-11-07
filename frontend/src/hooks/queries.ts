import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adapter } from '../services/adapters';
import { useSyncContext } from './useSync';
import { newestPlan } from '../utils/planVersions';
import type { ResponsePlan } from '../types/models';
export function useHousehold() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['household'], queryFn: adapter.getHousehold, enabled: ready }); }
export function usePlan() { const { ready } = useSyncContext(); const client = useQueryClient(); return useQuery({ queryKey: ['plan'], queryFn: async () => newestPlan(client.getQueryData<ResponsePlan | null>(['plan']), await adapter.getCurrentPlan()), enabled: ready }); }
export function useAssistance() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['requests'], queryFn: adapter.getAssistanceRequests, enabled: ready }); }
export function useUpdates() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['updates'], queryFn: adapter.getUpdates, enabled: ready }); }
export function useAlerts() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['alerts'], queryFn: adapter.getDisasterAlerts, enabled: ready }); }
export function useReports() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['reports'], queryFn: adapter.getSituationReports, enabled: ready }); }
