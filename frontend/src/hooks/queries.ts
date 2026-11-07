import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adapter } from '../services/adapters';
import { useSyncContext } from './useSync';
import { newestPlan } from '../utils/planVersions';
import { config } from '../constants/config';
import type { ResponsePlan } from '../types/models';
export function useHousehold() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['household'], queryFn: adapter.getHousehold, enabled: ready }); }
export function usePlan() { const { ready } = useSyncContext(); const client = useQueryClient(); return useQuery({ queryKey: ['plan'], queryFn: async () => config.mode !== 'api' ? null : newestPlan(client.getQueryData<ResponsePlan | null>(['plan']), await adapter.getCurrentPlan()), select: plan => config.mode === 'api' ? plan : null, enabled: ready }); }
export function useAssistance() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['requests'], queryFn: adapter.getAssistanceRequests, enabled: ready }); }
export function useUpdates() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['updates'], queryFn: () => config.mode === 'api' ? adapter.getUpdates() : Promise.resolve([]), select: items => config.mode === 'api' ? items : [], enabled: ready }); }
export function useAlerts() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['alerts'], queryFn: () => config.mode === 'api' ? adapter.getDisasterAlerts() : Promise.resolve([]), enabled: ready }); }
export function useReports() { const { ready } = useSyncContext(); return useQuery({ queryKey: ['reports'], queryFn: adapter.getSituationReports, select: items => config.mode === 'api' ? items : [], enabled: ready }); }

export function useMessages() { const { ready, online } = useSyncContext(); return useQuery({ queryKey: ['messages'], queryFn: adapter.getMessages, enabled: ready, refetchInterval: online && config.mode === 'api' ? 15000 : false, refetchIntervalInBackground: false }); }
