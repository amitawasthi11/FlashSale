const IMAGE_POOLS: Record<string, string[]> = {
  tech: [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=800&q=80',
  ],
  sports: [
    'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80',
  ],
  comedy: [
    'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=800&q=80',
  ],
  theatre: [
    'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=800&q=80',
  ],
  concert: [
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
  ],
}

export function getEventImage(event?: {
  id?: string
  title?: string
  description?: string | null
  imageUrl?: string | null
} | null): string {
  if (!event) return IMAGE_POOLS.concert[0]
  if (event.imageUrl?.trim()) return event.imageUrl.trim()
  // ... rest of function stays identical) return event.imageUrl.trim()

  const text = `${event.title ?? ''} ${event.description ?? ''}`.toLowerCase()

  let category = 'concert'
  if (/tech|conference|ai|hack|dev|code|startup/.test(text)) category = 'tech'
  else if (/cricket|ipl|football|match|sports|stadium|run/.test(text)) category = 'sports'
  else if (/comedy|standup|stand-up|laugh|open mic/.test(text)) category = 'comedy'
  else if (/theatre|drama|play|art|symphony/.test(text)) category = 'theatre'

  const pool = IMAGE_POOLS[category]
  const seed = String(event.id ?? event.title ?? 'default')
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return pool[hash % pool.length]
}

export default getEventImage