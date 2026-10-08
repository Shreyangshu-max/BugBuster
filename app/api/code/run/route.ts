import { runStudentCode } from '../../../../lib/services/onlineCompiler';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { language, code, input } = body;

    if (!language || !code) {
      return new Response(
        JSON.stringify({ error: 'INVALID_CODE: Language and code are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await runStudentCode({ language, code, input });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `EXECUTION_SERVICE_UNAVAILABLE: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
