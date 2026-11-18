import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  ASK_MODEL, buildSystemPrompt, buildUserTurn, classifyError, extractSections, loadCommandReference, loadKnowledge, parseFinalAnswer, runAskLlm,
  sanitizeAnswer, type MessagesClient,
} from './llm.js';

type Body = Anthropic.MessageCreateParamsNonStreaming;

function msg(stop: Anthropic.Message['stop_reason'], content: unknown[], usage = { input_tokens: 100, output_tokens: 20 }): Anthropic.Message {
  return {
    id: 'msg_x', type: 'message', role: 'assistant', model: ASK_MODEL, stop_reason: stop, stop_sequence: null,
    content, usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...usage },
  } as unknown as Anthropic.Message;
}
const text = (t: string) => ({ type: 'text', text: t, citations: null });
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });

function mockClient(responses: (Anthropic.Message | Error | (() => Promise<Anthropic.Message>))[]): MessagesClient & { calls: Body[] } {
  const calls: Body[] = [];
  return {
    calls,
    messages: {
      async create(body: Body) {
        calls.push(structuredClone(body));
        const next = responses.shift();
        if (!next) throw new Error('no more mock responses');
        if (next instanceof Error) throw next;
        return typeof next === 'function' ? next() : next;
      },
    },
  };
}

const input = { question: 'how many goals does Keller have', today: 'Tuesday, November 17, 2026' };

