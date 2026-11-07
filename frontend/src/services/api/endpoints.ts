import { config } from '../../constants/config';
// Proposed contract. Align these paths with the backend team's OpenAPI document.
export const endpoints = { messages: '/api/v1/messages', household: '/api/v1/households/me', createHousehold: '/api/v1/households', alerts: '/api/v1/alerts', plan: '/api/v1/plans/current', history: '/api/v1/plans/history', requests: '/api/v1/assistance-requests', reports: '/api/v1/situation-reports', updates: '/api/v1/updates', changes: config.changesPath };
