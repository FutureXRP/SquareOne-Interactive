'use client'
import { useState } from 'react'
import { PlanCards } from '@/components/store/PlanCards'
import { PromoBox } from '@/components/store/PromoBox'

// Promo box above the plans: a code entered here is carried into signup
// and applied at checkout.
export function PlanPicker() {
  const [code, setCode] = useState('')
  return (
    <>
      <PromoBox onApplied={(c) => setCode(c)} />
      <PlanCards promoCode={code || undefined} />
    </>
  )
}
