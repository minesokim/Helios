'use client'

import { User } from '@supabase/supabase-js'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { DockNav } from './dock-nav'
import { useAIStore } from '@/stores/ai-store'
import { Search, Command, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Moon } from 'lucide-react'
import { format } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'

interface DashboardShellProps {
  user: User
  children: React.ReactNode
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const triggerVoice = useAIStore((state) => state.triggerVoice)
  const [militaryTime, setMilitaryTime] = useState('')
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null)
  const [location, setLocation] = useState<string>('Loading...')

  const isHomePage = pathname === '/dashboard'

  // Update military time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const hours = now.getHours().toString().padStart(2, '0')
      const minutes = now.getMinutes().toString().padStart(2, '0')
      setMilitaryTime(`${hours}:${minutes}`)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-sync financial data on dashboard load
  useEffect(() => {
    const syncFinancialData = async () => {
      try {
        // Check if we've synced recently (within last 5 minutes)
        const lastSync = localStorage.getItem('lastBankingSync')
        const now = Date.now()
        if (lastSync && now - parseInt(lastSync) < 5 * 60 * 1000) {
          return // Skip if synced recently
        }

        // Sync banking data in background
        const response = await fetch('/api/banking/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })

        if (response.ok) {
          localStorage.setItem('lastBankingSync', now.toString())
          console.log('Banking data synced automatically')
        }
      } catch (e) {
        // Silent fail - don't disrupt user experience
        console.error('Auto-sync failed:', e)
      }
    }

    syncFinancialData()
  }, [])

  // US state abbreviations map
  const stateAbbreviations: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'District of Columbia': 'DC'
  }

  // Fetch weather from coordinates
  const fetchWeatherFromCoords = async (latitude: number, longitude: number) => {
    try {
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`
      )
      const weatherData = await weatherRes.json()

      if (weatherData.current) {
        const temp = Math.round(weatherData.current.temperature_2m)
        const code = weatherData.current.weather_code
        let condition = 'clear'
        if (code >= 1 && code <= 48) condition = 'cloudy'
        if (code >= 51 && code <= 67) condition = 'rain'
        if (code >= 71 && code <= 77) condition = 'snow'
        if (code >= 80 && code <= 82) condition = 'rain'
        if (code >= 95) condition = 'thunderstorm'
        setWeather({ temp, condition })
      }
    } catch (err) {
      console.error('Weather fetch failed:', err)
    }
  }

  // Fetch location from coordinates
  const fetchLocationFromCoords = async (latitude: number, longitude: number) => {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
      )
      const geoData = await geoRes.json()

      if (geoData.address) {
        const city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.county || ''
        const state = geoData.address.state || ''
        const stateAbbr = stateAbbreviations[state] || (state.length > 2 ? state.substring(0, 2).toUpperCase() : state)
        setLocation(city ? `${city}, ${stateAbbr}` : state)
      }
    } catch (err) {
      console.error('Location fetch failed:', err)
    }
  }

  // Fallback: fetch location from IP address
  const fetchLocationFromIP = async () => {
    try {
      // Use ipapi.co (free, HTTPS, 1000 requests/day)
      const res = await fetch('https://ipapi.co/json/')
      const data = await res.json()

      if (data && !data.error) {
        const { city, region, region_code, latitude, longitude } = data
        const stateAbbr = stateAbbreviations[region] || region_code || region
        setLocation(city ? `${city}, ${stateAbbr}` : region)

        // Fetch weather using IP-based coordinates
        if (latitude && longitude) {
          await fetchWeatherFromCoords(latitude, longitude)
        }
      }
    } catch (err) {
      console.error('IP location fetch failed:', err)
      setLocation('Location unavailable')
    }
  }

  // Fetch real weather and location
  useEffect(() => {
    const fetchWeatherAndLocation = async () => {
      // Try browser geolocation first
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords
            await Promise.all([
              fetchWeatherFromCoords(latitude, longitude),
              fetchLocationFromCoords(latitude, longitude)
            ])
          },
          async () => {
            // Geolocation denied or failed - fall back to IP-based location
            console.log('Geolocation denied, using IP-based location')
            await fetchLocationFromIP()
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
        )
      } else {
        // No geolocation support - fall back to IP
        await fetchLocationFromIP()
      }
    }

    fetchWeatherAndLocation()
    // Refresh weather every 30 minutes
    const interval = setInterval(fetchWeatherAndLocation, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Get weather icon based on condition and time
  const getWeatherIcon = () => {
    const hour = new Date().getHours()
    const isNight = hour < 6 || hour >= 20

    if (!weather) return <Sun className="h-4 w-4 text-amber-400" />

    switch (weather.condition) {
      case 'rain':
        return <CloudRain className="h-4 w-4 text-blue-400" />
      case 'snow':
        return <CloudSnow className="h-4 w-4 text-blue-200" />
      case 'thunderstorm':
        return <CloudLightning className="h-4 w-4 text-yellow-400" />
      case 'cloudy':
        return <Cloud className="h-4 w-4 text-gray-400" />
      default:
        return isNight ? <Moon className="h-4 w-4 text-blue-300" /> : <Sun className="h-4 w-4 text-amber-400" />
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = user.user_metadata?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || user.email?.[0].toUpperCase() || 'U'

  const handleOrbClick = () => {
    // Trigger voice input on the main dashboard orb
    triggerVoice()
  }

  return (
    <div className="min-h-screen relative">
      {/* Ambient Glow Effects */}
      <div className="ambient-glow glow-cyan" />
      <div className="ambient-glow glow-purple" />
      <div className="ambient-glow glow-red" />

      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-40 glass-header">
        {/* Left - Date, Weather & Location */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-sm text-white/50 whitespace-nowrap">
            {format(new Date(), 'EEEE, MMM d')}
          </span>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2 text-white/60 whitespace-nowrap">
            {getWeatherIcon()}
            <span className="text-sm">{weather ? `${weather.temp}°F` : '--°F'}</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-sm text-white/40 whitespace-nowrap">
            {location}
          </span>
        </div>

        {/* Center - Search (absolutely positioned for true center) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl px-6">
          <button className="w-full glass-input flex items-center gap-3 px-5 py-3 text-left group">
            <Search className="h-4 w-4 text-white/40 group-hover:text-white/60 transition-colors" />
            <span className="flex-1 text-sm text-white/40 group-hover:text-white/60 transition-colors truncate">
              Search or jump to...
            </span>
            <kbd className="hidden md:inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-white/40 border border-white/10 shrink-0">
              <Command className="h-3 w-3" />
              <span>K</span>
            </kbd>
          </button>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Military Time */}
          <span className="text-sm font-mono text-white/50 tracking-wider">{militaryTime}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button suppressHydrationWarning className="relative h-10 w-10 rounded-xl glass-button p-0.5 flex items-center justify-center group">
                {/* Ambient glow effect on hover */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/0 via-purple-500/0 to-pink-500/0
                              group-hover:from-cyan-500/30 group-hover:via-purple-500/30 group-hover:to-pink-500/30
                              blur-md transition-all duration-500 opacity-0 group-hover:opacity-100" />
                <Avatar className="relative h-9 w-9">
                  <AvatarImage src={user.user_metadata?.avatar_url} alt={user.email || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-purple-500 text-white font-medium text-sm shadow-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-2xl p-2 bg-black/90 backdrop-blur-xl border-white/10" align="end" forceMount>
              <DropdownMenuLabel className="font-normal px-3 py-2">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium text-white">
                    {user.user_metadata?.full_name || 'User'}
                  </p>
                  <p className="text-xs text-white/50">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2 bg-white/10" />
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/settings')}
                className="rounded-xl cursor-pointer px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 focus:bg-white/10"
              >
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2 bg-white/10" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="rounded-xl cursor-pointer px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className={`pt-20 px-6 relative z-10 ${isHomePage ? 'pb-24 h-screen overflow-hidden' : 'pb-28'}`}>
        {children}
      </main>

      {/* Bottom Dock Navigation */}
      <DockNav onOrbClick={handleOrbClick} />
    </div>
  )
}
