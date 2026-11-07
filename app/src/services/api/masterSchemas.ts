import { z } from 'zod';
export const userSchema = z.object({ id: z.string(), role: z.enum(['family', 'operator']), family_id: z.string().nullable() });
export const loginSchema = z.object({ access_token: z.string(), expires_at: z.string(), user: userSchema });
export const pointSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export const disasterSchema = z.object({ id: z.string(), type: z.string(), name: z.string(), status: z.string(), affected_area: z.string(), updated_at: z.string() });
export const familySchema = z.object({
  id: z.string(), disaster_id: z.string(), adults: z.number().int().nonnegative(), children: z.number().int().nonnegative(), location: pointSchema,
  needs: z.object({ pets: z.boolean(), immediate_medication: z.boolean(), medical_notes: z.string().nullable(), accessibility_notes: z.string().nullable(), other_special_care: z.string().nullable() }),
  resources: z.object({ has_car: z.boolean() }), created_at: z.string(), updated_at: z.string(),
});
const shelterSchema = z.object({ id: z.string(), name: z.string(), address: z.string(), location: pointSchema, status: z.enum(['open', 'closed', 'full']), capabilities: z.object({ pets_allowed: z.boolean(), child_friendly: z.boolean(), wheelchair_accessible: z.boolean(), medical_staff: z.array(z.string()), special_care_notes: z.string().nullable() }), resources: z.record(z.string(), z.string()) });
export const masterPlanSchema = z.object({ family_id: z.string(), disaster_id: z.string(), status: z.enum(['recommended', 'no_match']), shelter: shelterSchema.nullable(), reason: z.string(), instructions: z.array(z.string()), alerts: z.array(z.object({ code: z.string(), severity: z.enum(['warning', 'critical']), message: z.string() })), capacity_reserved: z.boolean(), version: z.number().int().positive(), updated_at: z.string() });
export const masterUpdateSchema = z.object({ id: z.string(), disaster_id: z.string(), title: z.string(), message: z.string(), severity: z.enum(['info', 'warning', 'critical']), published_at: z.string() });
export const masterReportSchema = z.object({ id: z.string(), family_id: z.string(), type: z.string(), message: z.string(), location: pointSchema.nullable(), client_request_id: z.string(), status: z.string(), created_at: z.string() });
export type MasterFamily = z.infer<typeof familySchema>;
export type MasterPlan = z.infer<typeof masterPlanSchema>;
