import { Link } from 'react-router-dom'
import { Icon } from '../components/ui'

export default function NotFound() {
  return (
    <section className="section empty-state">
      <div className="container">
        <span className="eyebrow">404</span>
        <h1>This road doesn’t go anywhere.</h1>
        <p>The page may have moved. Let’s get you back to something with four wheels.</p>
        <Link to="/" className="btn btn--primary">
          Back to home <Icon name="arrow" />
        </Link>
      </div>
    </section>
  )
}
