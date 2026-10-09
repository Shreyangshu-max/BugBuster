// Vercel Serverless Function: /api/code/run
// Runs student code via OnlineCompiler.io - uses globalThis.fetch (no node-fetch needed)

const COMPILER_MAP = {
  c: 'gcc-15', cpp: 'g++-15', c_cpp: 'g++-15',
  java: 'openjdk-25', python: 'python-3.14', python3: 'python-3.14',
  javascript: 'nodejs-22', js: 'nodejs-22'
};

async function runStudentCode({ language, code, input = '' }) {
  if (!language || typeof language !== 'string')
    return { success: false, status: 'error', output: '', error: 'INVALID_LANGUAGE: Language must be specified.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };

  const compiler = COMPILER_MAP[language.toLowerCase().trim()];
  if (!compiler)
    return { success: false, status: 'error', output: '', error: 'INVALID_LANGUAGE: Unsupported language.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };

  if (!code || !code.trim())
    return { success: false, status: 'error', output: '', error: 'INVALID_CODE: Source code cannot be empty.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };

  const apiKey = (process.env.ONLINECOMPILER_API_KEY || '').trim();
  if (!apiKey)
    return { success: false, status: 'error', output: '', error: 'EXECUTION_SERVICE_UNAVAILABLE: ONLINECOMPILER_API_KEY not configured.', exitCode: 1, timedOut: false, executionTime: 0, memory: 0 };

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
      return { success: false, status: 'error', output: '', error: 'EXECUTION_SERVICE_UNAVAILABLE: OnlineCompiler returned ' + response.status, exitCode: response.status, timedOut: false, executionTime: 0, memory: 0 };
    }

    const data = await response.json();
    const output = data.output || data.stdout || '';
    const error = data.error || data.stderr || data.compilation_error || '';
    const exitCode = typeof data.exit_code === 'number' ? data.exit_code : (error ? 1 : 0);
    const executionTime = data.execution_time || data.time || 0;
    const memory = data.memory || 0;
    const isTimeout = data.timeout || data.status === 'timeout' || exitCode === 124 || exitCode === 137 || (typeof executionTime === 'number' && executionTime >= 4.0);
    const isCompileError = !!data.compilation_error || (exitCode !== 0 && error.toLowerCase().includes('compilation'));
    let status = 'success';
    if (isTimeout) status = 'timeout';
    else if (isCompileError) status = 'compile_error';
    else if (exitCode !== 0 || error) status = 'runtime_error';
    return { success: status === 'success', status, output, error, exitCode, signal: data.signal || null, timedOut: isTimeout, executionTime: typeof executionTime === 'number' ? parseFloat(executionTime.toFixed(3)) : 0, memory: typeof memory === 'number' ? Math.round(memory) : 0 };
  } catch (err) {
    if (err.name === 'AbortError')
      return { success: false, status: 'timeout', output: '', error: 'EXECUTION_TIMEOUT: Request timed out after 15 seconds.', exitCode: 124, timedOut: true, executionTime: 15, memory: 0 };
    return { success: false, status: 'error', output: '', error: 'EXECUTION_SERVICE_UNAVAILABLE: ' + err.message, exitCode: 500, timedOut: false, executionTime: 0, memory: 0 };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { language, code, input } = req.body;
    if (!language || !code) return res.status(400).json({ error: 'INVALID_CODE: Language and code are required.' });
    const result = await runStudentCode({ language, code, input });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'EXECUTION_SERVICE_UNAVAILABLE: ' + err.message });
  }
};
