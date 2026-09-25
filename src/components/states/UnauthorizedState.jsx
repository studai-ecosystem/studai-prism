import { Lock } from 'lucide-react'
import { StateBlock } from './StateBlock.jsx'
import { LinkButton } from '../ui/Button.jsx'

// Deliberately does not say whether the resource exists (server returns 404
// for out-of-scope data; the UI mirrors that).
export function UnauthorizedState({ title = 'This page is not available', description = 'It may not exist, or your current workspace does not have access to it.', homeTo = '/app', homeLabel = 'Go to home' }) {
  return (
    <StateBlock icon={Lock} title={title} description={description} action={<LinkButton to={homeTo}>{homeLabel}</LinkButton>} />
  )
}

export default UnauthorizedState
