import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

export default function Blog() {
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let active = true
    fetch('/api/content/blog')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load')
        return res.json()
      })
      .then((data) => {
        if (!active) return
        setPosts(Array.isArray(data.posts) ? data.posts : [])
        setStatus('ready')
      })
      .catch(() => active && setStatus('error'))
    return () => {
      active = false
    }
  }, [])

  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="Insights"
          subtitle="On skills, hiring, and the future of work"
        />
      </section>

      <section className="pb-20 px-6 max-w-6xl mx-auto">
        {status === 'loading' && (
          <p className="text-center text-[var(--color-ink-muted)]">Loading insights…</p>
        )}
        {status === 'error' && (
          <p className="text-center text-[var(--color-ink-muted)]">
            Couldn’t load posts right now. Please try again later.
          </p>
        )}
        {status === 'ready' && posts.length === 0 && (
          <p className="text-center text-[var(--color-ink-muted)]">No posts published yet.</p>
        )}
        {status === 'ready' && posts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                to={`/research/blog/${post.slug}`}
                className="group bg-white rounded-2xl shadow-sm p-6 flex flex-col no-underline border-t-2 border-transparent hover:border-gold transition-colors"
              >
                <p className="text-xs font-semibold tracking-[0.15em] text-[var(--color-ink-muted)] uppercase mb-3">
                  {post.date}
                </p>
                <h3 className="text-xl font-bold text-[var(--color-ink)] mb-3 leading-snug">
                  {post.title}
                </h3>
                <p className="text-[var(--color-ink-muted)] leading-relaxed mb-6">{post.desc}</p>
                <span className="mt-auto text-gold font-semibold group-hover:translate-x-1 transition-transform">
                  Read more →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  )
}
