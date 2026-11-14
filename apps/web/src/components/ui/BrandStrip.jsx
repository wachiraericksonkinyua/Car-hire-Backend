import { brands } from '../../data/site'

export default function BrandStrip() {
  return (
    <section className="brand-strip" aria-label="Brands in our fleet">
      <div className="container">
        <p className="brand-strip__label">Trusted by drivers · 6 of the world’s best makers</p>
        <div className="brand-strip__row">
          {brands.map((brand) => (
            <div key={brand.name} className="brand-strip__item" title={brand.name}>
              <img src={brand.logo} alt={brand.name} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