describe('runAskLlm', () => {
  test('tool round-trip, then on-topic answer; request shape per the Haiku 5.5 notes', async () => {
    const client = mockClient([
      msg('tool_use', [{ type: 'thinking', thinking: '', signature: 'sig' }, toolUse('tu1', 'get_player_stats', { name: 'Keller' })]),
      msg('end_turn', [text('{"on_topic":true,"answer":"Clayton Keller has 9 goals. @everyone <@123> rejoice."}')], { input_tokens: 300, output_tokens: 40 }),
    ]);
    const toolCalls: [string, unknown][] = [];
    const out = await runAskLlm({
      client, input, knowledge: 'KB',
      executeTool: async (name, args) => { toolCalls.push([name, args]); return 'Clayton Keller G: 9'; },
    });
    assert.deepEqual(out, { kind: 'answer', answer: 'Clayton Keller has 9 goals. everyone rejoice.', inputTokens: 400, outputTokens: 60, webSearches: 0 });
    assert.deepEqual(toolCalls, [['get_player_stats', { name: 'Keller' }]]);

    const first = client.calls[0];
    assert.equal(first.model, 'claude-haiku-5-5');
    assert.equal(first.max_tokens, 1024);
    assert.deepEqual(first.tool_choice, { type: 'auto' });
    assert.equal(first.output_config?.effort, 'low');
    assert.equal(first.output_config?.format?.type, 'json_schema');
    for (const banned of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(banned in first), banned);
    // date goes in the user turn, not the system prompt
    assert.match(String(first.messages[0].content), /Tuesday, November 17, 2026/);
    assert.doesNotMatch(JSON.stringify(first.system), /November 17, 2026/);

    // second call carries the assistant turn (with thinking block) and the tool result
    const second = client.calls[1];
    assert.equal(second.messages.length, 3);
    assert.equal((second.messages[1].content as { type: string }[])[0].type, 'thinking');
    const result = (second.messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    assert.equal(result.tool_use_id, 'tu1');
    assert.equal(result.content, 'Clayton Keller G: 9');
  });

  test('web search: tool offered only when enabled, searches counted, pause_turn resumes', async () => {
    const off = mockClient([msg('end_turn', [text('{"on_topic":true,"answer":"ok"}')])]);
    await runAskLlm({ client: off, input, knowledge: '', executeTool: async () => '' });
    assert.ok(!(off.calls[0].tools ?? []).some(t => t.name === 'web_search'));
    assert.match(JSON.stringify(off.calls[0].system), /Web search is unavailable/);

    const paused = msg('pause_turn', [{ type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query: 'q' } }]);
    const done = msg('end_turn', [text('{"on_topic":true,"answer":"Dylan Guenther, 9th overall."}')], { input_tokens: 100, output_tokens: 20 });
    (done.usage as unknown as Record<string, unknown>).server_tool_use = { web_search_requests: 1, web_fetch_requests: 0 };
    const on = mockClient([paused, done]);
    const out = await runAskLlm({ client: on, input, knowledge: '', webSearch: true, executeTool: async () => '' });
    assert.deepEqual(out, { kind: 'answer', answer: 'Dylan Guenther, 9th overall.', inputTokens: 200, outputTokens: 40, webSearches: 1 });
    const search = (on.calls[0].tools ?? []).find(t => t.name === 'web_search') as { max_uses?: number; allowed_domains?: string[] };
    assert.equal(search.max_uses, 1);
    assert.ok(search.allowed_domains?.includes('nhl.com'));
    assert.match(JSON.stringify(on.calls[0].system), /look it up with web_search/);
    // resumed with the paused assistant turn and no extra user message
    assert.equal(on.calls[1].messages.length, 2);
    assert.equal(on.calls[1].messages[1].role, 'assistant');
  });

  test('a blocked search domain (400) retries once without web search', async () => {
    const blocked = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: "The following domains are not accessible to our user agent: ['x.com']" } }, "The following domains are not accessible to our user agent: ['x.com']", new Headers());
    const client = mockClient([blocked, msg('end_turn', [text('{"on_topic":true,"answer":"ok"}')])]);
    const out = await runAskLlm({ client, input, knowledge: '', webSearch: true, executeTool: async () => '' });
    assert.equal(out.kind, 'answer');
    assert.ok((client.calls[0].tools ?? []).some(t => t.name === 'web_search'));
    assert.ok(!(client.calls[1].tools ?? []).some(t => t.name === 'web_search'));
  });

  test('off-topic → off_topic (caller deflects; model text never used)', async () => {
    const client = mockClient([msg('end_turn', [text('{"on_topic":false,"answer":"Here is a lasagna recipe"}')])]);
    const out = await runAskLlm({ client, input, knowledge: '', executeTool: async () => '' });
    assert.equal(out.kind, 'off_topic');
  });

  test('refusal → refusal', async () => {
    const client = mockClient([msg('refusal', [])]);
    assert.equal((await runAskLlm({ client, input, knowledge: '', executeTool: async () => '' })).kind, 'refusal');
  });

  test('max_tokens and unparseable output → error', async () => {
    let client = mockClient([msg('max_tokens', [text('{"on_topic":tr')])]);
    let out = await runAskLlm({ client, input, knowledge: '', executeTool: async () => '' });
    assert.deepEqual([out.kind, out.kind === 'error' && out.reason], ['error', 'max_tokens']);
    client = mockClient([msg('end_turn', [text('Sure! Keller has 9.')])]);
    out = await runAskLlm({ client, input, knowledge: '', executeTool: async () => '' });
    assert.deepEqual([out.kind, out.kind === 'error' && out.reason], ['error', 'bad_output']);
  });

  test('tool loop is capped: last call sends tool_choice none', async () => {
    const client = mockClient([
      msg('tool_use', [toolUse('a', 'get_standings', { scope: 'league' })]),
      msg('tool_use', [toolUse('b', 'get_standings', { scope: 'west' })]),
      msg('end_turn', [text('{"on_topic":true,"answer":"Fourth in the Central."}')]),
    ]);
    const out = await runAskLlm({ client, input, knowledge: '', executeTool: async () => 'table', maxCalls: 3 });
    assert.equal(out.kind, 'answer');
    assert.equal(client.calls.length, 3);
    assert.deepEqual(client.calls[2].tool_choice, { type: 'none' });
  });

  test('a failing tool becomes an is_error result, not a crash', async () => {
    const client = mockClient([
      msg('tool_use', [toolUse('a', 'get_last_game', {})]),
      msg('end_turn', [text('{"on_topic":true,"answer":"I can\'t reach the scores right now."}')]),
    ]);
    const out = await runAskLlm({ client, input, knowledge: '', executeTool: async () => { throw new Error('NHL down'); } });
    assert.equal(out.kind, 'answer');
    const result = (client.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    assert.equal(result.is_error, true);
  });

  test('typed SDK errors are classified', async () => {
    const rate = new Anthropic.RateLimitError(429, undefined, 'rate limited', new Headers());
    const client = mockClient([rate]);
    const out = await runAskLlm({ client, input, knowledge: '', executeTool: async () => '' });
    assert.deepEqual([out.kind, out.kind === 'error' && out.reason], ['error', 'rate_limited']);
    assert.equal(classifyError(new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers())), 'auth');
    assert.equal(classifyError(new Anthropic.APIUserAbortError()), 'timeout');
    assert.equal(classifyError(new Anthropic.APIConnectionTimeoutError()), 'timeout');
    assert.equal(classifyError(new Anthropic.InternalServerError(529, undefined, 'overloaded', new Headers())), 'overloaded');
    assert.equal(classifyError(new Error('boom')), 'unknown');
  });

  test('overall deadline: a hanging tool times out', async () => {
    const client = mockClient([msg('tool_use', [toolUse('a', 'get_upcoming_games', { count: 1 })])]);
    const started = Date.now();
    const out = await runAskLlm({
      client, input, knowledge: '', timeoutMs: 50,
      executeTool: () => new Promise(() => {}),
    });
    assert.deepEqual([out.kind, out.kind === 'error' && out.reason], ['error', 'timeout']);
    assert.ok(Date.now() - started < 1000);
  });
});

