import { z } from 'zod';

export const resourceStatus = z.enum(['confirmed', 'pending', 'unverified', 'unavailable', 'cancelled']);
export const requestStatus = z.enum(['submitted', 'under_review', 'matched', 'accepted', 'in_progress', 'fulfilled', 'unable_to_fulfill', 'cancelled']);
export const categorySchema = z.enum(['transportation', 'shelter', 'food_water', 'medical_supplies', 'accessibility', 'other']);
export const needs = ['Limited mobility', 'Essential medication', 'Medication needed immediately', 'Refrigerated medication', 'Electric medical equipment', 'Accessible transportation'] as const;
export const sourceSchema = z.object({ name: z.string(), kind: z.enum(['government', 'organization', 'unverified']), verified: z.boolean(), url: z.url().optional() });
export const locationSchema = z.object({ label: z.string().min(2), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() });
export const householdInputSchema = z.object({
  disasterId: z.string().optional(), name: z.string().min(2).max(80), adults: z.number().int().min(0).max(60), children: z.number().int().min(0).max(60), pets: z.number().int().min(0).max(30), petTypes: z.string().max(120), petDetails: z.array(z.object({ kind: z.string().min(1).max(40), count: z.number().int().min(1).max(30) })).max(6).optional(),
  needs: z.array(z.string().max(100)), otherNeeds: z.string().max(300), hasCar: z.boolean(), canDrive: z.boolean(), seats: z.number().int().min(0).max(50), needsTransport: z.boolean(), needsShelter: z.boolean(), needsFood: z.boolean(), location: locationSchema,
  locationMode: z.enum(['home', 'current']).optional(), homeLocation: locationSchema.optional(),
}).refine(data => data.adults + data.children >= 1 && data.adults + data.children <= 60, { message: 'Enter between 1 and 60 people in total.', path: ['adults'] }).refine(data => !data.petDetails || data.petDetails.reduce((total, pet) => total + pet.count, 0) === data.pets, { message: 'Pet counts must match the total.', path: ['petDetails'] });
export const householdSchema = householdInputSchema.safeExtend({ id: z.string(), updatedAt: z.iso.datetime() });
export const assignmentSchema = z.object({ name: z.string(), description: z.string(), address: z.string().optional(), coordinates: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(), organization: z.string(), status: resourceStatus, source: sourceSchema });
export const planSchema = z.object({
  id: z.string(), householdId: z.string(), disasterId: z.string(), disasterType: z.string(), version: z.number().int().positive(), status: z.enum(['active', 'pending', 'superseded']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  warnings: z.array(z.object({ message: z.string(), severity: z.enum(['warning', 'critical']) })).optional(),
  summary: z.string(), changes: z.array(z.string()), officialInstructions: z.array(z.object({ text: z.string(), source: sourceSchema })),
  actionSteps: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), personalTask: z.boolean() })),
  shelterAssignment: assignmentSchema.nullable(), transportationAssignment: assignmentSchema.nullable(), additionalResources: z.array(assignmentSchema), unmetNeeds: z.array(z.string()), sources: z.array(sourceSchema),
});
export const alertSchema = z.object({ id: z.string(), disasterType: z.string(), title: z.string(), message: z.string(), area: z.string(), severity: z.enum(['warning', 'watch', 'info']), source: sourceSchema, updatedAt: z.iso.datetime() });
export const assistanceInputSchema = z.object({ category: categorySchema, people: z.number().int().min(1).max(60), requirements: z.array(z.string()), description: z.string().max(1000), location: locationSchema.optional(), idempotencyKey: z.string().min(1) });
export const assistanceSchema = assistanceInputSchema.extend({ id: z.string(), status: requestStatus, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), organization: z.string().nullable(), timeline: z.array(z.object({ status: requestStatus, timestamp: z.iso.datetime(), message: z.string() })) });
export const messageInputSchema = z.object({ body: z.string().trim().min(1).max(2000), idempotencyKey: z.string().min(1) });
export const messageSchema = z.object({ id: z.string().min(1), body: z.string().min(1).max(2000), sender: z.enum(['household', 'support']), createdAt: z.iso.datetime(), idempotencyKey: z.string().optional() });
export type MessageInput = z.infer<typeof messageInputSchema>;
export type SupportMessage = z.infer<typeof messageSchema>;

export const reportKinds = ['I am safe', 'I need assistance', 'My transportation is unavailable', 'My assigned resource is inaccessible', 'My household circumstances have changed', 'I want to report an issue'] as const;
export const reportInputSchema = z.object({ kind: z.enum(reportKinds), description: z.string().max(1000), idempotencyKey: z.string() });
export const reportSchema = reportInputSchema.extend({ id: z.string(), createdAt: z.iso.datetime(), acknowledgment: z.string().nullable() });
export const updateSchema = z.object({ id: z.string(), category: z.enum(['warning', 'government', 'organization', 'request', 'resource', 'plan']), title: z.string(), message: z.string(), source: sourceSchema, timestamp: z.iso.datetime(), planId: z.string().optional(), requestId: z.string().optional() });
export const changeSchema = z.object({ cursor: z.string(), events: z.array(z.object({ id: z.string(), entity: z.enum(['household', 'plan', 'alerts', 'requests', 'updates', 'reports', 'messages']) })) });
export type HouseholdInput = z.infer<typeof householdInputSchema>;
export type Household = z.infer<typeof householdSchema>;
export type ResponsePlan = z.infer<typeof planSchema>;
export type DisasterAlert = z.infer<typeof alertSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type AssistanceInput = z.infer<typeof assistanceInputSchema>;
export type AssistanceRequest = z.infer<typeof assistanceSchema>;
export type SituationReport = z.infer<typeof reportSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export type Update = z.infer<typeof updateSchema>;
export type Changes = z.infer<typeof changeSchema>;
export type Source = z.infer<typeof sourceSchema>;
export const categoryLabels: Record<AssistanceInput['category'], string> = { transportation: 'Transportation', shelter: 'Temporary shelter', food_water: 'Food & water', medical_supplies: 'Medical supplies', accessibility: 'Accessibility', other: 'Other support' };

export type Disaster = { id: string; type: string; name: string; status: string; affectedArea: string; updatedAt: string };
