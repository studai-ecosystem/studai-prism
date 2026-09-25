import { Inbox } from 'lucide-react'
import { StateBlock } from './StateBlock.jsx'

export function EmptyState({ title, description, action, icon = Inbox, headingLevel }) {
  return <StateBlock icon={icon} title={title} description={description} action={action} headingLevel={headingLevel} />
}

export default EmptyState
