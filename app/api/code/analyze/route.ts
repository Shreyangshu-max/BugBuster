import { analyzeStudentSubmission } from '../../../../lib/services/geminiCodeAnalyzer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { problem, language, code, executionResult, previousHints } = body;

    const result = await analyzeStudentSubmission({
      problem,
      language,
      code,
      executionResult,
      previousHints
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `GEMINI_ANALYSIS_FAILED: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
