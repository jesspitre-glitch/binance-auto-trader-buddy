-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a scheduled job that calls scanner-keepalive every minute
SELECT cron.schedule(
  'scanner-keepalive-job',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://kgtrlsmhqtnwynpjnpnm.supabase.co/functions/v1/scanner-keepalive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHJsc21ocXRud3lucGpucG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyOTEsImV4cCI6MjA3Nzk0OTI5MX0.C-DQc4LPsUwyDFLLa-RpluvC5HsDucTTDv4q2NQPHEo'
    ),
    body := '{}'::jsonb
  );
  $$
);