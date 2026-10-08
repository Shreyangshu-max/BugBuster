const fetch = require('node-fetch');

/**
 * Gemini Code Analyzer Service
 * Sends student code + problem + execution result to Gemini AI.
 * Returns ONLY Gemini-generated analysis — NO hardcoded hints ever.
 */

async function analyzeStudentSubmission({
  problem = '',
  language = 'python',
  code = '',
  executionResult = {},
  previousHints = []
}) {
  const fetch = globalThis.fetch || require('node-fetch');
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!apiKey) {
    return {
      available: false,
      error: 'GEMINI_ANALYSIS_FAILED: GEMINI_API_KEY is not configured in environment.',
      understanding: '',
      status: 'unknown',
      bugDetected: false,
      bugLocation: null,
      testCases: [],
      failedReasoning: '',
      hints: [],
      suggestedFix: '',
      confidence: 0
    };
  }

  const systemInstruction = `
You are a strict code evaluation engine and programming tutor for a learning platform.

Your task is to evaluate student source code against the exact problem statement, execution results, and generate progressive hints.

=== CORE EVALUATION RULES ===

1. LOGIC ACCURACY IS PRIMARY:
   - Even if the code compiles and runs with exit code 0, it can still be WRONG.
   - Compare what the code actually does versus what the problem explicitly asks for.
   - If the problem says SUBTRACT and the code does ADDITION → mark as "logic_error" with bugDetected: true.
   - If the problem says REVERSE and the code sorts → mark as "logic_error" with bugDetected: true.
   - NEVER mark status "correct" unless the code logic matches the problem intent precisely.

2. EXECUTION RESULTS:
   - Use the actual execution output, exit code, stdout, and stderr to determine runtime status.
   - If stderr is non-empty and exit code != 0 → "runtime_error" or "compile_error".
   - If execution timed out → "timeout".
   - If stdout matches the expected output for the problem → "correct".

3. PROGRESSIVE HINTS (VERY IMPORTANT):
   - Level 1: A high-level conceptual question (e.g., "What operation does the problem ask you to perform?").
   - Level 2: Point toward the specific code region (e.g., "Look at line 3 — what operator is being used there?").
   - Level 3: Narrow correction guidance (e.g., "You are using + when the problem requires -.").
   - NEVER write the corrected code. NEVER expose the full solution.
   - If previousHints are supplied, generate NEXT deeper hints beyond those already seen.

4. OUTPUT FORMAT:
   - Return ONLY a raw JSON object. No backticks, no markdown, no preamble.

=== JSON SCHEMA ===
{
  "understanding": "One sentence describing what the problem requires vs. what the code does.",
  "status": "correct | compile_error | runtime_error | timeout | wrong_answer | logic_error | incomplete | unknown",
  "bugDetected": true/false,
  "bugLocation": {
    "line": <line number>,
    "code": "<exact snippet from student code>",
    "reason": "<why this specific line/operation is wrong>"
  },
  "testCases": [
    { "input": "<test input>", "expectedOutput": "<expected result>", "purpose": "<what this tests>" }
  ],
  "failedReasoning": "<Full explanation of why the student's code fails to solve the problem>",
  "hints": [
    { "level": 1, "hint": "<Conceptual hint>"},
    { "level": 2, "hint": "<Code-region hint>" },
    { "level": 3, "hint": "<Correction direction hint>" }
  ],
  "suggestedFix": "<Smallest conceptual change without writing the solution>",
  "confidence": <0.0 to 1.0>
}
`;

  const prompt = `
PROBLEM STATEMENT:
${problem || 'No problem statement provided. Evaluate based on code correctness only.'}

PROGRAMMING LANGUAGE: ${language}

STUDENT SOURCE CODE:
\`\`\`
${code}
\`\`\`

EXECUTION RESULT:
- Status: ${executionResult.status || 'unknown'}
- Exit Code: ${executionResult.exitCode ?? 'N/A'}
- Stdout: ${executionResult.output || '(empty)'}
- Stderr: ${executionResult.error || '(empty)'}
- Timed Out: ${executionResult.timedOut ? 'YES' : 'no'}
- Execution Time: ${executionResult.executionTime ?? 0}s
- Memory: ${executionResult.memory ?? 0} KB

PREVIOUSLY REVEALED HINTS (do NOT repeat these, generate NEXT level hints):
${previousHints.length > 0 ? previousHints.map((h, i) => `${i + 1}. ${h}`).join('\n') : 'None yet.'}

Analyze this submission strictly. Return only raw JSON.
`;

  // Try standard Google Gemini models in order of capability
  const modelsToTry = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash'
  ];

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + prompt }] }],
          generationConfig: { temperature: 0.1 }
        }),
        timeout: 18000
      });

      if (response.status === 503 || response.status === 429) {
        // Overloaded — try next model
        console.warn(`Gemini model ${modelName} returned ${response.status}, trying next...`);
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.warn(`Gemini model ${modelName} failed HTTP ${response.status}:`, errBody.slice(0, 200));
        continue;
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!rawText) {
        console.warn(`Gemini model ${modelName} returned empty content.`);
        continue;
      }

      let parsed = null;
      try {
        const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.warn(`Gemini model ${modelName} response was not valid JSON:`, rawText.slice(0, 300));
        continue;
      }

      // Validate required fields
      if (!parsed.status || !Array.isArray(parsed.hints)) {
        console.warn(`Gemini model ${modelName} returned incomplete schema.`);
        continue;
      }

      return buildResult(parsed, executionResult, true);

    } catch (err) {
      console.warn(`Gemini model ${modelName} threw error:`, err.message);
    }
  }

  // All models failed — return honest "unavailable" (no fake hardcoded hints)
  return {
    available: false,
    error: 'GEMINI_UNAVAILABLE: All Gemini models are temporarily overloaded. Please try again in a moment.',
    understanding: '',
    status: executionResult.status || 'unknown',
    bugDetected: false,
    bugLocation: null,
    testCases: [],
    failedReasoning: '',
    hints: [],
    suggestedFix: '',
    confidence: 0
  };
}

function buildResult(parsed, executionResult, available) {
  let status = parsed.status || 'unknown';

  // Override if execution clearly had errors
  if (executionResult?.status === 'compile_error') status = 'compile_error';
  else if (executionResult?.status === 'timeout') status = 'timeout';
  else if (executionResult?.status === 'runtime_error' && status === 'correct') status = 'runtime_error';

  return {
    available: true,
    understanding: parsed.understanding || '',
    status,
    bugDetected: typeof parsed.bugDetected === 'boolean' ? parsed.bugDetected : status !== 'correct',
    bugLocation: parsed.bugLocation || null,
    testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
    failedReasoning: parsed.failedReasoning || '',
    hints: Array.isArray(parsed.hints) ? parsed.hints : [],
    suggestedFix: parsed.suggestedFix || '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9
  };
}

module.exports = { analyzeStudentSubmission };
