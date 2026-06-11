import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageLayout from '../../components/PageLayout.jsx'

export default function BlogPost() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | error

  useEffect(() => {
    let active = true
    setStatus('loading')
    fetch(`/api/content/blog/${slug}`)
      .then((res) => {
        if (res.status === 404) {
          if (active) setStatus('notfound')
          return null
        }
        if (!res.ok) throw new Error('Failed')
        return res.json()
      })
      .then((data) => {
        if (!active || !data) return
        setPost(data.post)
        setStatus('ready')
      })
      .catch(() => active && setStatus('error'))
    return () => {
      active = false
    }
  }, [slug])

  return (
    <PageLayout>
      <article className="py-20 px-6 max-w-3xl mx-auto">
        <Link
          to="/research/blog"
          className="text-gold font-semibold no-underline hover:underline"
        >
          ← All insights
        </Link>

        {status === 'loading' && (
          <p className="mt-10 text-[#8A8FA0]">Loading…</p>
        )}
        {status === 'notfound' && (
          <p className="mt-10 text-[#8A8FA0]">That post could not be found.</p>
        )}
        {status === 'error' && (
          <p className="mt-10 text-[#8A8FA0]">
            Couldn’t load this post right now. Please try again later.
          </p>
        )}
        {status === 'ready' && post && (
          <>
            <p className="mt-10 text-xs font-semibold tracking-[0.15em] text-[#8A8FA0] uppercase mb-3">
              {post.date}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-[#0A0D14] mb-6 leading-tight">
              {post.title}
            </h1>
            <p className="text-lg text-[#5A5F6E] leading-relaxed mb-8">{post.desc}</p>
            <div className="prose text-[#2A2E3A] leading-relaxed whitespace-pre-line">
              {post.body}
            </div>
          </>
        )}
      </article>
    </PageLayout>
  )
}
