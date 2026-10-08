const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

const express = require('express');
const { runStudentCode } = require('./lib/services/onlineCompiler');
const { analyzeStudentSubmission } = require('./lib/services/geminiCodeAnalyzer');

const app = express();
const PORT = process.env.PORT || 4200;

app.use(express.json({ limit: '5mb' }));

// Public environment variables for client application
app.get('/env.js', (req, res) => {
  res.type('text/javascript');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
  res.send(`window.ENV = ${JSON.stringify({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey
  })};`);
});

app.use(express.static(path.join(__dirname, 'landing')));

// API Route 1: Run Student Code
app.post('/api/code/run', async (req, res) => {
  try {
    const { language, code, input } = req.body;
    if (!language || !code) {
      return res.status(400).json({ error: 'INVALID_CODE: Language and code are required.' });
    }
    const result = await runStudentCode({ language, code, input });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: `EXECUTION_SERVICE_UNAVAILABLE: ${err.message}` });
  }
});

// API Route 2: Gemini Code Analysis
app.post('/api/code/analyze', async (req, res) => {
  try {
    const { problem, language, code, executionResult, previousHints } = req.body;
    const result = await analyzeStudentSubmission({
      problem,
      language,
      code,
      executionResult,
      previousHints
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: `GEMINI_ANALYSIS_FAILED: ${err.message}` });
  }
});

// API Route 3: Combined Evaluation (Run + Analyze)
app.post('/api/code/evaluate', async (req, res) => {
  try {
    const { problem, language, code, input, previousHints } = req.body;
    if (!language || !code) {
      return res.status(400).json({ error: 'INVALID_CODE: Language and source code are required.' });
    }

    const executionResult = await runStudentCode({ language, code, input });
    const analysisResult = await analyzeStudentSubmission({
      problem,
      language,
      code,
      executionResult,
      previousHints
    });

    return res.json({
      execution: executionResult,
      analysis: analysisResult
    });
  } catch (err) {
    return res.status(500).json({ error: `EVALUATION_FAILED: ${err.message}` });
  }
});

// HTML page routes
app.get('/editor', (req, res) => res.sendFile(path.join(__dirname, 'landing', 'editor.html')));
app.get('/community', (req, res) => res.sendFile(path.join(__dirname, 'landing', 'community.html')));
app.get('/challenges', (req, res) => res.sendFile(path.join(__dirname, 'landing', 'challenges.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'landing', 'leaderboard.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'landing', 'dashboard.html')));
app.get('/recall', (req, res) => res.sendFile(path.join(__dirname, 'landing', 'recall.html')));

// Fallback HTML router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BugBuster Server running at http://localhost:${PORT}`);
});
