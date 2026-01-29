import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://rscapevxlkaxqcqtadud.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzY2FwZXZ4bGtheHFjcXRhZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzkzNzEsImV4cCI6MjA4NDYxNTM3MX0.JdlGwKouc9SR10yhFN9jsUY7iSX8SoRjLq5yue8mdgY";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
