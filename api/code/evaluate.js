// Vercel Serverless Function: /api/code/evaluate
// Combined run + Gemini analysis - uses globalThis.fetch only

const COMPILER_MAP = {
  c: 'gcc-15', cpp: 'g++-15', c_cpp: 'g++-15',
  java: 'openjdk-25', python: 'python-3.14', python3: 'python-3.14',
  javascript: 'nodejs-22', js: 'nodejs-22'
};

async function runStudentCode({ language, code, input = '' }) {
  if (!language) return { success: false, status: 'error', output: '', error: 'INVALID_LANGUAGE', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };
  const compiler = COMPILER_MAP[language.toLowerCase().trim()];
  if (!compiler) return { success: false, status: 'error', output: '', error: 'INVALID_LANGUAGE: Unsupported.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };
  if (!code || !code.trim()) return { success: false, status: 'error', output: '', error: 'INVALID_CODE: Empty.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };
  const apiKey = (process.env.ONLINECOMPILER_API_KEY || '').trim();
  if (!apiKey) return { success: false, status: 'error', output: '', error: 'EXECUTION_SERVICE_UNAVAILABLE: No API key.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch('https://api.onlinecompiler.io/api/run-code-sync/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
      body: JSON.stringify({ compiler, code, input: input || '' }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { success: false, status: 'error', output: '', error: 'EXECUTION_SERVICE_UNAVAILABLE: OnlineCompiler ' + response.status, exitCode: response.status, timedOut: false, executionTime: 0, memory: 0 };
    }
    const data = await response.json();
    const output = data.output || data.stdout || '';
    const error = data.error || data.stderr || data.compilation_error || '';
    const exitCode = typeof data.exit_code === 'number' ? data.exit_code : (error ? 1 : 0);
    const executionTime = data.execution_time || data.time || 0;
    const memory = data.memory || 0;
    const isTimeout = data.timeout || data.status === 'timeout' || exitCode === 124 || exitCode === 137;
    const isCompileError = !!data.compilation_error || (exitCode !== 0 && error.toLowerCase().includes('compilation'));
    let status = 'success';
    if (isTimeout) status = 'timeout';
    else if (isCompileError) status = 'compile_error';
    else if (exitCode !== 0 || error) status = 'runtime_error';
    return { success: status === 'success', status, output, error, exitCode, signal: data.signal || null, timedOut: isTimeout, executionTime: typeof executionTime === 'number' ? parseFloat(executionTime.toFixed(3)) : 0, memory: typeof memory === 'number' ? Math.round(memory) : 0 };
  } catch (err) {
    if (err.name === 'AbortError') return { success: false, status: 'timeout', output: '', error: 'EXECUTION_TIMEOUT.', exitCode: 124, timedOut: true, executionTime: 15, memory: 0 };
    return { success: false, status: 'error', output: '', error: 'EXECUTION_SERVICE_UNAVAILABLE: ' + err.message, exitCode: 500, timedOut: false, executionTime: 0, memory: 0 };
  }
}

async function analyzeStudentSubmission({ problem = '', language = 'python', code = '', executionResult = {}, previousHints = [] }) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return { available: false, error: 'GEMINI_API_KEY not configured.', understanding: '', status: 'unknown', bugDetected: false, bugLocation: null, testCases: [], failedReasoning: '', hints: [], suggestedFix: '', confidence: 0 };
  }

  const systemInstruction = You are a strict code evaluation engine and programming tutor.
Evaluate student code against the problem and generate progressive hints.

RULES:
1. LOGIC ACCURACY IS PRIMARY - even if code runs with exit 0, it can be WRONG
2. Compare what code does vs what problem asks
3. Generate 3 progressive hints - never write the solution
4. Return ONLY raw JSON matching this schema exactly:
{
  "understanding": "one sentence",
  "status": "correct|compile_error|runtime_error|timeout|wrong_answer|logic_error|incomplete|unknown",
  "bugDetected": true/false,
  "bugLocation": {"line": N, "code": "snippet", "reason": "why wrong"},
  "testCases": [{"input": "", "expectedOutput": "", "purpose": ""}],
  "failedReasoning": "full explanation",
  "hints": [{"level": 1, "hint": "conceptual"}, {"level": 2, "hint": "code region"}, {"level": 3, "hint": "correction direction"}],
  "suggestedFix": "conceptual change only",
  "confidence": 0.0
};

  const prompt = PROBLEM: 
LANGUAGE: 
CODE:
\\\

\\\
EXECUTION:
- Status: 
- Exit Code: 
- Stdout: 
- Stderr: 
- Timed Out: 

PREVIOUS HINTS (don't repeat, generate next deeper hints):


Return only raw JSON.;

  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + apiKey;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + prompt }] }],
            generationConfig: { temperature: 0.1 }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.status === 503 || response.status === 429) {
          console.warn('Gemini ' + modelName + ' returned ' + response.status + ' (attempt ' + attempt + '/3), retrying...');
          await new Promise(r => setTimeout(r, 800));
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          console.warn('Gemini ' + modelName + ' failed HTTP ' + response.status + ':', errBody.slice(0, 200));
          break;
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText) { console.warn('Gemini ' + modelName + ' empty content.'); break; }

        let parsed = null;
        try {
          const cleanJson = rawText.replace(/^`json\s*/i, '').replace(/`\s*$/i, '').trim();
          parsed = JSON.parse(cleanJson);
        } catch (e) {
          console.warn('Gemini ' + modelName + ' invalid JSON:', rawText.slice(0, 300));
          break;
        }

        if (!parsed.status || !Array.isArray(parsed.hints)) { console.warn('Gemini ' + modelName + ' incomplete schema.'); break; }

        let status = parsed.status || 'unknown';
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
      } catch (err) {
        if (err.name === 'AbortError') console.warn('Gemini ' + modelName + ' timed out.');
        else console.warn('Gemini ' + modelName + ' attempt ' + attempt + ' error:', err.message);
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  return { available: false, error: 'GEMINI_UNAVAILABLE: All models temporarily overloaded. Try again in a moment.', understanding: '', status: executionResult.status || 'unknown', bugDetected: false, bugLocation: null, testCases: [], failedReasoning: '', hints: [], suggestedFix: '', confidence: 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { problem, language, code, input, previousHints } = req.body;
    if (!language || !code) return res.status(400).json({ error: 'INVALID_CODE: Language and source code are required.' });

    const executionResult = await runStudentCode({ language, code, input });
    const analysisResult = await analyzeStudentSubmission({ problem, language, code, executionResult, previousHints });

    return res.status(200).json({ execution: executionResult, analysis: analysisResult });
  } catch (err) {
    return res.status(500).json({ error: 'EVALUATION_FAILED: ' + err.message });
  }
};
