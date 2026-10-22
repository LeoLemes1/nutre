import { createClient } from '@supabase/supabase-js';

// A chave anon é pública por definição. A proteção dos dados fica nas políticas RLS.
const SUPABASE_URL = 'https://rcfxfmcyoewoxokkhars.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjZnhmbWN5b2V3b3hva2toYXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2OTYyOTEsImV4cCI6MjEwODI3MjI5MX0.86Kz3JkkWFLbRQ7aoDjY2e7Fp2drhb4r65jns-ZtiDI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
