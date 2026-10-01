import { CalendarX } from 'lucide-react'
import { StateBlock } from './StateBlock.jsx'

// An entitlement (personal purchase or institution sponsorship) has ended.
// No prices are shown here (spec §38.3).
export function ExpiredEntitlementState({
  title = 'This access has ended',
  description = 'The assessment access for this workspace is no longer active. Your completed results are still yours.',
  action,
}) {
  return <StateBlock icon={CalendarX} tone="partial" title={title} description={description} action={action} />
}

export default ExpiredEntitlementState
