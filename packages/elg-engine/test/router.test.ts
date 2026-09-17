import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeSemanticTask,
  sanitizeOutput,
  isReasoningModel,
  resolveWireProtocol,
  TIER_MODELS,
  RouterError,
  SemanticTier,
} from '../src/index.js';

test('Router Unit Test Suite', async (t) => {
  // --------------------------------------------------------------------------
  // Group 1: Tier Model Matrix & Configuration
  // --------------------------------------------------------------------------
  await t.test('Tier Models: correctly maps all 4 semantic tiers to primary and fallback models', () => {
    assert.deepStrictEqual(TIER_MODELS.triage, {
      primary: 'google/gemini-3.8-flash',
      fallback: 'anthropic/claude-haiku-4-5',
    });

    assert.deepStrictEqual(TIER_MODELS.workhorse, {
      primary: 'anthropic/claude-3.7-sonnet',
      fallback: 'google/gemini-3.8-flash',
    });

    assert.deepStrictEqual(TIER_MODELS.reasoning, {
      primary: 'deepseek/deepseek-r1',
      fallback: 'openai/o3-mini',
    });

    assert.deepStrictEqual(TIER_MODELS.frontier, {
      primary: 'anthropic/claude-opus-5',
      fallback: 'google/gemini-3.1-pro-high',
    });
  });

  await t.test('Tier Models: throws clear error for invalid tier', async () => {
    await assert.rejects(
      async () => {
        await executeSemanticTask('invalid-tier' as any, 'hello');
      },
      (err: any) => {
        assert.ok(err instanceof RouterError);
        assert.ok(err.message.includes('Unknown semantic tier'));
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Group 2: Output Sanitization
  // --------------------------------------------------------------------------
  await t.test('Output Sanitization: strips <think>...</think> tags (single and multiline)', () => {
    const rawSingle = '<think>Analyzing problem...</think>Clean output text.';
    assert.strictEqual(sanitizeOutput(rawSingle), 'Clean output text.');

    const rawMulti = `<think>
Line 1 of thought
Line 2 of thought
</think>
Here is the real answer.`;
    assert.strictEqual(sanitizeOutput(rawMulti), 'Here is the real answer.');
  });

  await t.test('Output Sanitization: strips [thinking]...[/thinking] tags (single and multiline)', () => {
    const raw = `[thinking]
Evaluating alternatives...
[/thinking]The recommended approach is zero-copy networking.`;
    assert.strictEqual(sanitizeOutput(raw), 'The recommended approach is zero-copy networking.');
  });

  await t.test('Output Sanitization: strips mixed reasoning tags and trims cleanly', () => {
    const mixed = `  <think>Thought 1</think>  [thinking]Thought 2[/thinking]  Final production content.  `;
    assert.strictEqual(sanitizeOutput(mixed), 'Final production content.');
    assert.strictEqual(sanitizeOutput(''), '');
  });

  // --------------------------------------------------------------------------
  // Group 3: Reasoning Model Detection & Temperature Omission
  // --------------------------------------------------------------------------
  await t.test('Reasoning Model Detection: accurately identifies /o1|o3|r1|thinking/i', () => {
    assert.strictEqual(isReasoningModel('deepseek/deepseek-r1'), true);
    assert.strictEqual(isReasoningModel('openai/o3-mini'), true);
    assert.strictEqual(isReasoningModel('openai/o1-preview'), true);
    assert.strictEqual(isReasoningModel('o1'), true);
    assert.strictEqual(isReasoningModel('o3'), true);
    assert.strictEqual(isReasoningModel('anthropic/claude-3.7-sonnet:thinking'), true);

    // Non-reasoning models
    assert.strictEqual(isReasoningModel('anthropic/claude-3.7-sonnet'), false);
    assert.strictEqual(isReasoningModel('google/gemini-3.8-flash'), false);
    assert.strictEqual(isReasoningModel('anthropic/claude-opus-5'), false);
    assert.strictEqual(isReasoningModel('google/gemini-3.1-pro-high'), false);
  });

  await t.test('Temperature Handling: omits temperature for reasoning models on the wire', async () => {
    let capturedPayload: any = null;

    const mockFetch = async (_url: any, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '<think>Calculated proof</think>Deterministic result' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('reasoning', 'Prove correctness', {
      temperature: 0.8,
      fetchFn: mockFetch as any,
      apiKey: 'test-key',
    });

    assert.strictEqual(res.text, 'Deterministic result');
    assert.strictEqual(capturedPayload.model, 'deepseek/deepseek-r1');
    assert.strictEqual('temperature' in capturedPayload, false, 'temperature must be omitted for reasoning models');
  });

  await t.test('Temperature Handling: preserves temperature for non-reasoning models on the wire', async () => {
    let capturedPayload: any = null;

    const mockFetch = async (_url: any, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Perspectives generated successfully' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('workhorse', 'Draft updates', {
      temperature: 0.65,
      fetchFn: mockFetch as any,
      apiKey: 'test-key',
    });

    assert.strictEqual(res.text, 'Perspectives generated successfully');
    assert.strictEqual(capturedPayload.temperature, 0.65);
  });

  // --------------------------------------------------------------------------
  // Group 4: 2-Wire Protocol Resolution & Headers
  // --------------------------------------------------------------------------
  await t.test('Wire Protocol Resolution: selects Anthropic wire when ANTHROPIC_API_KEY is supplied without OPENROUTER_API_KEY', () => {
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    const originalOpenRouter = process.env.OPENROUTER_API_KEY;

    try {
      delete process.env.OPENROUTER_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-123';
      assert.strictEqual(resolveWireProtocol({}), 'anthropic');

      // If OpenRouter key is also present, default to OpenAI wire (OpenRouter aggregator)
      process.env.OPENROUTER_API_KEY = 'sk-or-test-456';
      assert.strictEqual(resolveWireProtocol({}), 'openai');
    } finally {
      if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
      else delete process.env.ANTHROPIC_API_KEY;
      if (originalOpenRouter) process.env.OPENROUTER_API_KEY = originalOpenRouter;
      else delete process.env.OPENROUTER_API_KEY;
    }
  });

  await t.test('Wire 1: sends OpenAI chat completion payload with OpenRouter headers', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    const mockFetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Triage complete' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('triage', 'Classify signal', {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
      fetchFn: mockFetch as any,
    });

    assert.strictEqual(res.text, 'Triage complete');
    assert.strictEqual(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer sk-or-test');
    assert.strictEqual(capturedHeaders['HTTP-Referer'], 'https://github.com/RL22/elg-kit');
    assert.strictEqual(capturedHeaders['X-Title'], 'elg-kit');
    assert.strictEqual(capturedBody.model, 'google/gemini-3.8-flash');
  });

  await t.test('Wire 2: sends Anthropic messages payload with x-api-key and strips prefix', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    const mockFetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Anthropic frontier output' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('frontier', 'High level synthesis', {
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
      fetchFn: mockFetch as any,
    });

    assert.strictEqual(res.text, 'Anthropic frontier output');
    assert.strictEqual(capturedUrl, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(capturedHeaders['x-api-key'], 'sk-ant-test');
    assert.strictEqual(capturedHeaders['anthropic-version'], '2023-06-01');
    assert.strictEqual(capturedBody.model, 'claude-opus-5'); // Prefix stripped
    assert.strictEqual(capturedBody.max_tokens, 4096);
  });

  // --------------------------------------------------------------------------
  // Group 5: 1-Level Automatic Failover
  // --------------------------------------------------------------------------
  await t.test('Failover: retries on fallback model when primary returns HTTP 429', async () => {
    const calls: string[] = [];

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.model);

      if (calls.length === 1) {
        return new Response('Rate limit exceeded', { status: 429 });
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Fallback workhorse success' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('workhorse', 'Generate perspective', {
      fetchFn: mockFetch as any,
      apiKey: 'test-key',
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0], 'anthropic/claude-3.7-sonnet'); // Primary
    assert.strictEqual(calls[1], 'google/gemini-3.8-flash'); // Fallback
    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.model, 'google/gemini-3.8-flash');
    assert.strictEqual(res.text, 'Fallback workhorse success');
  });

  await t.test('Failover: retries on fallback model when primary returns HTTP 503', async () => {
    const calls: string[] = [];

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.model);

      if (calls.length === 1) {
        return new Response('Service Unavailable / Overloaded', { status: 503 });
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Recovered on fallback' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('triage', 'Triage signal', {
      fetchFn: mockFetch as any,
      apiKey: 'test-key',
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0], 'google/gemini-3.8-flash'); // Primary
    assert.strictEqual(calls[1], 'anthropic/claude-haiku-4-5'); // Fallback
    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.text, 'Recovered on fallback');
  });

  await t.test('Failover: retries on fallback model when primary times out', async () => {
    const calls: string[] = [];

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.model);

      if (calls.length === 1) {
        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Fallback after timeout' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('reasoning', 'Complex logic', {
      fetchFn: mockFetch as any,
      apiKey: 'test-key',
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0], 'deepseek/deepseek-r1');
    assert.strictEqual(calls[1], 'openai/o3-mini');
    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.text, 'Fallback after timeout');
  });

  await t.test('Failover: does NOT retry on non-retryable errors (HTTP 401 Unauthorized)', async () => {
    const calls: string[] = [];

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.model);
      return new Response('Unauthorized key', { status: 401 });
    };

    await assert.rejects(
      async () => {
        await executeSemanticTask('triage', 'Triage task', {
          fetchFn: mockFetch as any,
          apiKey: 'bad-key',
        });
      },
      (err: any) => {
        assert.ok(err instanceof RouterError);
        assert.strictEqual(err.status, 401);
        return true;
      }
    );

    assert.strictEqual(calls.length, 1, 'Should NOT attempt fallback on 401');
  });

  await t.test('Failover: rethrows error when both primary and fallback fail', async () => {
    const calls: string[] = [];

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.model);
      return new Response('Rate limit', { status: 429 });
    };

    await assert.rejects(
      async () => {
        await executeSemanticTask('frontier', 'Critical synthesis', {
          fetchFn: mockFetch as any,
          apiKey: 'key',
        });
      },
      (err: any) => {
        assert.ok(err instanceof RouterError);
        assert.ok(err.message.includes('Both primary'));
        assert.ok(err.message.includes('and fallback'));
        return true;
      }
    );

    assert.strictEqual(calls.length, 2, 'Primary and fallback were both attempted');
  });

  // --------------------------------------------------------------------------
  // Group 6: Ergonomics & Object Contracts
  // --------------------------------------------------------------------------
  await t.test('Ergonomics: returns object with text, toString(), and valueOf()', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Ergonomic output' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await executeSemanticTask('workhorse', 'Task', {
      fetchFn: mockFetch as any,
    });

    assert.strictEqual(res.text, 'Ergonomic output');
    assert.strictEqual(res.toString(), 'Ergonomic output');
    assert.strictEqual(res.valueOf(), 'Ergonomic output');
    assert.strictEqual(res.tier, 'workhorse');
    assert.strictEqual(res.fallbackUsed, false);

    // Destructuring contract
    const { text } = res;
    assert.strictEqual(text, 'Ergonomic output');
  });
});
