import { Link } from 'react-router-dom'
import { Icon, SectionHeading } from '../components/ui'
import { posts } from '../data/site'

export default function Blog() {
  const [featured, ...rest] = posts

  return (
    <>
      <section className="page-hero page-hero--blog">
        <div className="container page-hero__inner">
          <span className="eyebrow">Journal</span>
          <h1>Latest blog posts &amp; news</h1>
          <p>
            Route ideas, car guides and the small habits that make every drive
            better — written by the people who hand over the keys.
          </p>
        </div>
      </section>

      <section className="section blog">
        <div className="container">
          <article className="blog-featured">
            <Link to={`/blog/${featured.slug}`} className="blog-featured__media">
              <img src={featured.image} alt={featured.title} />
              <span className="blog-card__category">{featured.category}</span>
            </Link>
            <div className="blog-featured__copy">
              <span className="blog-card__meta">{featured.date} · {featured.readTime}</span>
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
              <Link to={`/blog/${featured.slug}`} className="btn btn--ghost">
                Read the story <Icon name="arrow" />
              </Link>
            </div>
          </article>

          <div className="blog__grid">
            {rest.map((post) => (
              <article key={post.slug} className="blog-card">
                <Link to={`/blog/${post.slug}`} className="blog-card__media">
                  <img src={post.image} alt={post.title} loading="lazy" />
                  <span className="blog-card__category">{post.category}</span>
                </Link>
                <div className="blog-card__body">
                  <span className="blog-card__meta">{post.date} · {post.readTime}</span>
                  <h3><Link to={`/blog/${post.slug}`}>{post.title}</Link></h3>
                  <p>{post.excerpt}</p>
                  <Link to={`/blog/${post.slug}`} className="text-link">
                    Read more <Icon name="arrow" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section newsletter">
        <div className="container newsletter__inner">
          <div>
            <SectionHeading
              align="left"
              eyebrow="The short cut"
              title="One email a month. Only good drives."
              text="New routes, member prices and the occasional upgrade. No spam, unsubscribe whenever."
            />
          </div>
          <form className="newsletter__form" onSubmit={(event) => event.preventDefault()}>
            <label>
              Email address
              <input type="email" placeholder="you@example.com" required />
            </label>
            <button type="submit" className="btn btn--primary">
              Subscribe <Icon name="arrow" />
            </button>
          </form>
        </div>
      </section>
    </>
  )
}
