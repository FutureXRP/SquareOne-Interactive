'use client'
import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase'

// Shared data hook for live reads: fetches once on mount, refetches when any
// of the given window events fire (stores emit them after writes), and
// exposes a manual reload. Returns `configured` so pages can render a
// friendly banner instead of crashing when env vars are missing.
export function useLive<T>(fetcher: () => Promise<T>, events: string[], initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const configured = isSupabaseConfigured()

  const reload = useCallback(() => {
    if (!configured) { setLoading(false); return }
    let on = true
    fetcher()
      .then((d) => { if (on) setData(d) })
      .catch((e) => console.error('[live]', e))
      .finally(() => { if (on) setLoading(false) })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  useEffect(() => {
    const cancel = reload()
    const handler = () => reload()
    for (const ev of events) window.addEventListener(ev, handler)
    return () => {
      if (typeof cancel === 'function') cancel()
      for (const ev of events) window.removeEventListener(ev, handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  return { data, loading, configured, reload }
}

// Small banner state helper for pages that need Supabase but don't have it.
export const NOT_CONFIGURED_MSG =
  'Supabase is not connected — add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.'
