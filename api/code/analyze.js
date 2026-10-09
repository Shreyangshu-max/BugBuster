// Vercel Serverless Function: /api/code/analyze
// Gemini AI code analysis only - uses globalThis.fetch

async function analyzeStudentSubmission({ problem = '', language = 'python', code = '', executionResult = {}, previousHints = [] }) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return { available: false, error: 'GEMINI_API_KEY not configured.', understanding: '', status: 'unknown', bugDetected: false, bugLocation: null, testCases: [], failedReasoning: '', hints: [], suggestedFix: '', confidence: 0 };
  }

  const systemInstruction = You are a strict code evaluation engine and programming tutor.
Return ONLY raw JSON (no backticks, no markdown):
{
  "understanding": "one sentence about what problem requires vs what code does",
  "status": "correct|compile_error|runtime_error|timeout|wrong_answer|logic_error|incomplete|unknown",
  "bugDetected": true/false,
  "bugLocation": {"line": N, "code": "snippet", "reason": "why wrong"},
  "testCases": [{"input": "", "expectedOutput": "", "purpose": ""}],
  "failedReasoning": "full explanation of why code fails",
  "hints": [{"level": 1, "hint": "conceptual"}, {"level": 2, "hint": "code region"}, {"level": 3, "hint": "correction direction"}],
  "suggestedFix": "smallest conceptual change without writing solution",
  "confidence": 0.0
};

  const prompt = PROBLEM: 
LANGUAGE: 
CODE:\n\\\\n\n\\\
EXECUTION:
- Status: 
- Exit Code: 
- Stdout: 
- Stderr: 
PREVIOUS HINTS: 
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
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + prompt }] }], generationConfig: { temperature: 0.1 } }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.status === 503 || response.status === 429) { await new Promise(r => setTimeout(r, 800)); continue; }
        if (!response.ok) { const errBody = await response.text().catch(() => ''); console.warn('Gemini failed:', errBody.slice(0, 200)); break; }
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText) break;
        let parsed = null;
        try { const cleanJson = rawText.replace(/^`json\s*/i, '').replace(/`\s*$/i, '').trim(); parsed = JSON.parse(cleanJson); } catch (e) { break; }
        if (!parsed.status || !Array.isArray(parsed.hints)) break;
        let status = parsed.status || 'unknown';
        if (executionResult?.status === 'compile_error') status = 'compile_error';
        else if (executionResult?.status === 'timeout') status = 'timeout';
        else if (executionResult?.status === 'runtime_error' && status === 'correct') status = 'runtime_error';
        return { available: true, understanding: parsed.understanding || '', status, bugDetected: typeof parsed.bugDetected === 'boolean' ? parsed.bugDetected : status !== 'correct', bugLocation: parsed.bugLocation || null, testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [], failedReasoning: parsed.failedReasoning || '', hints: Array.isArray(parsed.hints) ? parsed.hints : [], suggestedFix: parsed.suggestedFix || '', confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9 };
      } catch (err) { await new Promise(r => setTimeout(r, 400)); }
    }
  }
  return { available: false, error: 'GEMINI_UNAVAILABLE: All models temporarily overloaded.', understanding: '', status: executionResult.status || 'unknown', bugDetected: false, bugLocation: null, testCases: [], failedReasoning: '', hints: [], suggestedFix: '', confidence: 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { problem, language, code, executionResult, previousHints } = req.body;
    const result = await analyzeStudentSubmission({ problem, language, code, executionResult, previousHints });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'GEMINI_ANALYSIS_FAILED: ' + err.message });
  }
};
