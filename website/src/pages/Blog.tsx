import { blogCopy } from './BlogCopy'
import type { Copy, Language } from '../content'
import { OutlineNav, PageShell, useActiveHeading } from '../ui'

export function BlogPage({ t, language, subId }: { t: Copy; language: Language; subId?: string }) {
  const blog = blogCopy(language)
  const posts = blog.posts
  const activeId = useActiveHeading(posts.map((post) => `post-${post.id}`))

  return <PageShell
    left={<OutlineNav
      items={posts.map((post) => ({ id: `post-${post.id}`, label: post.title }))}
      activeId={activeId} />}>
    <header className="page-head"><h1>{blog.title}</h1><p>{blog.subtitle}</p></header>
    {posts.map((post) => <article key={post.id} id={`post-${post.id}`} className="blog-post">
      <time>{post.date}</time>
      <h2>{post.title}</h2>
      {post.sections.map((section) => <section key={section.id} className="doc-section">
        <h3>{section.heading}</h3>
        {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </section>)}
    </article>)}
  </PageShell>
}
