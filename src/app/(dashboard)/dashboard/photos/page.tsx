'use client'

import { useState, useEffect } from 'react'
import { Image, RefreshCw, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react'

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

interface AccountInfo {
  accountId: string
  accountLabel: string
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null)

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

  // Group photos by date
  const groupedPhotos = filteredPhotos.reduce((groups, photo) => {
    const date = new Date(photo.creationTime).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(photo)
    return groups
  }, {} as Record<string, PhotoItem[]>)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedPhoto) return

    const currentIndex = filteredPhotos.findIndex(p => p.id === selectedPhoto.id)

    if (e.key === 'ArrowRight' && currentIndex < filteredPhotos.length - 1) {
      setSelectedPhoto(filteredPhotos[currentIndex + 1])
    } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
      setSelectedPhoto(filteredPhotos[currentIndex - 1])
    } else if (e.key === 'Escape') {
      setSelectedPhoto(null)
    }
  }

  const navigatePhoto = (direction: 'prev' | 'next') => {
    if (!selectedPhoto) return

    const currentIndex = filteredPhotos.findIndex(p => p.id === selectedPhoto.id)

    if (direction === 'next' && currentIndex < filteredPhotos.length - 1) {
      setSelectedPhoto(filteredPhotos[currentIndex + 1])
    } else if (direction === 'prev' && currentIndex > 0) {
      setSelectedPhoto(filteredPhotos[currentIndex - 1])
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-slate-800">Photos</h1>
          <p className="text-slate-400 text-sm mt-1">Loading your photos...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-slate-800">Photos</h1>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-slate-800">Photos</h1>
            <p className="text-slate-400 text-sm mt-1">
              {photos.length} recent photos from {accounts.length} account{accounts.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Account Filter */}
      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedAccount(null)}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              !selectedAccount
                ? 'bg-purple-50 border-purple-200 text-purple-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            All Photos
          </button>
          {accounts.map(account => (
            <button
              key={account.accountId}
              onClick={() => setSelectedAccount(
                selectedAccount === account.accountId ? null : account.accountId
              )}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                selectedAccount === account.accountId
                  ? 'bg-purple-50 border-purple-200 text-purple-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {account.accountLabel}
            </button>
          ))}
        </div>
      )}

      {/* Photos Grid by Date */}
      {filteredPhotos.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Image className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No photos found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedPhotos).map(([date, datePhotos]) => (
            <div key={date}>
              <h2 className="text-lg font-medium text-slate-700 mb-3">{date}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {datePhotos.map(photo => (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className="aspect-square rounded-lg overflow-hidden relative group focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <img
                      src={`${photo.baseUrl}=w400-h400-c`}
                      alt={photo.filename}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ExternalLink className="h-6 w-6 text-white" />
                    </div>
                    {accounts.length > 1 && !selectedAccount && (
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs bg-black/60 text-white">
                        {photo.accountLabel}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setSelectedPhoto(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation buttons */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigatePhoto('prev')
            }}
            disabled={filteredPhotos.findIndex(p => p.id === selectedPhoto.id) === 0}
            className="absolute left-4 p-2 text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigatePhoto('next')
            }}
            disabled={filteredPhotos.findIndex(p => p.id === selectedPhoto.id) === filteredPhotos.length - 1}
            className="absolute right-4 p-2 text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-8 w-8" />
          </button>

          {/* Image */}
          <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            <img
              src={`${selectedPhoto.baseUrl}=w1920-h1080`}
              alt={selectedPhoto.filename}
              className="max-w-full max-h-[85vh] object-contain"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white/80 text-sm">
              <span>{selectedPhoto.filename}</span>
              <span>{formatDate(selectedPhoto.creationTime)}</span>
              {accounts.length > 1 && <span>[{selectedPhoto.accountLabel}]</span>}
              <a
                href={selectedPhoto.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
                Open in Photos
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
