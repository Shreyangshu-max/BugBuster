import { NormalizedExecutionResult } from './onlineCompiler';

export interface GeminiAnalysisParams {
  problem?: string;
  language?: string;
  code?: string;
  executionResult?: Partial<NormalizedExecutionResult>;
  previousHints?: string[];
}

export interface GeminiAnalysisResult {
  understanding: string;
  status: 'correct' | 'compile_error' | 'runtime_error' | 'timeout' | 'wrong_answer' | 'logic_error' | 'incomplete' | 'unknown';
  bugDetected: boolean;
  bugLocation: {
    line: number;
    code: string;
    reason: string;
  };
  testCases: Array<{
    input: string;
    expectedOutput: string;
    purpose: string;
  }>;
  failedReasoning: string;
  hints: Array<{
    level: number;
    hint: string;
  }>;
  suggestedFix: string;
  confidence: number;
}

export async function analyzeStudentSubmission({
  problem = '',
  language = 'python',
  code = '',
  executionResult = {},
  previousHints = []
}: GeminiAnalysisParams): Promise<GeminiAnalysisResult> {
  const service = require('./geminiCodeAnalyzer');
  return service.analyzeStudentSubmission({ problem, language, code, executionResult, previousHints });
}
