import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Search, MapPin, CalendarDays, Ticket,
  Music2, Trophy, Laugh, Laptop, Flame, Menu, X,
  Heart, Sparkles, RefreshCw, AlertCircle
} from 'lucide-react'
import api from './lib/api'

type ApiEvent = {
  id: string
  title: string
  description?: string | null
  venue: string
  startsAt: string
  totalSeats: number
  availableSeats: number
  priceInPaise: number
  isCancelled: boolean
}

type EventCategory = 'Concerts' | 'Sports' | 'Comedy' | 'Tech' | 'Other'

type FlashEvent = ApiEvent & {
  category: EventCategory
  date: string
  price: number
  image: string
  tag: string
}

const categoryImages: Record<EventCategory, string> = {
  Concerts: 'photo-1459749411175-04bf5292ceea',
  Sports: 'photo-1531415074968-036ba1b575da',
  Comedy: 'photo-1585699324551-f6c309eedeca',
  Tech: 'photo-1540575467063-178a50c2df87',
  Other: 'photo-1492684223066-81342ee5ff30',
}

const categories = [
  { name: 'All events', icon: Sparkles },
  { name: 'Concerts', icon: Music2 },
  { name: 'Sports', icon: Trophy },
  { name: 'Comedy', icon: Laugh },
  { name: 'Tech', icon: Laptop },
]

function inferCategory(event: ApiEvent): EventCategory {
  const text = `${event.title} ${event.description ?? ''}`.toLowerCase()
  if (/concert|music|festival|singer|dj|band/.test(text)) return 'Concerts'
  if (/cricket|football|sport|match|tournament|stadium/.test(text)) return 'Sports'
  if (/comedy|comic|stand.?up|laugh/.test(text)) return 'Comedy'
  if (/tech|technology|conference|summit|ai |artificial intelligence|developer|web development/.test(text)) return 'Tech'
  return 'Other'
}

function formatEventDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  const day = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date).toUpperCase()
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date).toUpperCase()
  return `${day} · ${time}`
}

function normalizeEvent(event: ApiEvent): FlashEvent {
  const category = inferCategory(event)
  const available = Math.max(0, Math.min(event.availableSeats, event.totalSeats))
  return {
    ...event,
    availableSeats: available,
    category,
    date: formatEventDate(event.startsAt),
    price: event.priceInPaise / 100,
    image: categoryImages[category],
    tag: event.isCancelled ? 'CANCELLED' : available <= 10 ? 'SELLING FAST' : '',
  }
}

