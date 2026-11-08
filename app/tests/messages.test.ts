import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessagesApi } from '../src/services/api/messages';
import { makeHttpClient } from '../src/services/api/http';
import { MockAdapter } from '../src/services/adapters/mockAdapter';
import { messageInputSchema, changeSchema } from '../src/types/models';
import { affectedQueries } from '../src/utils/changes';

test('messages use POST, authentication, and the same idempotency key after a failed response', async () => {
  const original = globalThis.fetch; const attempts: { body: string; key: string; token: string }[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      attempts.push({ body: String(init?.body), key: headers['Idempotency-Key']!, token: headers.Authorization! });
      if (attempts.length === 1) return new Response('{}', { status: 503 });
      const input = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ...input, id: 'message-1', sender: 'household', createdAt: new Date().toISOString() }));
    };
    const api = createMessagesApi(makeHttpClient('https://support.example', async () => 'session-token'));
    const input = { body: '  We need transportation.  ', idempotencyKey: 'message-key-1' };
    await assert.rejects(api.sendMessage(input), /temporarily unavailable/);
    const accepted = await api.sendMessage(input);
    assert.equal(accepted.body, 'We need transportation.');
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(attempts[0]?.token, 'Bearer session-token');
    assert.equal(attempts[0]?.key, 'message-key-1');
  } finally { globalThis.fetch = original; }
});
test('messages reject empty input and mismatched or malformed acknowledgments', async () => {
  const original = globalThis.fetch;
  const input = { body: 'Where is my shelter?', idempotencyKey: 'message-key-2' };
  assert(!messageInputSchema.safeParse({ ...input, body: '   ' }).success);
  assert(!messageInputSchema.safeParse({ ...input, body: 'a'.repeat(2001) }).success);
  try {
    const api = createMessagesApi(makeHttpClient('https://support.example', async () => null));
    for (const response of [{}, { id: 'wrong', body: input.body, sender: 'support', createdAt: new Date().toISOString(), idempotencyKey: input.idempotencyKey }, { id: 'wrong', body: input.body, sender: 'household', createdAt: new Date().toISOString(), idempotencyKey: 'other-message' }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(response));
      await assert.rejects(api.sendMessage(input));
    }
  } finally { globalThis.fetch = original; }
});
test('local mode never claims a support message was sent', async () => {
  const api = new MockAdapter(undefined, 0);
  await assert.rejects(api.sendMessage({ body: 'Please help.', idempotencyKey: 'local-key' }), /not connected/);
  assert.deepEqual(await api.getMessages(), []);
});
test('incoming message events invalidate conversation history', () => {
  const changes = changeSchema.parse({ cursor: '1', events: [{ id: 'message-event', entity: 'messages' }] });
  assert(affectedQueries(changes, new Set()).has('messages'));
});
