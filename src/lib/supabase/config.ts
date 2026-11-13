// Supabase self-hosted de Neura. La anon key es pública (va al navegador igual).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://api.neura.com.py";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0MTAxNDYxLCJleHAiOjE5MzE3ODE0NjF9.7_wAph8IolPMXtgfpezSwS5XR62IdD__qhqCywLDp3Q";
export const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "cameliaboutique";
export const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "cameliaboutique";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
