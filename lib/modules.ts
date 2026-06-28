// Single source of truth for modules hidden in the current (MVP) product.
//
// Hiding a module here removes it from the sidebar, bounces any stale/persisted
// activeModule pointing at it back to the dashboard, and stops the AI assistant
// from navigating to it. To bring a module back, delete its id from this set —
// no other code changes needed. Data for hidden modules is left untouched.

export const HIDDEN_MODULES = new Set<string>([
  "correspondence",
  "risks",
  "stakeholders",
  "site-notes",
]);

export const isModuleEnabled = (id: string) => !HIDDEN_MODULES.has(id);