function App() {
  const [events, setEvents] = useState<FlashEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeCategory, setActiveCategory] = useState('All events')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('Lucknow')
  const [selectedEvent, setSelectedEvent] = useState<FlashEvent | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)

  async function loadEvents() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await api.get('/events')
      const payload = response.data
      if (payload?.success !== true || !Array.isArray(payload.data)) {
        throw new Error('The events API returned an unexpected response.')
      }
      setEvents(payload.data.map((event: ApiEvent) => normalizeEvent(event)))
    } catch (error) {
      console.error('Failed to load events:', error)
      setLoadError(
        'We could not load events. Check that your backend is running on port 5000 and that its CORS settings allow the frontend.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  const filteredEvents = useMemo(() => events.filter((event) => {
    const matchesCategory =
      activeCategory === 'All events' || event.category === activeCategory
    const matchesSearch =
      `${event.title} ${event.category} ${event.venue} ${event.description ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    const matchesCity =
      !city.trim() || `${event.venue}`.toLowerCase().includes(city.trim().toLowerCase())
    return matchesCategory && matchesSearch && matchesCity
  }), [events, activeCategory, search, city])

  const availableQuantity = selectedEvent
    ? Math.max(0, Math.min(10, selectedEvent.availableSeats))
    : 0

  function openEvent(event: FlashEvent) {
    setSelectedEvent(event)
    setQuantity(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#07111f] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#07111f]/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <button
            onClick={() => { setSelectedEvent(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="flex items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6b35] text-white shadow-lg shadow-orange-500/20">
              <Ticket size={23} />
            </span>
            <span className="text-left">
              <span className="block text-xl font-black tracking-tight">Flash<span className="text-[#ff784b]">Sale</span></span>
              <span className="block text-[9px] font-bold tracking-[0.25em] text-slate-500">LIVE THE MOMENT.</span>
            </span>
          </button>

          <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
            <a href="#events" className="transition hover:text-white">Explore</a>
            <a href="#categories" className="transition hover:text-white">Categories</a>
            <button onClick={() => alert('My Tickets will connect to your account API next.')} className="transition hover:text-white">My tickets</button>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button onClick={() => alert('Authentication page coming next.')} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white">
              Log in
            </button>
            <button onClick={() => alert('Authentication page coming next.')} className="rounded-xl bg-[#ff6b35] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ff8052]">
              Get started <ArrowRight className="ml-1 inline" size={16} />
            </button>
          </div>

          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </nav>
        {menuOpen && (
          <div className="grid gap-4 border-t border-white/10 px-6 py-5 text-sm text-slate-300 md:hidden">
            <a href="#events" onClick={() => setMenuOpen(false)}>Explore events</a>
            <a href="#categories" onClick={() => setMenuOpen(false)}>Categories</a>
            <button onClick={() => alert('Authentication page coming next.')}>Log in / Sign up</button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-5 lg:px-8">
        {selectedEvent ? (
          <section className="py-10">
            <button onClick={() => setSelectedEvent(null)} className="mb-6 text-sm text-slate-400 hover:text-white">← Back to events</button>
            <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <img
                  src={`https://images.unsplash.com/${selectedEvent.image}?auto=format&fit=crop&w=1400&q=85`}
                  alt={selectedEvent.title}
                  className="h-72 w-full rounded-3xl object-cover sm:h-[430px]"
                />
                <p className="mt-7 text-sm font-bold uppercase tracking-widest text-[#ff784b]">{selectedEvent.category}</p>
                <h1 className="mt-2 text-3xl font-black sm:text-5xl">{selectedEvent.title}</h1>
                <p className="mt-4 flex items-center gap-2 text-slate-400"><MapPin size={17} />{selectedEvent.venue}</p>
                <p className="mt-3 flex items-center gap-2 text-slate-400"><CalendarDays size={17} />{selectedEvent.date}</p>
                <p className="mt-3 text-sm text-slate-500">{selectedEvent.availableSeats} tickets currently shown as available</p>
                <p className="mt-7 max-w-2xl leading-7 text-slate-400">
                  {selectedEvent.description || 'Get ready for an unforgettable experience. Discover the atmosphere, bring your friends, and make this a moment worth remembering.'}
                </p>
              </div>
              <div className="h-fit rounded-3xl border border-white/10 bg-[#101d2e] p-6 sm:p-8">
                <p className="text-sm text-slate-400">Tickets starting from</p>
                <p className="mt-1 text-4xl font-black">₹{selectedEvent.price.toLocaleString('en-IN')}</p>
                <div className="my-7 h-px bg-white/10" />
                <label className="text-sm font-semibold">Number of tickets</label>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 p-3">
                  <span className="text-slate-400">Quantity</span>
                  <div className="flex items-center gap-5">
                    <button disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="h-8 w-8 rounded-lg bg-white/10 disabled:opacity-40">−</button>
                    <span>{quantity}</span>
                    <button disabled={quantity >= availableQuantity} onClick={() => setQuantity(Math.min(availableQuantity, quantity + 1))} className="h-8 w-8 rounded-lg bg-white/10 disabled:opacity-40">+</button>
                  </div>
                </div>
                <div className="my-6 flex justify-between text-sm">
                  <span className="text-slate-400">Total (before fees)</span>
                  <span className="font-bold">₹{(selectedEvent.price * quantity).toLocaleString('en-IN')}</span>
                </div>
                <button
                  disabled={selectedEvent.isCancelled || availableQuantity === 0}
                  onClick={() => alert('Next we will connect this button to your booking API and Razorpay.')}
                  className="w-full rounded-xl bg-[#ff6b35] py-4 font-bold transition hover:bg-[#ff8052] disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {selectedEvent.isCancelled ? 'Event cancelled' : availableQuantity === 0 ? 'Sold out' : <>Continue to booking <ArrowRight className="ml-2 inline" size={17} /></>}
                </button>
                <p className="mt-4 text-center text-xs text-slate-500">Secure checkout · Final availability is checked by the server</p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="relative py-12 sm:py-16 lg:py-20">
              <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-orange-500/[0.08] blur-[120px]" />
              <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
                <div>
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.08] px-3.5 py-2 text-xs font-bold tracking-wide text-[#ff946d]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff6b35]" />
                    YOUR CITY. YOUR NEXT BIG MOMENT.
                  </div>
                  <h1 className="max-w-2xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                    Make plans.<br />Make <span className="text-[#ff784b]">memories.</span>
                  </h1>
                  <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">
                    From front-row nights to unforgettable match days. Your next favourite experience starts here.
                  </p>
                  <a href="#events" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#ff6b35] px-6 py-4 font-bold text-white shadow-xl shadow-orange-950/30 transition hover:-translate-y-0.5 hover:bg-[#ff8052]">
                    Explore events <ArrowRight size={18} />
                  </a>
                  <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-500">
                    <span><span className="mr-2 text-[#ff784b]">✦</span>Easy booking</span>
                    <span><span className="mr-2 text-[#ff784b]">✦</span>Secure payments</span>
                    <span><span className="mr-2 text-[#ff784b]">✦</span>Moments that matter</span>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-orange-500/20 to-transparent blur-2xl" />
                  <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#101d2e] p-2">
                    <img
                      src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=90"
                      alt="Crowd enjoying a live music concert"
                      className="h-[300px] w-full rounded-[1.2rem] object-cover sm:h-[390px]"
                    />
                    <div className="absolute inset-x-2 bottom-2 rounded-b-[1.2rem] bg-gradient-to-t from-black/90 via-black/45 to-transparent p-6 pt-20">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <span className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[#ff6b35] px-2 py-1 text-[10px] font-black tracking-wider"><Flame size={12} /> HOT RIGHT NOW</span>
                          <h2 className="text-2xl font-extrabold">Feel the energy.</h2>
                          <p className="mt-1 text-sm text-slate-300">Your next live experience awaits.</p>
                        </div>
                        <span className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur"><ArrowRight /></span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute -left-5 top-8 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#111f31]/95 p-3 shadow-2xl sm:flex">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-[#ff784b]"><Ticket /></span>
                    <div><p className="text-xs text-slate-400">Your next memory</p><p className="text-sm font-bold">Starts right here</p></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="pb-8" id="categories">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-extrabold sm:text-2xl">What are you into?</h2>
                  <p className="mt-1 text-sm text-slate-500">Find the vibe that fits you.</p>
                </div>
              </div>
              <div className="mt-5 flex gap-3 overflow-x-auto pb-3">
                {categories.map(({ name, icon: Icon }) => (
                  <button key={name} onClick={() => setActiveCategory(name)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${activeCategory === name ? 'border-[#ff6b35] bg-[#ff6b35] text-white' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'}`}>
                    <Icon size={17} />{name}
                  </button>
                ))}
              </div>
            </section>

            <section className="py-8" id="events">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold tracking-[0.2em] text-[#ff784b]">CURATED FOR YOU</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight">Events worth going out for.</h2>
                  <p className="mt-2 text-sm text-slate-500">Find your people. Find your moment.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <MapPin size={17} className="text-[#ff784b]" />
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City or venue" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600 sm:w-28" />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <Search size={17} className="text-slate-500" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events..." className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600 sm:w-44" />
                  </label>
                </div>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
                  <RefreshCw className="animate-spin" size={20} /> Loading live events...
                </div>
              )}

              {!loading && loadError && (
                <div className="mt-7 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 shrink-0 text-red-300" />
                    <div className="flex-1">
                      <p className="font-bold text-red-200">Could not load events</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{loadError}</p>
                      <button onClick={() => void loadEvents()} className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Try again</button>
                    </div>
                  </div>
                </div>
              )}

              {!loading && !loadError && (
                <>
                  <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {filteredEvents.map((event) => (
                      <article key={event.id} className={`group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1929] transition duration-300 hover:-translate-y-1 hover:border-orange-400/30 hover:shadow-xl hover:shadow-black/20 ${event.isCancelled ? 'opacity-60' : ''}`}>
                        <button className="block w-full text-left" onClick={() => openEvent(event)}>
                          <div className="relative overflow-hidden">
                            <img src={`https://images.unsplash.com/${event.image}?auto=format&fit=crop&w=700&q=80`} alt={event.title} className="h-48 w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                            {event.tag && <span className={`absolute left-3 top-3 rounded-md px-2.5 py-1.5 text-[10px] font-black tracking-wider ${event.tag === 'SELLING FAST' || event.tag === 'CANCELLED' ? 'bg-[#ff6b35] text-white' : 'border border-white/20 bg-black/50 text-white backdrop-blur'}`}>{event.tag}</span>}
                            <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"><Heart size={16} /></span>
                          </div>
                          <div className="p-4">
                            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#ff946d]"><CalendarDays size={13} />{event.date}</p>
                            <h3 className="mt-3 line-clamp-1 text-lg font-extrabold">{event.title}</h3>
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={13} />{event.venue}</p>
                            <p className="mt-2 text-xs text-slate-500">{event.availableSeats} tickets available</p>
                            <div className="my-4 h-px bg-white/[0.07]" />
                            <div className="flex items-end justify-between">
                              <div><p className="text-[10px] text-slate-500">TICKET PRICE</p><p className="mt-1 text-lg font-black">₹{event.price.toLocaleString('en-IN')}</p></div>
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-slate-300 transition group-hover:bg-[#ff6b35] group-hover:text-white"><ArrowRight size={17} /></span>
                            </div>
                          </div>
                        </button>
                      </article>
                    ))}
                  </div>

                  {filteredEvents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
                      <Search className="mx-auto text-slate-600" size={32} />
                      <p className="mt-4 font-bold">No matching events</p>
                      <p className="mt-2 text-sm text-slate-500">Try another search, venue or category.</p>
                      <button onClick={() => { setSearch(''); setCity(''); setActiveCategory('All events') }} className="mt-4 text-sm font-bold text-[#ff946d]">Clear filters</button>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="py-10">
              <div className="relative overflow-hidden rounded-3xl border border-orange-400/20 bg-gradient-to-br from-[#251b20] via-[#171c2b] to-[#101d2e] p-7 sm:p-10 lg:p-12">
                <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-orange-500/15 blur-[80px]" />
                <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-center">
                  <div>
                    <p className="text-xs font-black tracking-[0.2em] text-[#ff946d]">DON'T MISS THE MOMENT</p>
                    <h2 className="mt-3 max-w-xl text-3xl font-black sm:text-4xl">The best nights don't happen by accident.</h2>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">Explore what's happening around you and find your next reason to go out.</p>
                  </div>
                  <a href="#events" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-6 py-4 font-bold text-white transition hover:bg-[#ff8052]">Find your next event <ArrowRight size={17} /></a>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="mt-8 border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© 2026 FlashSale. Live the moment.</p>
          <div className="flex gap-5"><a href="#events" className="hover:text-white">Explore</a><button onClick={() => alert('Support page coming soon.')} className="hover:text-white">Support</button><button onClick={() => alert('Terms page coming soon.')} className="hover:text-white">Terms</button></div>
        </div>
      </footer>
    </div>
  )
}

export default App
