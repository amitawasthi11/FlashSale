
import { useEffect, useState, type FormEvent } from 'react'
import api from './lib/api'
import { Search, MapPin, ChevronDown, ArrowRight, Ticket, Menu, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

type EventItem = {
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

declare global {
  interface Window {
    Razorpay?: new (options: any) => {
      open: () => void
      on: (event: string, callback: (response: any) => void) => void
    }
  }
}

export default function App() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<EventItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hideHeader, setHideHeader] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [user, setUser] = useState(
    () => localStorage.getItem('flashsale_user_email') || '',
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [myTickets, setMyTickets] = useState<any[]>([])
  const [showTickets, setShowTickets] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  async function loadEvents() {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/events')
      const data = response.data?.data
      if (!Array.isArray(data)) throw new Error('Unexpected events API response')
      setEvents(data)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Could not load events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setNotice('')
    try {
      const response = await api.post('/auth/login', { email, password })
      const data = response.data?.data ?? response.data
      const token = data.token ?? data.accessToken

      if (!token) {
        throw new Error('No token returned. Check your backend login response.')
      }

      localStorage.setItem('flashsale_token', token)
      localStorage.setItem('flashsale_user_email', email)
      setUser(email)
      setLoginOpen(false)
      setPassword('')
      setNotice('Logged in successfully.')
    } catch (err: any) {
      setNotice(err.response?.data?.message || err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
  let lastScrollY = window.scrollY

  const handleScroll = () => {
    const currentScrollY = window.scrollY

    if (currentScrollY < 80) {
      setHideHeader(false)
    } else if (currentScrollY > lastScrollY + 5) {
      // Scrolling down
      setHideHeader(true)
    } else if (currentScrollY < lastScrollY - 5) {
      // Scrolling up
      setHideHeader(false)
    }

    lastScrollY = currentScrollY
  }

  window.addEventListener('scroll', handleScroll, { passive: true })

  return () => {
    window.removeEventListener('scroll', handleScroll)
  }
}, [])
  async function checkout() {
    if (!selected) return

    if (!localStorage.getItem('flashsale_token')) {
      setLoginOpen(true)
      setNotice('Log in before booking tickets.')
      return
    }

    if (
      selected.isCancelled ||
      quantity < 1 ||
      quantity > selected.availableSeats
    ) {
      setNotice('Not enough tickets available. Refreshing events.')
      await loadEvents()
      return
    }

    setBusy(true)
    setNotice('')

    try {
      // The backend validates availability and calculates the booking amount.
      const bookingResponse = await api.post('/bookings', {
        eventId: selected.id,
        quantity,
      })

      const bookingData =
        bookingResponse.data?.data?.booking ??
        bookingResponse.data?.data ??
        bookingResponse.data?.booking ??
        bookingResponse.data

      const bookingId = bookingData.id ?? bookingData.bookingId
      if (!bookingId) throw new Error('Booking ID missing from API response.')

      const orderResponse = await api.post('/payments/create-order', {
        bookingId,
      })

      const orderData = orderResponse.data?.data ?? orderResponse.data
      const order = orderData.razorpayOrder
      const payment = orderData.payment
      const keyId = orderData.keyId

      if (!order?.id || !payment?.id || !keyId) {
        throw new Error(
          'Unexpected create-order response. Check the backend response format.',
        )
      }

      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Could not load Razorpay Checkout'))
          document.body.appendChild(script)
        })
      }

      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.')

      let finished = false

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'FlashSale',
        description: selected.title,
        order_id: order.id,
        prefill: { email: user || email },
        theme: { color: '#ff6b35' },

        handler: async (result: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            await api.post('/payments/verify', {
              bookingId,
              razorpayOrderId: result.razorpay_order_id,
              razorpayPaymentId: result.razorpay_payment_id,
              razorpaySignature: result.razorpay_signature,
            })

           finished = true
           setNotice('Payment verified! Your booking is confirmed.')
            setSelected(null)
           await loadEvents()
            await myBookings()
          } catch (err: any) {
            setNotice(
              err.response?.data?.message ||
              'Verification failed. Check your booking and backend logs before trying to pay again.',
            )
          } finally {
            setBusy(false)
          }
        },

        modal: {
          ondismiss: () => {
            if (!finished) {
              setBusy(false)
              setNotice(
                'Checkout closed. Check your booking status before retrying.',
              )
            }
          },
        },
      }

      const razorpay = new window.Razorpay(options)

      razorpay.on('payment.failed', (response: any) => {
        setBusy(false)
        setNotice(
          response?.error?.description || 'Payment failed. Please check your booking status.',
        )
      })

      razorpay.open()
    } catch (err: any) {
      setBusy(false)
      setNotice(
        err.response?.data?.message || err.message || 'Could not start checkout.',
      )
      await loadEvents()
    }
  }

  
