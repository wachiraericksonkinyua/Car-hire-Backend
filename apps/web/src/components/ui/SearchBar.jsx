import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui'

const locations = ['San Francisco', 'Los Angeles', 'New York', 'Miami', 'Lisbon', 'Nairobi']

const today = new Date()
const iso = (date) => date.toISOString().slice(0, 10)
const inDays = (days) => {
  const date = new Date(today)
  date.setDate(date.getDate() + days)
  return iso(date)
}

export default function SearchBar({ variant = 'hero' }) {
  const navigate = useNavigate()
  const [location, setLocation] = useState(locations[0])
  const [pickup, setPickup] = useState(inDays(1))
  const [dropoff, setDropoff] = useState(inDays(4))

  const onSubmit = (event) => {
    event.preventDefault()
    navigate(`/vehicles/mercedes-c-class?location=${encodeURIComponent(location)}`)
  }

  return (
    <form className={`search-bar search-bar--${variant}`} onSubmit={onSubmit}>
      <label className="search-bar__field search-bar__field--wide">
        <span><Icon name="pin" /> Pick-up location</span>
        <select value={location} onChange={(event) => setLocation(event.target.value)}>
          {locations.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
      </label>
      <label className="search-bar__field">
        <span><Icon name="calendar" /> Pick-up date</span>
        <input type="date" value={pickup} min={iso(today)} onChange={(event) => setPickup(event.target.value)} />
      </label>
      <label className="search-bar__field">
        <span><Icon name="calendar" /> Return date</span>
        <input type="date" value={dropoff} min={pickup} onChange={(event) => setDropoff(event.target.value)} />
      </label>
      <button type="submit" className="btn btn--primary search-bar__submit">
        Search cars <Icon name="arrow" />
      </button>
    </form>
  )
}
