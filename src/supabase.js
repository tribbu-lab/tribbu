import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  "https://gctymjhblvocvaenmdhr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdHltamhibHZvY3ZhZW5tZGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTA0ODEsImV4cCI6MjA4ODcyNjQ4MX0.K_uMF5Kdk7udR--D9t4SCoYadPZ8XaiUchu0oGl_BhY"
)