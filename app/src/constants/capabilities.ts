// Capabilities exposed by the coordination service in backend/src/haven.
// Keep this in sync with the backend OpenAPI surface; the app must not invent
// data for anything marked false. Unsupported controls are disabled and
// labelled in the UI instead of being backed by fake/local-only responses.
export const backendCapabilities = {
  assistanceRequests: false,
  planHistory: false,
  messageHistory: false,
  reportHistory: false,
  updatesSourceFilters: false,
  detailedPets: false,
  transportationPreference: false,
} as const;

export type BackendCapability = keyof typeof backendCapabilities;

export const unsupportedLabels: Record<BackendCapability, string> = {
  assistanceRequests: 'Assistance requests are not available from the coordination service yet.',
  planHistory: 'Plan history is not available from the coordination service yet.',
  messageHistory: 'Message history and replies are not available from the coordination service yet.',
  reportHistory: 'Report history is not available from the coordination service yet.',
  updatesSourceFilters: 'Updates do not carry a source category, so source filters are unavailable.',
  detailedPets: 'Only whether pets are present is sent; pet counts stay on this device.',
  transportationPreference: 'Transportation preference is not a coordination service field; message Support instead.',
};