async function myBookings() {
  if (!localStorage.getItem('flashsale_token')) {
    setLoginOpen(true)
    setNotice('Please log in to view your tickets.')
    return
  }

  try {
    setBusy(true)
    setNotice('')

    const response = await api.get('/bookings/my-bookings')
    const data = response.data?.data

    const bookings = Array.isArray(data)
      ? data
      : data?.bookings ?? response.data?.bookings

    if (!Array.isArray(bookings)) {
      throw new Error('Unexpected bookings response. Check the Network tab.')
    }

    setMyTickets(bookings)
    setShowTickets(true)

    if (bookings.length === 0) {
      setNotice('You have no bookings yet.')
    }
  } catch (err: any) {
    setNotice(
      err.response?.data?.message ||
      err.message ||
      'Could not load your tickets.'
    )
  } finally {
    setBusy(false)
  }
}

  function logout() {
    localStorage.removeItem('flashsale_token')
    localStorage.removeItem('flashsale_user_email')
    setUser('')
    setNotice('You have logged out.')
  }

  const formatDate = (value: string) =>
    new Date(value).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    })

  const filteredEvents = events.filter((event) =>
    `${event.title} ${event.description ?? ''} ${event.venue}`
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      

<header
   className={`sticky top-0 z-50 border-b border-white/[0.08] bg-[#07111f]/90 backdrop-blur-xl transition-all duration-300 ${
    hideHeader
      ? 'pointer-events-none -translate-y-full opacity-0'
      : 'translate-y-0 opacity-100'
  }`}
>
  <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-8">
    {/* Logo */}
    <button
      type="button"
      onClick={() => {
        setSelected(null)
        setMenuOpen(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
      className="flex shrink-0 items-center gap-2"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6b35] text-white">
        <Ticket size={22} />
      </span>
      <span className="text-xl font-black tracking-tight text-white">
        Flash<span className="text-[#ff784b]">Sale</span>
      </span>
    </button>

    {/* Search bar */}
    <div className="mx-auto hidden max-w-xl flex-1 md:block">
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 transition focus-within:border-orange-400/50">
        <Search size={19} className="shrink-0 text-slate-400" />
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search events, concerts, sports..."
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          aria-label="Search events"
        />
      </div>
    </div>

    {/* Location */}
    <button
      type="button"
      className="hidden shrink-0 items-center gap-1.5 text-sm text-slate-300 transition hover:text-white sm:flex"
    >
      <MapPin size={17} />
      <span>Lucknow</span>
      <ChevronDown size={15} />
    </button>

    {/* Sign in / account menu */}
    <div className="relative ml-auto flex shrink-0 items-center gap-3 sm:ml-0">
      {!user && (
        <button
          type="button"
          onClick={() => {
            setLoginOpen(true)
            setMenuOpen(false)
          }}
          className="rounded-md bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff8052]"
        >
          Sign in
        </button>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={menuOpen ? 'Close menu' : 'Open account menu'}
        aria-expanded={menuOpen}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white transition hover:bg-white/[0.08]"
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
    </div>
  </nav>

  {/* Secondary navigation */}
  <div className="border-t border-white/[0.05]">
    <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-2.5 text-sm text-slate-400 lg:px-8">
      <a href="#events" className="shrink-0 transition hover:text-white">
        For you
      </a>
      <a href="#events" className="shrink-0 transition hover:text-white">
        Events
      </a>
      <a href="#categories" className="shrink-0 transition hover:text-white">
        Concerts
      </a>
      <a href="#categories" className="shrink-0 transition hover:text-white">
        Sports
      </a>
      <a href="#categories" className="shrink-0 transition hover:text-white">
        Theatre
      </a>
    </div>
  </div>

  {/* Account dropdown */}
  <div
    className={`absolute right-4 top-full z-50 mt-2 w-[min(320px,calc(100vw-32px))] transition-all duration-200 lg:right-[max(2rem,calc((100vw-80rem)/2))] ${
      menuOpen
        ? 'visible translate-y-0 opacity-100'
        : 'invisible -translate-y-2 pointer-events-none opacity-0'
    }`}
  >
    <div className="rounded-xl border border-white/10 bg-[#101d2e] p-3 shadow-2xl shadow-black/40">
      <div className="mb-2 rounded-lg bg-white/[0.04] p-3">
        <p className="text-sm font-semibold text-white">
          {user || 'Welcome to FlashSale'}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {user ? 'Manage your bookings' : 'Sign in to access your tickets'}
        </p>
      </div>

      {user ? (
        <>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              void myBookings()
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.06]"
          >
            <Ticket size={18} className="text-[#ff784b]" />
            My Tickets
          </button>

          <button
            type="button"
            onClick={() => {
              logout()
              setMenuOpen(false)
            }}
            className="w-full rounded-lg px-3 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10"
          >
            Log out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setLoginOpen(true)
            setMenuOpen(false)
          }}
          className="w-full rounded-lg px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.06]"
        >
          Sign in to your account
        </button>
      )}
    </div>
  </div>
</header>



      <main className="mx-auto max-w-7xl px-5 py-10">
       <section className="relative mb-16 grid items-center gap-10 overflow-hidden py-8 md:grid-cols-2 md:py-14">
          <div>
            <p className="mb-4 text-sm font-bold tracking-widest text-[#ff784b]">
              YOUR CITY. YOUR NEXT BIG MOMENT.
            </p>
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
           Make plans.
           <br />
            Make <span className="bg-gradient-to-r from-[#ff784b] to-amber-300 bg-clip-text text-transparent">
             memories.
            </span>
            </h1>
            <p className="mt-5 max-w-lg leading-7 text-slate-400">
              Discover events, book your tickets, and get ready for experiences worth remembering.
            </p>
            <a href="#events" className="mt-7 inline-block rounded-xl bg-[#ff6b35] px-6 py-3 font-bold">
              Explore events →
            </a>
          </div>

          <img
            src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=85"
            alt="Live concert"
            className="h-72 w-full rounded-3xl border border-white/10 object-cover shadow-2xl shadow-orange-950/20 sm:h-[420px]"
          />
        </section>

        {loginOpen && (
          <form
            onSubmit={login}
            className="mb-10 max-w-md rounded-2xl border border-white/10 bg-[#101d2e] p-6"
          >
            <h2 className="mb-4 text-xl font-bold">Welcome back</h2>
            <label className="mb-2 block text-sm text-slate-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-lg border border-white/10 bg-[#07111f] p-3 outline-none focus:border-orange-500"
            />
            <label className="mb-2 block text-sm text-slate-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-5 w-full rounded-lg border border-white/10 bg-[#07111f] p-3 outline-none focus:border-orange-500"
            />
            <button
              disabled={busy}
              className="w-full rounded-lg bg-[#ff6b35] p-3 font-bold disabled:opacity-50"
            >
              {busy ? 'Please wait…' : 'Log in'}
            </button>
          </form>
        )}

        {notice && (
          <div className="mb-6 whitespace-pre-line rounded-xl border border-orange-400/20 bg-orange-400/10 p-4 text-sm">
            {notice}
            <button onClick={() => setNotice('')} className="ml-3 font-bold text-[#ff784b]">
              Dismiss
            </button>
          </div>
        )}


          
{showTickets && (
  <section className="mb-12 rounded-2xl border border-white/10 bg-[#101d2e] p-6">
    <div className="mb-6 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold tracking-widest text-[#ff784b]">
          YOUR BOOKINGS
        </p>
        <h2 className="mt-2 text-2xl font-black">My Tickets</h2>
      </div>

      <button
        onClick={() => setShowTickets(false)}
        className="rounded-lg border border-white/15 px-4 py-2"
      >
        Close
      </button>
    </div>

    {myTickets.length === 0 ? (
      <p className="text-slate-400">No bookings found.</p>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        
{myTickets.map((booking: any) => (
  <article
    key={booking.id}
   className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101d2e] transition duration-300 hover:-translate-y-1 hover:border-orange-400/40 hover:shadow-xl hover:shadow-orange-950/20"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">
          {booking.event?.title ??
            booking.eventTitle ??
            "Event Ticket"}
        </h3>

        <p className="mt-1 text-sm text-slate-400">
          {booking.event?.venue ?? booking.event?.location ?? ""}
        </p>

        {booking.event?.startsAt && (
          <p className="mt-1 text-sm text-slate-400">
            {new Date(booking.event.startsAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            })}
          </p>
        )}
      </div>

      <span className="rounded-full bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-300">
        {booking.status}
      </span>
    </div>

    <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
      <div>
        <p className="text-slate-500">Booking ID</p>
        <p className="mt-1 break-all">{booking.id}</p>
      </div>

      <div>
        <p className="text-slate-500">Tickets</p>
        <p className="mt-1 font-bold">{booking.quantity}</p>
      </div>

      <div>
        <p className="text-slate-500">Total</p>
        <p className="mt-1 font-bold">
          ₹{((booking.totalAmountPaise ?? 0) / 100).toLocaleString("en-IN")}
        </p>
      </div>

      <div>
        <p className="text-slate-500">Booked on</p>
        <p className="mt-1">
          {booking.createdAt
            ? new Date(booking.createdAt).toLocaleDateString("en-IN")
            : "—"}
        </p>
      </div>
    </div>

    {/* QR ticket for confirmed bookings */}
    {booking.status === "CONFIRMED" && booking.ticketCode && (
      <div className="mt-6 rounded-xl border border-white/10 bg-white p-5 text-center">
        <QRCodeSVG
          value={booking.ticketCode}
          size={180}
          level="H"
           marginSize={4}
          title={`QR ticket for ${booking.event?.title ?? "FlashSale event"}`}
          className="mx-auto"
        />

        <p className="mt-4 font-bold text-slate-900">
          Your entry ticket
        </p>

        <p className="mt-2 break-all font-mono text-xs text-slate-600">
          {booking.ticketCode}
        </p>

        <p className="mt-3 text-xs text-slate-500">
          Show this QR code at the event entrance.
        </p>
      </div>
    )}

    {booking.status === "CONFIRMED" && !booking.ticketCode && (
      <p className="mt-5 text-sm text-amber-300">
        Your booking is confirmed, but its ticket code is not available.
      </p>
    )}

    {booking.status === "PENDING" && (
      <p className="mt-5 text-sm text-amber-300">
        Payment is pending. Your QR ticket will appear after confirmation.
      </p>
    )}
  </article>
))}

      </div>
    )}
  </section>
)}

        <section id="events">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-widest text-[#ff784b]">DISCOVER</p>
              <h2 className="mt-2 text-3xl font-black">Events worth going out for.</h2>
            </div>
            <button
              onClick={() => void loadEvents()}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm"
            >
              Refresh events
            </button>
          </div>

          {loading && <p className="py-8 text-slate-400">Loading events…</p>}

          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4">
              <p>{error}</p>
              <button onClick={() => void loadEvents()} className="mt-3 underline">
                Try again
              </button>
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <p className="py-8 text-slate-400">No events are available right now.</p>
          )}

          {!loading && !error && events.length > 0 && filteredEvents.length === 0 && (
            <p className="py-8 text-slate-400">No events match “{searchTerm}”. Try another search.</p>
          )}

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <article
                key={event.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#101d2e]"
              >
                <img
                  src={`https://images.unsplash.com/${/tech|conference|ai/i.test(event.title + event.description) ? 'photo-1540575467063-178a50c2df87' : 'photo-1459749411175-04bf5292ceea'}?auto=format&fit=crop&w=800&q=80`}
                  alt={event.title}
                  className="h-52 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="p-5">
                  <p className="text-sm text-[#ff784b]">{formatDate(event.startsAt)}</p>
                  <h3 className="mt-2 text-xl font-bold">{event.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{event.venue}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
                    {event.description}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Starting at</p>
                      <p className="text-xl font-black">
                        ₹{(event.priceInPaise / 100).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <button
                      disabled={event.isCancelled || event.availableSeats <= 0}
                      onClick={() => {
                        setSelected(event)
                        setQuantity(1)
                        setNotice('')
                      }}
                      className="rounded-lg bg-[#ff6b35] px-4 py-3 text-sm font-bold disabled:bg-slate-700"
                    >
                      {event.isCancelled ? 'Cancelled' : event.availableSeats <= 0 ? 'Sold out' : 'Book tickets'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {Math.max(0, Math.min(event.availableSeats, event.totalSeats))} tickets available
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {selected && (
          <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/75 p-4">
            <section className="my-8 w-full max-w-lg rounded-2xl border border-white/10 bg-[#101d2e] p-6 sm:p-8">
              <button
                onClick={() => setSelected(null)}
                className="float-right text-slate-400 hover:text-white"
              >
                ✕
              </button>
              <p className="text-sm font-bold text-[#ff784b]">TICKET BOOKING</p>
              <h2 className="mt-2 text-2xl font-black">{selected.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{selected.venue}</p>
              <p className="mt-1 text-sm text-slate-400">{formatDate(selected.startsAt)}</p>

              <p className="mt-6 text-3xl font-black">
                ₹{(selected.priceInPaise / 100).toLocaleString('en-IN')}
                <span className="ml-2 text-sm font-normal text-slate-400">per ticket</span>
              </p>

              <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 p-4">
                <span>Tickets</span>
                <div className="flex items-center gap-4">
                  <button
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="h-9 w-9 rounded-lg bg-white/10 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span>{quantity}</span>
                  <button
                    disabled={quantity >= Math.min(10, selected.availableSeats)}
                    onClick={() => setQuantity((q) => Math.min(10, selected.availableSeats, q + 1))}
                    className="h-9 w-9 rounded-lg bg-white/10 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="my-5 flex justify-between">
                <span className="text-slate-400">Total</span>
                <strong className="text-xl">
                  ₹{((selected.priceInPaise * quantity) / 100).toLocaleString('en-IN')}
                </strong>
              </div>

              <button
                disabled={busy || selected.availableSeats <= 0}
                onClick={() => void checkout()}
                className="w-full rounded-xl bg-[#ff6b35] p-4 font-bold disabled:opacity-50"
              >
                {busy ? 'Preparing checkout…' : 'Continue to secure payment'}
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">
                Final price and ticket availability are validated by the server.
              </p>
            </section>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-white/10 px-5 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} FlashSale · Live the moment.
      </footer>
    </div>
  )
}
