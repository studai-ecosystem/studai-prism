// Honest placeholder for a work material that cannot be shown. Never
// substitutes sample content.
export function ArtifactUnavailable({ title }) {
  return (
    <div role="status" className="rounded-[var(--prism-radius-lg)] border border-dashed border-prism-border p-6 text-sm text-prism-ink-muted">
      {title ? `${title}: ` : ''}this work material cannot be displayed. Continue in the conversation.
    </div>
  )
}

export default ArtifactUnavailable
