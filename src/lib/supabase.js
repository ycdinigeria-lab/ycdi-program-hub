import { createClient } from '@supabase/supabase-js'

// Same live Supabase project the current hub and the People Directory use.
// This key is the public "anon/publishable" key. It's safe to ship in the
// browser bundle, all real access control happens in Supabase's Row Level
// Security policies, not in this file.
const SUPABASE_URL = 'https://dnympoqsnrlgsvhznsjb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5V2KZw1LVszoU1S-TNBbCg_H-Mdzo7g'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
