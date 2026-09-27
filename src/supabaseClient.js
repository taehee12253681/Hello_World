import { createClient } from '@supabase/supabase-js';

// .env(.env.example 참고)에서 값을 읽어온다. 팀원마다 .env 파일을 각자 만들어야 한다.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
