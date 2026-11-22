import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { CheckCircle2, XCircle, QrCode, PlusCircle, Camera } from 'lucide-react'
import api from '../lib/api'

type EventSummary = {
  id: string
  title: string
  venue: string
  startsAt: string
}

type AdminPanelProps = {
  events: EventSummary[]
  onEventCreated: () => Promise<void>
  onClose: () => void
}

type ScanFeedback = {
  ok: boolean
  code?: string
  message: string
  attendee?: string
  quantity?: number
  checkedInAt?: string
}

export default function AdminPanel({
  events,
  onEventCreated,
  onClose,
}: AdminPanelProps) {
  const [tab, setTab] = useState<'scanner' | 'create'>('scanner')

  // Scanner state
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? '')
  const [ticketCode, setTicketCode] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [scanResult, setScanResult] = useState<ScanFeedback | null>(null)
  const [scanning, setScanning] = useState(false)
  const lastScannedRef = useRef<string>('')

  // Create Event state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [venue, setVenue] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [totalSeats, setTotalSeats] = useState(50)
  const [priceInRupees, setPriceInRupees] = useState(499)
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id)
    }
  }, [events, selectedEventId])

  async function verifyTicket(codeToVerify: string) {
    const cleanCode = codeToVerify.trim()
    if (!cleanCode || !selectedEventId) return

    setScanning(true)
    setScanResult(null)
    try {
      const res = await api.post('/bookings/check-in', {
        ticketCode: cleanCode,
        eventId: selectedEventId,
      })
      const booking = res.data?.data?.booking
      setScanResult({
        ok: true,
        message: res.data?.message || 'Valid Ticket — Entry Approved',
        attendee: booking?.user?.name || booking?.user?.email,
        quantity: booking?.quantity,
        checkedInAt: booking?.checkedInAt,
      })
      setTicketCode('')
    } catch (err: any) {
      setScanResult({
        ok: false,
        code: err.response?.data?.code,
        message:
          err.response?.data?.message ||
          err.message ||
          'Ticket verification failed',
      })
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    if (!cameraActive || tab !== 'scanner') return

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 240, height: 240 } },
      false,
    )

    scanner.render(
      (decodedText) => {
        if (decodedText === lastScannedRef.current) return
        lastScannedRef.current = decodedText
        setTicketCode(decodedText)
        void verifyTicket(decodedText)
        setTimeout(() => {
          lastScannedRef.current = ''
        }, 3000)
      },
      () => {
        // Ignore per-frame decode misses
      },
    )

    return () => {
      void scanner.clear().catch(() => {})
    }
  }, [cameraActive, tab, selectedEventId])

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateMsg('')
    try {
      await api.post('/events', {
        title,
        description: description || undefined,
        venue,
        startsAt: new Date(startsAt).toISOString(),
        totalSeats: Number(totalSeats),
        priceInPaise: Math.round(Number(priceInRupees) * 100),
      })
      setCreateMsg('Event created successfully!')
      setTitle('')
      setDescription('')
      setVenue('')
      setStartsAt('')
      await onEventCreated()
    } catch (err: any) {
      setCreateMsg(
        err.response?.data?.message || err.message || 'Failed to create event',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="mb-12 rounded-2xl border border-orange-400/25 bg-[#101d2e] p-6 shadow-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#ff784b]">
            ADMIN CONSOLE
          </p>
          <h2 className="mt-1 text-2xl font-black">Gate Check-In & Events</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('scanner')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'scanner'
                ? 'bg-[#ff6b35] text-white'
                : 'border border-white/15 text-slate-300 hover:bg-white/5'
            }`}
          >
            <QrCode size={16} />
            QR Check-In
          </button>

          <button
            type="button"
            onClick={() => setTab('create')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'create'
                ? 'bg-[#ff6b35] text-white'
                : 'border border-white/15 text-slate-300 hover:bg-white/5'
            }`}
          >
            <PlusCircle size={16} />
            Create Event
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-400 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      {tab === 'scanner' ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-300">
              1. Select Active Event Gate
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value)
                setScanResult(null)
              }}
              className="mb-5 w-full rounded-xl border border-white/10 bg-[#07111f] p-3 text-sm text-white outline-none focus:border-orange-500"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {ev.venue}
                </option>
              ))}
            </select>

            <label className="mb-2 block text-sm font-semibold text-slate-300">
              2. Scan QR or Enter Ticket Code
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void verifyTicket(ticketCode)
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={ticketCode}
                onChange={(e) => setTicketCode(e.target.value)}
                placeholder="Paste ticket UUID (e.g. 5bd26e54-...)"
                className="flex-1 rounded-xl border border-white/10 bg-[#07111f] p-3 font-mono text-sm text-white outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={scanning || !ticketCode.trim() || !selectedEventId}
                className="rounded-xl bg-[#ff6b35] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {scanning ? 'Checking…' : 'Verify'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setCameraActive((prev) => !prev)}
              className="mt-4 flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5"
            >
              <Camera size={16} className="text-[#ff784b]" />
              {cameraActive ? 'Stop Camera Scanner' : 'Open Camera QR Scanner'}
            </button>

            {cameraActive && (
              <div
                id="qr-reader"
                className="mt-4 overflow-hidden rounded-xl border border-white/15 bg-white p-2 text-slate-900"
              />
            )}
          </div>

          <div className="flex flex-col justify-center">
            {scanResult ? (
              <div
                className={`rounded-2xl border p-6 ${
                  scanResult.ok
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-red-400/40 bg-red-500/10 text-red-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  {scanResult.ok ? (
                    <CheckCircle2 size={32} className="shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle size={32} className="shrink-0 text-red-400" />
                  )}
                  <div>
                    <p className="text-lg font-black">
                      {scanResult.ok
                        ? 'ENTRY APPROVED'
                        : scanResult.code || 'ENTRY DENIED'}
                    </p>
                    <p className="mt-1 text-sm opacity-90">{scanResult.message}</p>
                  </div>
                </div>

                {scanResult.ok && (
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-400/20 pt-4 text-sm">
                    <div>
                      <p className="text-xs text-emerald-300/70">Attendee</p>
                      <p className="font-bold">{scanResult.attendee}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-300/70">Admit Count</p>
                      <p className="font-bold">{scanResult.quantity} Ticket(s)</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
                Select an event gate on the left, then scan an attendee QR code or paste their ticket UUID to validate entry.
              </div>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreateEvent} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Event Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Arijit Singh Live in Lucknow"
              className="w-full rounded-lg border border-white/10 bg-[#07111f] p-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Venue</label>
            <input
              required
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Ekana Stadium, Lucknow"
              className="w-full rounded-lg border border-white/10 bg-[#07111f] p-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Date & Time</label>
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07111f] p-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Total Seats</label>
              <input
                type="number"
                min={1}
                required
                value={totalSeats}
                onChange={(e) => setTotalSeats(Number(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-[#07111f] p-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Price (₹ INR)</label>
              <input
                type="number"
                min={0}
                required
                value={priceInRupees}
                onChange={(e) => setPriceInRupees(Number(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-[#07111f] p-3 text-sm"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Gates open at 6:00 PM..."
              className="w-full rounded-lg border border-white/10 bg-[#07111f] p-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-4 sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-[#ff6b35] px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {creating ? 'Publishing…' : 'Publish Event'}
            </button>
            {createMsg && <p className="text-sm text-orange-300">{createMsg}</p>}
          </div>
        </form>
      )}
    </section>
  )
}