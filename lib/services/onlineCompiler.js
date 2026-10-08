const fetch = require('node-fetch');

/**
 * OnlineCompiler.io execution service
 * Standardized mapping & execution safety wrapper.
 */

const COMPILER_MAP = {
  c: 'gcc-15',
  cpp: 'g++-15',
  c_cpp: 'g++-15',
  java: 'openjdk-25',
  python: 'python-3.14',
  python3: 'python-3.14',
  javascript: 'nodejs-22',
  js: 'nodejs-22'
};

/**
 * Run student code through OnlineCompiler.io API safely.
 * @param {Object} params
 * @param {string} params.language
 * @param {string} params.code
 * @param {string} [params.input]
 * @returns {Promise<Object>} Normalized execution result
 */
async function runStudentCode({ language, code, input = '' }) {
  // 1. Validation & Input Sanitization
  if (!language || typeof language !== 'string') {
    return {
      success: false,
      status: 'error',
      output: '',
      error: 'INVALID_LANGUAGE: Language must be specified.',
      exitCode: 1,
      signal: null,
      timedOut: false,
      executionTime: 0,
      memory: 0
    };
  }

  const normalizedLang = language.toLowerCase().trim();
  const compiler = COMPILER_MAP[normalizedLang];

  if (!compiler) {
    return {
      success: false,
      status: 'error',
      output: '',
      error: `INVALID_LANGUAGE: Unsupported language '${language}'. Allowed: ${Object.keys(COMPILER_MAP).join(', ')}`,
      exitCode: 1,
      signal: null,
      timedOut: false,
      executionTime: 0,
      memory: 0
    };
  }

  if (!code || typeof code !== 'string' || !code.trim()) {
    return {
      success: false,
      status: 'error',
      output: '',
      error: 'INVALID_CODE: Source code cannot be empty.',
      exitCode: 1,
      signal: null,
      timedOut: false,
      executionTime: 0,
      memory: 0
    };
  }

  // Code size safety cap (100 KB max)
  if (code.length > 100000) {
    return {
      success: false,
      status: 'error',
      output: '',
      error: 'INVALID_CODE: Source code exceeds maximum allowable size (100 KB).',
      exitCode: 1,
      signal: null,
      timedOut: false,
      executionTime: 0,
      memory: 0
    };
  }

  const apiKey = process.env.ONLINECOMPILER_API_KEY;

  try {
    const response = await fetch('https://api.onlinecompiler.io/api/run-code-sync/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({
        compiler,
        code,
        input: input || ''
      }),
      timeout: 15000 // 15s API timeout safety
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        success: false,
        status: response.status === 429 ? 'rate_limited' : 'error',
        output: '',
        error: `EXECUTION_SERVICE_UNAVAILABLE: OnlineCompiler returned status ${response.status} (${errText || response.statusText})`,
        exitCode: response.status,
        signal: null,
        timedOut: false,
        executionTime: 0,
        memory: 0
      };
    }

    const data = await response.json();

    // Normalize OnlineCompiler API response
    const output = data.output || data.stdout || '';
    const error = data.error || data.stderr || data.compilation_error || '';
    const exitCode = typeof data.exit_code === 'number' ? data.exit_code : (error ? 1 : 0);
    const executionTime = data.execution_time || data.time || 0;
    const memory = data.memory || 0;

    const isTimeout = data.timeout || data.status === 'timeout' || exitCode === 124 || error.toLowerCase().includes('timed out');
    const isCompileError = !!data.compilation_error || (exitCode !== 0 && error.toLowerCase().includes('compilation'));

    let status = 'success';
    if (isTimeout) status = 'timeout';
    else if (isCompileError) status = 'compile_error';
    else if (exitCode !== 0 || error) status = 'runtime_error';

    return {
      success: status === 'success',
      status,
      output,
      error,
      exitCode,
      signal: data.signal || null,
      timedOut: isTimeout,
      executionTime: typeof executionTime === 'number' ? parseFloat(executionTime.toFixed(3)) : 0,
      memory: typeof memory === 'number' ? Math.round(memory) : 0
    };

  } catch (err) {
    if (err.name === 'FetchError' && err.message.includes('timeout')) {
      return {
        success: false,
        status: 'timeout',
        output: '',
        error: 'EXECUTION_TIMEOUT: OnlineCompiler request timed out after 15 seconds.',
        exitCode: 124,
        signal: null,
        timedOut: true,
        executionTime: 15,
        memory: 0
      };
    }

    return {
      success: false,
      status: 'error',
      output: '',
      error: `EXECUTION_SERVICE_UNAVAILABLE: Failed to reach OnlineCompiler service (${err.message})`,
      exitCode: 500,
      signal: null,
      timedOut: false,
      executionTime: 0,
      memory: 0
    };
  }
}

module.exports = {
  runStudentCode,
  COMPILER_MAP
};
