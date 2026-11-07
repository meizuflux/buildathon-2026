import { z } from 'zod';
import { http } from '../api/client';
import { endpoints as e } from '../api/endpoints';
import { householdSchema, planSchema, alertSchema, updateSchema, assistanceSchema, reportSchema, changeSchema } from '../../types/models';
import type { ApiAdapter } from '../api/types';
import { createMessagesApi } from '../api/messages';
import { ApiError } from '../api/http';
export const backendAdapter: ApiAdapter = {
  ...createMessagesApi(http),
  getHousehold: () => http(e.household, householdSchema.nullable()),
  createHousehold: body => http(e.createHousehold, householdSchema, { method: 'POST', body }),
  updateHousehold: body => http(e.household, householdSchema, { method: 'PUT', body }),
  getCurrentPlan: () => http(e.plan, planSchema.nullable()),
  getPlanHistory: () => http(e.history, z.array(planSchema)),
  getDisasterAlerts: () => http(e.alerts, z.array(alertSchema)),
  getUpdates: () => http(e.updates, z.array(updateSchema)),
  getAssistanceRequests: () => http(e.requests, z.array(assistanceSchema)),
  createAssistanceRequest: body => http(e.requests, assistanceSchema, { method: 'POST', body, idempotencyKey: body.idempotencyKey }),
  getAssistanceRequestDetails: id => http(`${e.requests}/${encodeURIComponent(id)}`, assistanceSchema),
  submitSituationReport: body => http(e.reports, reportSchema, { method: 'POST', body, idempotencyKey: body.idempotencyKey }),
  getSituationReports: () => http(e.reports, z.array(reportSchema)),
  watchForChanges: (cursor, signal) => {
    if (e.changes === 'disabled') return Promise.reject(new ApiError('Live updates are not supported by this backend. Use Refresh.', 501));
    return http(`${e.changes}?timeout=20${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, changeSchema, { signal, timeout: 25000 });
  },
};
