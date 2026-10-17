// Tiny client state (architecture doc §2): network, alerts, clock, scenario, session. Panels read it
// and re-render; cross-panel calls go through `actions` so modules never import each other in a cycle.
export const S = {
  net: null, hubStatus: {}, alerts: [], now: 0, aiMode: 'off', where: '', scenario: null,
  result: null, sel: null, sim: null, lang: 'en',
  avoid: [], avoidModes: [], rain: [], blocked: [], zones: [], watchSeen: {}, adminToken: null,
};
export const actions = {};                                  // search, refreshAll, refreshWatches, showTab, drawMap, renderSearch, ...
export const hub = (id) => (S.net ? S.net.hubs.find((h) => h.id === id) : null);
export const hubName = (id) => (hub(id) || { name: id }).name;
