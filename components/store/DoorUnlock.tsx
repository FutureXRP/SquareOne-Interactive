'use client'
import { useEffect, useRef, useState } from 'react'
import { card, INK, SUB, FAINT, GREEN } from '@/lib/theme'
import { supabase } from '@/lib/supabase'

type DoorState = 'idle' | 'unlocking' | 'open' | 'offline' | 'denied'

// Translate the failure into words that say which link is broken.
function offlineDetail(dashboardStatus: number | undefined): string {
  switch (dashboardStatus) {
    case 404: return 'The Dashboard app hasn’t been redeployed with the door update yet.'
    case 401: return 'The door secret doesn’t match between the two apps — re-copy DOOR_SERVICE_TOKEN.'
    case 501: return 'The Dashboard is missing its DOOR_SERVICE_TOKEN variable.'
    case 502: return 'The door hardware isn’t connected to the hub yet — scan your member card at the door.'
    case 0: return 'The Dashboard couldn’t be reached — double-check DASHBOARD_URL.'
    default: return 'The door system didn’t answer — scan your member card or see the front desk.'
  }
}

// The member's fitness-door button. Rendered only while a membership is
// current (active or paid-through-cancellation); the server re-checks the
// membership on every press, so the button is convenience — not the lock.
export function DoorUnlock({ memberName }: { memberName: string }) {
  const [state, setState] = useState<DoorState>('idle')
  const [seconds, setSeconds] = useState(7)
  const [detail, setDetail] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const unlock = async () => {
    if (state === 'unlocking' || state === 'open') return
    setState('unlocking')
    try {
      const { data } = await supabase().auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/door/unlock', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const json = (await res.json()) as { relockSeconds?: number }
        setSeconds(json.relockSeconds ?? 7)
        setState('open')
        timer.current = window.setTimeout(() => setState('idle'), (json.relockSeconds ?? 7) * 1000)
      } else if (res.status === 403) {
        setState('denied')
      } else if (res.status === 501) {
        setDetail('Door unlock isn’t configured on this deployment yet (DASHBOARD_URL / DOOR_SERVICE_TOKEN).')
        setState('offline')
      } else {
        const body = (await res.json().catch(() => ({}))) as { dashboardStatus?: number }
        setDetail(offlineDetail(body.dashboardStatus))
        setState('offline')
        timer.current = window.setTimeout(() => setState('idle'), 12000)
      }
    } catch {
      setDetail(offlineDetail(undefined))
      setState('offline')
      timer.current = window.setTimeout(() => setState('idle'), 12000)
    }
  }

  return (
    <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 24, background: state === 'open' ? '#e5f2ea' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: state === 'open' ? GREEN : '#eef4fb', color: state === 'open' ? '#fff' : '#2f6db8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {state === 'open' ? (
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><path d="M4.5 7V5a3.5 3.5 0 016.7-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><path d="M4.5 7V5a3.5 3.5 0 017 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/></svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: 0 }}>
            {state === 'open' ? 'Door unlocked — head on in!' : 'Fitness center door'}
          </p>
          <p style={{ fontSize: 12.5, color: SUB, margin: '2px 0 0', lineHeight: 1.5 }}>
            {state === 'open' && `It relocks itself in about ${seconds} seconds.`}
            {state === 'idle' && 'One tap opens the door once — no card scan needed.'}
            {state === 'unlocking' && 'Unlocking…'}
            {state === 'offline' && (detail || 'The door system didn’t answer — scan your member card or see the front desk.')}
            {state === 'denied' && 'This needs an active fitness membership.'}
          </p>
        </div>
        <button className={`sq-btn ${state === 'open' ? 'sq-btn-navy' : 'sq-btn-primary'}`} style={{ padding: '10px 22px', fontSize: 14 }}
          disabled={state === 'unlocking' || state === 'open'} onClick={unlock}>
          {state === 'unlocking' ? 'Unlocking…' : state === 'open' ? 'Unlocked ✓' : 'Unlock door'}
        </button>
      </div>
      <p style={{ fontSize: 10.5, color: FAINT, margin: '10px 0 0' }}>
        Each unlock is logged to building security under your name ({memberName}).
      </p>
    </div>
  )
}
