import { createClient } from '@supabase/supabase-js'

// Same live Supabase project the current hub and the People Directory use.
// This key is the public "anon/publishable" key. It's safe to ship in the
// browser bundle, all real access control happens in Supabase's Row Level
// Security policies, not in this file.
const SUPABASE_URL = 'https://dnympoqsnrlgsvhznsjb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5V2KZw1LVszoU1S-TNBbCg_H-Mdzo7g'

// Every request goes through here, which makes it the one place that can
// tell whether the network is genuinely reaching Supabase. The browser's
// own online flag only knows about the router, not about whether requests
// are actually getting through, which is the case that matters on patchy
// mobile data.
function trackedFetch(input, init) {
  return fetch(input, init)
    .then((res) => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ycdi:network-ok'))
      return res
    })
    .catch((err) => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ycdi:network-lost'))
      throw err
    })
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: trackedFetch },
})
