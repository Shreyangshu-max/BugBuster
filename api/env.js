// Vercel Serverless Function: /api/env.js
// Serves public environment variables to the browser client
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/javascript');
  res.setHeader('Cache-Control', 'no-store');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
  res.send('window.ENV = ' + JSON.stringify({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey
  }) + ';');
};
