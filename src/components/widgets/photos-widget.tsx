'use client'

import { useState, useEffect } from 'react'
import { Image, RefreshCw, ExternalLink, ChevronDown } from 'lucide-react'

interface PhotoItem {
  id: string
  filename: string
  baseUrl: string
  productUrl: string
  creationTime: string
  accountId: string
  accountLabel: string
  googleEmail: string
}

interface PhotosWidgetProps {
  className?: string
  compact?: boolean
}

export function PhotosWidget({ className = '', compact = false }: PhotosWidgetProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [accounts, setAccounts] = useState<{ accountId: string; accountLabel: string }[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  useEffect(() => {
    async function fetchPhotos() {
      try {
        const response = await fetch('/api/photos/recent')
        if (!response.ok) {
          throw new Error('Failed to fetch photos')
        }
        const data = await response.json()

        setPhotos(data.photos || [])
        setAccounts(data.accounts || [])
        setError(null)
      } catch (e) {
        console.error('Photos fetch error:', e)
        setError('Unable to load photos')
      } finally {
        setLoading(false)
      }
    }

    fetchPhotos()
  }, [])

  // Filter photos by selected account
  const filteredPhotos = selectedAccount
    ? photos.filter(p => p.accountId === selectedAccount)
    : photos

  const gridSize = compact ? 6 : 12
  const displayPhotos = filteredPhotos.slice(0, gridSize)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Image className="h-4 w-4 text-white/40" />
          <span className="text-xs uppercase tracking-wider text-white/50">Photos</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="h-4 w-4 text-white/30 animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Image className="h-4 w-4 text-white/40" />
          <span className="text-xs uppercase tracking-wider text-white/50">Photos</span>
        </div>
        <p className="text-xs text-white/30 text-center py-4">{error}</p>
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-purple-400" />
          <span className="text-xs uppercase tracking-wider text-white/50">Photos</span>
        </div>

        {/* Account Selector */}
        {accounts.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
            >
              {selectedAccount
                ? accounts.find(a => a.accountId === selectedAccount)?.accountLabel || 'Account'
                : 'All'}
              <ChevronDown className="h-3 w-3" />
            </button>

            {showAccountDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-lg z-10 min-w-[140px]">
                <button
                  onClick={() => {
                    setSelectedAccount(null)
                    setShowAccountDropdown(false)
                  }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${!selectedAccount ? 'text-purple-400' : 'text-white/60'}`}
                >
                  All Accounts
                </button>
                {accounts.map(account => (
                  <button
                    key={account.accountId}
                    onClick={() => {
                      setSelectedAccount(account.accountId)
                      setShowAccountDropdown(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${selectedAccount === account.accountId ? 'text-purple-400' : 'text-white/60'}`}
                  >
                    {account.accountLabel}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Photo Grid */}
      {displayPhotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <Image className="h-5 w-5 text-white/20 mb-2" />
          <p className="text-xs text-white/40">No recent photos</p>
        </div>
      ) : (
        <div className={`grid gap-1 ${compact ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {displayPhotos.map(photo => (
            <a
              key={photo.id}
              href={photo.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-square rounded-lg overflow-hidden relative group"
            >
              <img
                src={`${photo.baseUrl}=w200-h200-c`}
                alt={photo.filename}
                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ExternalLink className="h-4 w-4 text-white" />
              </div>
              {/* Account indicator for multi-account */}
              {accounts.length > 1 && !selectedAccount && (
                <div className="absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] bg-black/60 text-white/70">
                  {photo.accountLabel}
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {/* View all link */}
      {!compact && photos.length > gridSize && (
        <a
          href="/dashboard/photos"
          className="block text-center text-xs text-purple-400 hover:text-purple-300 mt-3 transition-colors"
        >
          View all photos
        </a>
      )}
    </div>
  )
}
