
import { useEffect, useState, type FormEvent } from 'react'
import api from './lib/api'

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
  const [loginOpen, setLoginOpen] = useState(false)
  const [user, setUser] = useState(
    () => localStorage.getItem('flashsale_user_email') || '',
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [myTickets, setMyTickets] = useState<any[]>([])
const [showTickets, setShowTickets] = useState(false)

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

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <button
            onClick={() => setSelected(null)}
            className="text-2xl font-black tracking-tight"
          >
            Flash<span className="text-[#ff6b35]">Sale.</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => void myBookings()} className="text-sm text-slate-300">
              My Tickets
            </button>
            {user ? (
              <>
                <span className="hidden text-sm text-slate-400 sm:inline">{user}</span>
                <button onClick={logout} className="rounded-lg border border-white/15 px-4 py-2 text-sm">
                  Log out
                </button>
              </>
            ) : (
              <button
                onClick={() => setLoginOpen(!loginOpen)}
                className="rounded-lg bg-[#ff6b35] px-4 py-2 text-sm font-bold"
              >
                Log in
              </button>
            )}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10">
        <section className="mb-12 grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-bold tracking-widest text-[#ff784b]">
              YOUR CITY. YOUR NEXT BIG MOMENT.
            </p>
            <h1 className="text-5xl font-black leading-tight sm:text-7xl">
              Make plans.
              <br />
              Make <span className="text-[#ff784b]">memories.</span>
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
            className="h-64 w-full rounded-3xl object-cover sm:h-96"
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
            className="rounded-xl border border-white/10 bg-[#07111f] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">
                  {booking.event?.title ??
                    booking.eventTitle ??
                    'Event Ticket'}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {booking.event?.venue ?? booking.event?.location ?? ''}
                </p>
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
                  ₹{(
                    (booking.totalAmountPaise ?? 0) / 100
                  ).toLocaleString('en-IN')}
                </p>
              </div>

              <div>
                <p className="text-slate-500">Booked on</p>
                <p className="mt-1">
                  {booking.createdAt
                    ? new Date(booking.createdAt).toLocaleDateString('en-IN')
                    : '—'}
                </p>
              </div>
            </div>
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

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <article
                key={event.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#101d2e]"
              >
                <img
                  src={`https://images.unsplash.com/${/tech|conference|ai/i.test(event.title + event.description) ? 'photo-1540575467063-178a50c2df87' : 'photo-1459749411175-04bf5292ceea'}?auto=format&fit=crop&w=800&q=80`}
                  alt={event.title}
                  className="h-48 w-full object-cover"
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
