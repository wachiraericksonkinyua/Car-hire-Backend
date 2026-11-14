import { Link, useParams } from 'react-router-dom'
import { Icon, SectionHeading } from '../components/ui'
import { posts } from '../data/site'

const bodies = {
  'road-trip-checklist': [
    ['Start with the boring bits', 'Check your tyre pressures cold, top up the washer fluid and make sure both keys are accounted for. Ten minutes in the driveway beats an hour on the hard shoulder. Photograph the fuel gauge and the four corners of the car before you pull away — it makes the return handover painless.'],
    ['Pack for the drive, not just the destination', 'A refillable water bottle, a phone cable that actually reaches the back seat and a jumper for the passenger who always runs cold. If you are crossing a border, keep the rental documents and your licence in the glovebox rather than the boot.'],
    ['Plan two stops, not twenty', 'Pick one coffee stop and one proper leg-stretch. Roadside attractions are better when they are discovered, but a six-hour drive with no plan for lunch is a six-hour drive with a hungry back seat. Download the route offline and screenshot the booking confirmation.'],
  ],
  'suv-vs-sedan': [
    ['Choose the sedan when the road is the point', 'Sedans are quieter, sip less fuel and fit into city car parks without a three-point shuffle. If your trip is two people, two bags and a mix of motorway and downtown, the sedan is almost always the better drive.'],
    ['Choose the SUV when the boot is the point', 'Four passengers, a pram and a week of luggage? The extra height and squared-off boot make the difference. SUVs also handle gravel access roads and winter weather with more confidence — just check the height restriction before booking a city-centre hotel garage.'],
    ['The honest tie-breaker', 'Count the bags, not the seats. Then ask whether you will parallel park at your destination. Those two answers settle it more often than any spec sheet.'],
  ],
  'city-driving-tips': [
    ['Smooth is fast', 'Look two cars ahead and lift off early. Braking late and accelerating hard feels quick but burns fuel and patience in equal measure. Keep a steady throttle over crests and let the car roll into junctions.'],
    ['Know the parking rules before you leave', 'A cheap rental becomes expensive with a clamp. Check the zone, the payment app and the height limit before you drive into a garage. Photograph the bay number — multi-storey car parks all look alike at 11pm.'],
    ['Give the car back the way you found it', 'Fill the tank within five kilometres of the return point, clear your rubbish and keep the receipt. A clean, full car is the fastest possible check-in and the best way to avoid a cleaning fee.'],
  ],
}

export default function BlogPost() {
  const { slug } = useParams()
  const post = posts.find((item) => item.slug === slug)
  const sections = bodies[slug]

  if (!post || !sections) {
    return (
      <section className="section empty-state">
        <div className="container">
          <span className="eyebrow">Journal</span>
          <h1>That story has moved on.</h1>
          <p>Browse the latest guides and road-trip ideas from the DriveX team.</p>
          <Link to="/blog" className="btn btn--primary">
            Back to the journal <Icon name="arrow" />
          </Link>
        </div>
      </section>
    )
  }

  const more = posts.filter((item) => item.slug !== slug)

  return (
    <>
      <article className="article">
        <div className="container article__head">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/blog">Journal</Link>
            <span>/</span>
            <span>{post.category}</span>
          </nav>
          <span className="eyebrow">{post.category}</span>
          <h1>{post.title}</h1>
          <div className="article__meta">
            <img src="/images/media/avatar-2.jpg" alt="" />
            <div>
              <strong>DriveX editorial</strong>
              <span>{post.date} · {post.readTime}</span>
            </div>
          </div>
        </div>

        <div className="container">
          <img className="article__cover" src={post.image} alt={post.title} />
          <div className="article__body">
            {sections.map(([heading, text]) => (
              <div key={heading}>
                <h2>{heading}</h2>
                <p>{text}</p>
              </div>
            ))}
            <p className="article__note">
              Planning a trip? Our team can match a car to your route, luggage and
              parking situation in under five minutes.
            </p>
            <Link to="/contact" className="btn btn--primary">
              Talk to the team <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </article>

      <section className="section article-more">
        <div className="container">
          <SectionHeading align="left" eyebrow="Keep reading" title="More from the journal" />
          <div className="blog__grid">
            {more.map((item) => (
              <article key={item.slug} className="blog-card">
                <Link to={`/blog/${item.slug}`} className="blog-card__media">
                  <img src={item.image} alt={item.title} loading="lazy" />
                  <span className="blog-card__category">{item.category}</span>
                </Link>
                <div className="blog-card__body">
                  <span className="blog-card__meta">{item.date} · {item.readTime}</span>
                  <h3><Link to={`/blog/${item.slug}`}>{item.title}</Link></h3>
                  <p>{item.excerpt}</p>
                  <Link to={`/blog/${item.slug}`} className="text-link">
                    Read more <Icon name="arrow" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
