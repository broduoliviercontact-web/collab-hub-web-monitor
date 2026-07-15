import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollabHubConfig } from '../../src/collabHub/config.js';

test('resolveCollabHubConfig : namespace absent -> hub par défaut', () => {
  const cfg = resolveCollabHubConfig({ env: {}, usernamePrefix: 'T' });
  assert.equal(cfg.serverUrl, 'https://server.collab-hub.io');
  assert.equal(cfg.namespace, 'hub');
  assert.match(cfg.username, /^T_\d+$/);
});

test('resolveCollabHubConfig : namespace explicite nettoie les slashs', () => {
  const cfg = resolveCollabHubConfig({
    env: { VITE_COLLAB_HUB_NAMESPACE: '/custom/' },
  });
  assert.equal(cfg.namespace, 'custom');
});
