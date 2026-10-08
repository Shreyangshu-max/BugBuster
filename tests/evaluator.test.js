require('dotenv').config();
const { runStudentCode } = require('../lib/services/onlineCompiler');
const { analyzeStudentSubmission } = require('../lib/services/geminiCodeAnalyzer');

async function runTests() {
  console.log('========================================');
  console.log('  BugBuster Evaluation Test Suite');
  console.log('========================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] Test ${total}: ${name}\n  Error: ${err.message}`);
    }
  }

  // Test 1: Correct C++ program
  await test('Correct C++ program', async () => {
    const res = await runStudentCode({
      language: 'cpp',
      code: '#include <iostream>\nint main() { std::cout << "Hello C++" << std::endl; return 0; }'
    });
    if (!res.success || !res.output.includes('Hello C++')) {
      throw new Error(`Expected success output, got: ${JSON.stringify(res)}`);
    }
  });

  // Test 2: Correct Python program
  await test('Correct Python program', async () => {
    const res = await runStudentCode({
      language: 'python',
      code: 'print("Hello Python")'
    });
    if (!res.success || !res.output.includes('Hello Python')) {
      throw new Error(`Expected success output, got: ${JSON.stringify(res)}`);
    }
  });

  // Test 3: Compilation error
  await test('Compilation error handling', async () => {
    const res = await runStudentCode({
      language: 'cpp',
      code: 'int main() { std::cout << missing_variable; }'
    });
    if (res.status !== 'compile_error' && !res.error) {
      throw new Error(`Expected compile_error, got: ${res.status}`);
    }
  });

  // Test 4: Runtime error
  await test('Runtime error handling', async () => {
    const res = await runStudentCode({
      language: 'python',
      code: 'x = 1 / 0'
    });
    if (res.status !== 'runtime_error' && !res.error.includes('ZeroDivisionError')) {
      throw new Error(`Expected ZeroDivisionError, got: ${JSON.stringify(res)}`);
    }
  });

  // Test 5: Infinite loop / timeout handling
  await test('Infinite loop / timeout handling', async () => {
    const res = await runStudentCode({
      language: 'python',
      code: 'while True: pass'
    });
    if (!res.timedOut && res.status !== 'timeout') {
      throw new Error(`Expected timeout, got status: ${res.status}`);
    }
  });

  // Test 6: Wrong answer analysis
  await test('Wrong answer Gemini analysis', async () => {
    const analysis = await analyzeStudentSubmission({
      problem: 'Return the sum of two numbers.',
      language: 'python',
      code: 'def add(a, b): return a - b',
      executionResult: { output: '-1\n', status: 'success', exitCode: 0 }
    });
    if (!analysis || typeof analysis.bugDetected !== 'boolean') {
      throw new Error('Analysis result structure invalid');
    }
  });

  // Test 7: Logic error analysis
  await test('Logic error progressive hints', async () => {
    const analysis = await analyzeStudentSubmission({
      problem: 'Find maximum element in array',
      language: 'python',
      code: 'def getMax(arr): return arr[0]',
      executionResult: { output: '1\n', status: 'success' }
    });
    if (!Array.isArray(analysis.hints) || analysis.hints.length === 0) {
      throw new Error('Hints array missing');
    }
  });

  // Test 8: Empty input handling
  await test('Empty input handling', async () => {
    const res = await runStudentCode({
      language: 'python',
      code: 'import sys\nprint("Input size:", len(sys.stdin.read()))',
      input: ''
    });
    if (!res.output.includes('Input size: 0')) {
      throw new Error(`Expected 0 input size, got: ${res.output}`);
    }
  });

  // Test 9: Invalid language
  await test('Invalid language rejection', async () => {
    const res = await runStudentCode({
      language: 'brainfuck',
      code: '+++'
    });
    if (res.status !== 'error' || !res.error.includes('INVALID_LANGUAGE')) {
      throw new Error(`Expected INVALID_LANGUAGE, got: ${res.error}`);
    }
  });

  // Test 10: OnlineCompiler API failure fallback
  await test('OnlineCompiler API graceful fallback', async () => {
    const res = await runStudentCode({
      language: '',
      code: ''
    });
    if (res.success !== false) {
      throw new Error('Should safely fail on empty inputs');
    }
  });

  // Test 11: Gemini API failure fallback
  await test('Gemini API graceful fallback', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'invalid_key';
    const analysis = await analyzeStudentSubmission({
      problem: 'Test problem',
      language: 'python',
      code: 'print(1)'
    });
    process.env.GEMINI_API_KEY = prevKey;
    if (!analysis || !analysis.hints) {
      throw new Error('Fallback analysis structure missing');
    }
  });

  // Test 12: Missing environment variables handling
  await test('Missing environment variables safety', async () => {
    const prevKey = process.env.ONLINECOMPILER_API_KEY;
    delete process.env.ONLINECOMPILER_API_KEY;
    const res = await runStudentCode({
      language: 'python',
      code: 'print("env check")'
    });
    process.env.ONLINECOMPILER_API_KEY = prevKey;
    if (typeof res !== 'object') {
      throw new Error('Expected object result');
    }
  });

  console.log(`\n========================================`);
  console.log(`  Results: ${passed} / ${total} tests passed.`);
  console.log(`========================================\n`);
}

runTests();