describe('parsing and prompt helpers', () => {
  test('parseFinalAnswer', () => {
    assert.deepEqual(parseFinalAnswer('{"on_topic":true,"answer":"Yes."}'), { on_topic: true, answer: 'Yes.' });
    assert.deepEqual(parseFinalAnswer('```json\n{"on_topic":false,"answer":""}\n```'), { on_topic: false, answer: '' });
    assert.equal(parseFinalAnswer('{"on_topic":"yes","answer":"x"}'), null);
    assert.equal(parseFinalAnswer('{"answer":"x"}'), null);
    assert.equal(parseFinalAnswer('not json'), null);
  });

  test('sanitizeAnswer removes mentions but keeps @handles in URLs', () => {
    assert.equal(sanitizeAnswer('Hi <@123> and <@&456> @here'), 'Hi and here');
    assert.equal(sanitizeAnswer('See https://www.youtube.com/@CleanHitsHockey'), 'See https://www.youtube.com/@CleanHitsHockey');
    assert.ok(sanitizeAnswer('x '.repeat(500)).length <= 600);
  });

  test('user turn: date, reply context and question are tagged', () => {
    const t = buildUserTurn({ question: 'who won', repliedTo: 'UTA 4 - COL 2', today: 'Tuesday, November 17, 2026' });
    assert.match(t, /^Today's date \(America\/Denver\): Tuesday, November 17, 2026/);
    assert.match(t, /<replied_to_message>\nUTA 4 - COL 2\n<\/replied_to_message>/);
    assert.match(t, /<question>\nwho won\n<\/question>$/);
    assert.doesNotMatch(buildUserTurn({ question: 'q', today: 'd' }), /replied_to/);
  });

  test('system prompt carries scope rules and the knowledge file', () => {
    const kb = loadKnowledge();
    assert.match(kb, /Clean Hits Hockey/);
    assert.match(kb, /youtube\.com\/@CleanHitsHockey/);
    const sys = buildSystemPrompt(kb);
    assert.match(sys, /Utah Mammoth/);
    assert.match(sys, /never @mention/i);
    assert.match(sys, /\{crew_role\}/);
    assert.match(sys, /<knowledge>[\s\S]*Clean Hits Crew[\s\S]*<\/knowledge>/);
  });

  test('Tusky is a woolly mammoth, never a walrus (prompt and knowledge file)', () => {
    const sys = buildSystemPrompt(loadKnowledge());
    assert.match(sys, /woolly mammoth/);
    assert.match(loadKnowledge(), /woolly mammoth/);
    // "walrus" only ever appears negated ("never a walrus", "not a walrus")
    for (const m of sys.matchAll(/.{0,20}walrus/gi)) assert.match(m[0], /(never|not) a walrus/i, m[0]);
  });

  test('nickname list goes in the system prompt in a stable order; omitted when empty', () => {
    const a = [
      { nickname: 'Tuna', player: 'Liam O\'Brien' },
      { nickname: 'Cools', player: 'Logan Cooley' },
      { nickname: 'Spicy Tuna', player: 'Liam O\'Brien' },
    ];
    const sys = buildSystemPrompt('kb', a);
    assert.equal(sys, buildSystemPrompt('kb', [...a].reverse()));
    assert.match(sys, /<player_nicknames>\n- Liam O'Brien: Spicy Tuna, Tuna\n- Logan Cooley: Cools\n<\/player_nicknames>/);
    assert.match(sys, /never make one up/i);
    assert.match(sys, /Tool inputs always use the real name/);
    assert.doesNotMatch(buildSystemPrompt('kb'), /player_nicknames/);
  });

  test('runAskLlm puts the nicknames in the cached system block, not the user turn', async () => {
    const client = mockClient([msg('end_turn', [text('{"on_topic":true,"answer":"Fine."}')])]);
    await runAskLlm({ client, input: { question: 'how is cools', today: 'd' }, executeTool: async () => '', knowledge: 'kb', nicknames: [{ nickname: 'Cools', player: 'Logan Cooley' }] });
    const body = client.calls[0];
    assert.match(JSON.stringify(body.system), /Logan Cooley: Cools/);
    assert.doesNotMatch(JSON.stringify(body.messages), /Logan Cooley/);
  });
});

describe('command manual', () => {
  test('extractSections keeps only the named ## sections', () => {
    const md = '# T\n## Intro\nskip\n## Commands\n| `!next` | next game |\n### Sub\nkeep\n## Testing\nskip too\n';
    assert.equal(extractSections(md, ['Commands']), '## Commands\n| `!next` | next game |\n### Sub\nkeep');
  });
  test('the real README yields a manual with core commands, and it lands in the system prompt', () => {
    const ref = loadCommandReference();
    for (const cmd of ['!next', '/gif keys', '!follow', '!standings']) assert.ok(ref.includes(cmd), cmd);
    assert.doesNotMatch(ref, /## Troubleshooting/);
    const sys = buildSystemPrompt('kb', [], ref);
    assert.match(sys, /<tusky_manual>/);
    assert.match(sys, /list_gif_commands/);
  });
});
