'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderOpen,
  File,
  FileText,
  Image,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  X,
  ArrowUpRight,
  Sparkles,
  Copy,
  Music2,
  FileCode,
  Users,
  Grid3X3,
  List,
  GitBranch,
  Upload,
  Unplug,
  Camera,
  Mail,
} from 'lucide-react'
import Link from 'next/link'
import { AnimatedFolder, type FolderItem } from '@/components/ui/3d-folder'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FileUpload } from '@/components/documents/file-upload'

// Types
interface DriveFile {
  id: string
  drive_file_id: string
  google_account_id: string | null
  name: string
  mime_type: string | null
  size_bytes: number | null
  drive_modified_time: string | null
  full_path: string | null
  zone: string | null
  is_protected: boolean
  document_type?: string | null
  summary?: string | null
  detected_people?: string[]
  detected_projects?: string[]
  suggested_path?: string | null
}

interface GoogleAccount {
  id: string
  google_email: string
  account_label: string
  is_active: boolean
}

interface Photo {
  id: string
  baseUrl: string
  filename: string
  creationTime: string
  accountId: string
  accountLabel: string
  googleEmail?: string
}

interface SyncStatus {
  connected: boolean
  totalFiles: number
  lastSync: string | null
}

interface ClassifyStats {
  total: number
  classified: number
  pending: number
  lastClassifiedAt?: string | null
}

interface SearchResult {
  file: DriveFile
  similarity: number
}

interface DuplicateGroup {
  id: string
  files: DriveFile[]
  reason: string
}

// Zone colors
const ZONE_COLORS: Record<string, string> = {
  BUSINESS: 'bg-emerald-500',
  CLIENTS: 'bg-blue-500',
  PROJECTS: 'bg-amber-500',
  MUSIC: 'bg-pink-500',
  DESIGN: 'bg-cyan-500',
  PHOTOGRAPHY: 'bg-purple-500',
  PERSONAL: 'bg-violet-500',
  CODE: 'bg-orange-500',
  CONFIG: 'bg-slate-400',
  UNSORTED: 'bg-slate-300',
}

// Zone gradients for 3D folders
const ZONE_GRADIENTS: Record<string, string> = {
  BUSINESS: 'linear-gradient(135deg, #10b981, #059669)',
  CLIENTS: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  PROJECTS: 'linear-gradient(135deg, #f59e0b, #d97706)',
  MUSIC: 'linear-gradient(135deg, #ec4899, #db2777)',
  DESIGN: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  PHOTOGRAPHY: 'linear-gradient(135deg, #a855f7, #9333ea)',
  PERSONAL: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  CODE: 'linear-gradient(135deg, #f97316, #ea580c)',
  CONFIG: 'linear-gradient(135deg, #64748b, #475569)',
  UNSORTED: 'linear-gradient(135deg, #94a3b8, #64748b)',
}

// Tree types
interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  file?: DriveFile
  children: TreeNode[]
}

// Memoized tree builder
function buildTree(files: DriveFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] }

  for (const file of files) {
    const parts = (file.full_path || '/' + file.name).split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const path = '/' + parts.slice(0, i + 1).join('/')

      let child = current.children.find(c => c.name === part)
      if (!child) {
        child = { name: part, path, isFolder: !isLast, children: [] }
        current.children.push(child)
      }
      if (isLast) {
        child.file = file
        child.isFolder = file.mime_type === 'application/vnd.google-apps.folder'
      }
      current = child
    }
  }

  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sort)
  }
  sort(root)

  return root.children
}

// File icon helper - outside component to avoid recreating
const getIcon = (mime: string | null) => {
  if (!mime) return <File className="w-4 h-4 text-slate-400" />
  if (mime.includes('folder')) return <FolderOpen className="w-4 h-4 text-amber-500" />
  if (mime.includes('image')) return <Image className="w-4 h-4 text-blue-500" />
  if (mime.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />
  if (mime.includes('audio') || mime.includes('music')) return <Music2 className="w-4 h-4 text-pink-500" />
  if (mime.includes('code') || mime.includes('javascript') || mime.includes('json')) return <FileCode className="w-4 h-4 text-orange-500" />
  if (mime.includes('document') || mime.includes('text')) return <FileText className="w-4 h-4 text-slate-500" />
  return <File className="w-4 h-4 text-slate-400" />
}

// Size formatter
const formatSize = (b: number | null) => {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

// Date formatter
const formatDate = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return 'Today'
  if (diff < 172800000) return 'Yesterday'
  if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DrivePage() {
  // Account state
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Data state
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [classifyStats, setClassifyStats] = useState<ClassifyStats | null>(null)
  const [allFiles, setAllFiles] = useState<DriveFile[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)

  // UI state
  const [syncing, setSyncing] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [zone, setZone] = useState<string | null>(null)
  const [view, setView] = useState<'folders' | 'list' | 'tree'>('folders')
  const [activeTab, setActiveTab] = useState<'files' | 'photos'>('files')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showDupes, setShowDupes] = useState(false)
  const [dupes, setDupes] = useState<DuplicateGroup[]>([])
  const [loadingDupes, setLoadingDupes] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(100)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/google/accounts')
      const data = await res.json()
      if (data.accounts && data.accounts.length > 0) {
        setAccounts(data.accounts)
        // Select first account by default if none selected
        if (!selectedAccountId) {
          setSelectedAccountId(data.accounts[0].id)
        }
      }
    } catch (e) {
      console.error('Failed to fetch accounts:', e)
    }
  }, [selectedAccountId])

  // Fetch photos
  const fetchPhotos = useCallback(async () => {
    setPhotosLoading(true)
    try {
      const res = await fetch('/api/photos/recent')
      const data = await res.json()
      if (data.photos) {
        setPhotos(data.photos)
      }
    } catch (e) {
      console.error('Failed to fetch photos:', e)
    } finally {
      setPhotosLoading(false)
    }
  }, [])

  // Fetch status and files
  const fetchData = useCallback(async (accountId?: string | null) => {
    const accountParam = accountId && accountId !== 'all' ? `&accountId=${accountId}` : ''
    const [syncRes, classifyRes, filesRes] = await Promise.all([
      fetch('/api/drive/sync'),
      fetch('/api/drive/classify'),
      fetch(`/api/drive/indexed?limit=5000${accountParam}`),
    ])
    const [sync, classify, filesData] = await Promise.all([
      syncRes.json(),
      classifyRes.json(),
      filesRes.json(),
    ])
    setSyncStatus(sync)
    setClassifyStats(classify)
    setAllFiles(filesData.files || [])
    return sync
  }, [])

  // Initial load
  useEffect(() => {
    setLoading(true)
    Promise.all([fetchAccounts(), fetchData(), fetchPhotos()])
      .finally(() => setLoading(false))
  }, [fetchAccounts, fetchData, fetchPhotos])

  // Re-fetch files when account changes
  useEffect(() => {
    if (selectedAccountId) {
      fetchData(selectedAccountId)
    }
  }, [selectedAccountId, fetchData])

  // Files are now filtered server-side by accountId
  // allFiles already contains the filtered result
  const accountFilteredFiles = allFiles

  // CLIENT-SIDE FILTERING - instant zone switching
  const filteredFiles = useMemo(() => {
    if (!zone) return accountFilteredFiles
    return accountFilteredFiles.filter(f => f.zone === zone)
  }, [accountFilteredFiles, zone])

  // Zone counts - computed from filtered files
  const zoneCounts = useMemo(() => {
    return accountFilteredFiles.reduce((acc, f) => {
      const z = f.zone || 'UNSORTED'
      acc[z] = (acc[z] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [accountFilteredFiles])

  // Files grouped by zone for folder view
  const filesByZone = useMemo(() => {
    const grouped: Record<string, DriveFile[]> = {}
    for (const file of accountFilteredFiles) {
      const z = file.zone || 'UNSORTED'
      if (!grouped[z]) grouped[z] = []
      grouped[z].push(file)
    }
    return grouped
  }, [accountFilteredFiles])

  // Filter photos by selected account
  const filteredPhotos = useMemo(() => {
    if (!selectedAccountId || selectedAccountId === 'all') return photos
    return photos.filter(p => p.accountId === selectedAccountId)
  }, [photos, selectedAccountId])

  // Convert files to FolderItem format for 3D folders
  const getZoneFolderItems = useCallback((zoneKey: string): FolderItem[] => {
    const files = filesByZone[zoneKey] || []
    return files.slice(0, 10).map(f => ({
      id: f.id,
      title: f.name,
      image: f.mime_type?.includes('image') ? `https://drive.google.com/thumbnail?id=${f.drive_file_id}&sz=w400` : undefined,
      href: `https://drive.google.com/file/d/${f.drive_file_id}/view`,
    }))
  }, [filesByZone])

  // Display files - search results or filtered files
  const displayFiles = searchResults ? searchResults.map(r => r.file) : filteredFiles

  // Tree data - memoized
  const treeData = useMemo(() => buildTree(displayFiles), [displayFiles])

  // Actions
  const handleConnect = async () => {
    const res = await fetch('/api/drive/connect')
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/drive/disconnect', { method: 'POST' })
      if (res.ok) {
        setSyncStatus({ connected: false, totalFiles: 0, lastSync: null })
        setAllFiles([])
        setDisconnectDialogOpen(false)
      }
    } finally {
      setDisconnecting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      // Sync specific account or all accounts
      const body = selectedAccountId && selectedAccountId !== 'all'
        ? JSON.stringify({ accountId: selectedAccountId })
        : undefined
      const res = await fetch('/api/drive/sync', {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      const result = await res.json()
      console.log('[Sync Result]', result)

      // Show result to user
      if (result.error) {
        alert(`Sync failed: ${result.error}`)
      } else {
        alert(`Sync complete!\nFiles found: ${result.totalFiles}\nIndexed: ${result.indexed}\nErrors: ${result.errors}`)
      }

      await fetchData(selectedAccountId)
    } catch (err) {
      console.error('Sync error:', err)
      alert('Sync failed - check console for details')
    }
    setSyncing(false)
  }

  const handleClassify = async (reclassifyZone?: string) => {
    const targetCount = reclassifyZone === 'ALL'
      ? allFiles.length
      : reclassifyZone
        ? zoneCounts[reclassifyZone] || 0
        : classifyStats?.pending || 0
    if (targetCount === 0) return
    setClassifying(true)
    setClassifyProgress({ done: 0, total: targetCount })

    try {
      // Use intelligent classify endpoint (detects people/projects)
      const response = await fetch('/api/drive/intelligent-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reclassifyZone ? JSON.stringify({ zone: reclassifyZone }) : undefined,
      })
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace('data: ', ''))
              if (data.classified !== undefined) {
                setClassifyProgress(prev => ({ done: data.classified, total: prev?.total || targetCount }))
              }
              if (data.done) {
                await fetchData()
              }
            } catch {}
          }
        }
      }
    } finally {
      setClassifying(false)
      setClassifyProgress(null)
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const res = await fetch('/api/drive/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, zone, limit: 30 }),
      })
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch { setSearchResults(null) }
    finally { setSearching(false) }
  }

  const handleDupes = async () => {
    if (showDupes) { setShowDupes(false); return }
    setShowDupes(true)
    if (dupes.length > 0) return // Already loaded
    setLoadingDupes(true)
    try {
      const res = await fetch('/api/drive/duplicates')
      const data = await res.json()
      setDupes(data.groups || [])
    } finally { setLoadingDupes(false) }
  }

  // Loading state
  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-7 w-32 bg-slate-100 rounded" />
        <div className="h-10 bg-slate-100 rounded-lg" />
        <div className="space-y-1">
          {[...Array(10)].map((_, i) => <div key={i} className="h-12 bg-slate-50 rounded" />)}
        </div>
      </div>
    )
  }

  // Not connected
  if (!syncStatus?.connected && accounts.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-6 h-6 text-slate-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Connect Google Drive</h1>
          <p className="text-slate-500 text-sm mb-6">
            Index your files for intelligent search and organization.
          </p>
          <button
            onClick={handleConnect}
            className="px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
          >
            Connect Drive
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documents & Photos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {syncStatus?.totalFiles.toLocaleString() || 0} files
            {classifyStats && classifyStats.pending > 0 && (
              <span className="text-amber-600"> · {classifyStats.pending} unclassified</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                <Upload className="w-4 h-4" />
                Upload
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-white border-slate-200">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-slate-900">Upload Documents</DialogTitle>
              </DialogHeader>
              <FileUpload
                onUploadComplete={() => {
                  setUploadDialogOpen(false)
                  fetchData()
                }}
              />
            </DialogContent>
          </Dialog>
          <Link
            href="/dashboard/organization"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
            title="Manage People & Projects"
          >
            <Users className="w-4 h-4" />
          </Link>
          {/* Show Classify button for pending files */}
          {classifyStats && classifyStats.pending > 0 && !classifying && !zone && activeTab === 'files' && (
            <button
              onClick={() => handleClassify()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100"
            >
              <Sparkles className="w-4 h-4" />
              Classify ({classifyStats.pending})
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
            <DialogTrigger asChild>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 bg-slate-50 rounded-lg hover:bg-red-50 hover:text-red-600"
                title="Disconnect Google"
              >
                <Unplug className="w-4 h-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-sm bg-white border-slate-200">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-slate-900">Disconnect Google?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-600 mt-2">
                This will remove your Google connection and clear all indexed Drive files. You can reconnect anytime.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => setDisconnectDialogOpen(false)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Account Tabs */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <span className="text-xs text-slate-400 uppercase tracking-wider mr-2">Account:</span>
          <button
            onClick={() => setSelectedAccountId('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedAccountId === 'all' || !selectedAccountId
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Accounts
          </button>
          {accounts.map(account => (
            <button
              key={account.id}
              onClick={() => setSelectedAccountId(account.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                selectedAccountId === account.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{account.account_label}</span>
              <span className="text-xs opacity-60">{account.google_email.split('@')[0]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Files/Photos Toggle */}
      <div className="flex items-center gap-4">
        <div className="flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('files')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'files' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Files
          </button>
          <button
            onClick={() => setActiveTab('photos')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'photos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Camera className="w-4 h-4" />
            Photos
            {filteredPhotos.length > 0 && (
              <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                {filteredPhotos.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Photos Tab */}
      {activeTab === 'photos' && (
        <div>
          {photosLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-square bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No photos found</p>
              <p className="text-sm text-slate-400 mt-1">Connect Google Photos to see your recent photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredPhotos.map(photo => (
                <a
                  key={photo.id}
                  href={`${photo.baseUrl}=w800`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square bg-slate-100 rounded-xl overflow-hidden hover:ring-2 hover:ring-slate-300 transition-all"
                >
                  <img
                    src={`${photo.baseUrl}=w400-h400-c`}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-xs text-white truncate">{photo.filename}</p>
                      <p className="text-[10px] text-white/70">
                        {new Date(photo.creationTime).toLocaleDateString()}
                      </p>
                      {accounts.length > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-white/20 text-white rounded mt-1 inline-block">
                          {photo.accountLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <>
          {/* Progress */}
          {classifying && classifyProgress && (
            <div className="bg-violet-50 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium text-violet-900">Classifying...</span>
                <span className="text-violet-600 tabular-nums">{classifyProgress.done}/{classifyProgress.total}</span>
              </div>
              <div className="h-1 bg-violet-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{ width: `${(classifyProgress.done / (classifyProgress.total || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); if (!e.target.value) setSearchResults(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border-0 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {query && (
                <button onClick={() => { setQuery(''); setSearchResults(null) }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
            <button
              onClick={handleDupes}
              className={`p-2 rounded-lg transition-colors ${showDupes ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              title="Find duplicates"
            >
              <Copy className="w-4 h-4" />
            </button>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('folders')}
                className={`p-1.5 rounded-md transition-colors ${view === 'folders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                title="Folders"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                title="List"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('tree')}
                className={`p-1.5 rounded-md transition-colors ${view === 'tree' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                title="Tree"
              >
                <GitBranch className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Zone Pills - instant client-side filtering */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => { setZone(null); setSearchResults(null); setDisplayLimit(100) }}
              className={`px-2.5 py-1 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                !zone ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            {Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).map(([z, count]) => (
              <button
                key={z}
                onClick={() => { setZone(zone === z ? null : z); setSearchResults(null); setDisplayLimit(100) }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                  zone === z ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${ZONE_COLORS[z] || 'bg-slate-300'}`} />
                {z.charAt(0) + z.slice(1).toLowerCase()}
                <span className="opacity-50">{count}</span>
              </button>
            ))}
          </div>

          {/* Duplicates */}
          {showDupes && (
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-900">Duplicates</span>
                <button onClick={() => setShowDupes(false)}><X className="w-4 h-4 text-amber-600" /></button>
              </div>
              {loadingDupes ? (
                <p className="text-sm text-amber-700">Scanning...</p>
              ) : dupes.length === 0 ? (
                <p className="text-sm text-slate-600 flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> No duplicates</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {dupes.slice(0, 5).map(g => (
                    <div key={g.id} className="bg-white rounded p-2 text-sm">
                      {g.files.map(f => (
                        <a key={f.id} href={`https://drive.google.com/file/d/${f.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-0.5 text-slate-700 hover:text-blue-600">
                          {getIcon(f.mime_type)}<span className="truncate">{f.name}</span>
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search Results */}
          {searchResults !== null && (
            <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
              <span className="text-sm text-blue-700">{searchResults.length} results for "{query}"</span>
              <button onClick={() => { setSearchResults(null); setQuery('') }}><X className="w-4 h-4 text-blue-600" /></button>
            </div>
          )}

          {/* 3D Folder Grid - shown when folders view and no zone selected */}
          {view === 'folders' && !zone && !searchResults && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(zoneCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([zoneKey, count]) => (
                  <AnimatedFolder
                    key={zoneKey}
                    title={zoneKey.charAt(0) + zoneKey.slice(1).toLowerCase()}
                    items={getZoneFolderItems(zoneKey)}
                    count={count}
                    gradient={ZONE_GRADIENTS[zoneKey]}
                    onClick={() => {
                      setZone(zoneKey)
                      setView('list')
                    }}
                    onItemClick={(item) => {
                      if (item.href) window.open(item.href, '_blank')
                    }}
                  />
                ))}
            </div>
          )}

          {/* File List - shown when zone selected or list/tree view */}
          {(view !== 'folders' || zone || searchResults) && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {displayFiles.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No files</div>
            ) : view === 'tree' ? (
              <div className="p-3 max-h-[500px] overflow-y-auto">
                <Tree nodes={treeData} expanded={expanded} onToggle={p => setExpanded(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50">
                  <div className="col-span-7">Name</div>
                  <div className="col-span-2">Zone</div>
                  <div className="col-span-1 text-right">Size</div>
                  <div className="col-span-2 text-right">Modified</div>
                </div>
                {displayFiles.slice(0, displayLimit).map(file => (
                  <a
                    key={file.id}
                    href={`https://drive.google.com/file/d/${file.drive_file_id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid grid-cols-12 gap-2 px-3 py-2 hover:bg-slate-50 group items-center"
                  >
                    <div className="col-span-7 min-w-0">
                      <div className="flex items-center gap-2">
                        {getIcon(file.mime_type)}
                        <span className="text-sm text-slate-800 truncate group-hover:text-blue-600">{file.name}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </div>
                      {/* Show detected people/projects */}
                      {((file.detected_people?.length || 0) > 0 || (file.detected_projects?.length || 0) > 0) && (
                        <div className="flex items-center gap-1 mt-0.5 ml-6">
                          {file.detected_people?.slice(0, 2).map((p, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded">
                              {p}
                            </span>
                          ))}
                          {file.detected_projects?.slice(0, 2).map((p, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${ZONE_COLORS[file.zone || 'UNSORTED']}`} />
                      <span className="text-xs text-slate-500 truncate">{(file.zone || 'Unsorted').charAt(0) + (file.zone || 'Unsorted').slice(1).toLowerCase()}</span>
                    </div>
                    <div className="col-span-1 text-right text-xs text-slate-500 tabular-nums">{formatSize(file.size_bytes)}</div>
                    <div className="col-span-2 text-right text-xs text-slate-500">{formatDate(file.drive_modified_time)}</div>
                  </a>
                ))}
              </div>
            )}
            {displayFiles.length > displayLimit && (
              <button
                onClick={() => setDisplayLimit(displayFiles.length)}
                className="w-full px-3 py-2 text-center text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-t border-slate-100"
              >
                Show all ({displayFiles.length - displayLimit} more)
              </button>
            )}
          </div>
          )}
        </>
      )}

      {/* Footer */}
      {syncStatus?.lastSync && (
        <p className="text-xs text-slate-400 text-center">
          Synced {new Date(syncStatus.lastSync).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}

// Tree component
function Tree({ nodes, expanded, onToggle, depth = 0 }: {
  nodes: TreeNode[]
  expanded: Set<string>
  onToggle: (p: string) => void
  depth?: number
}) {
  return (
    <div>
      {nodes.map(node => {
        const isOpen = expanded.has(node.path)
        const file = node.file

        if (node.isFolder) {
          return (
            <div key={node.path}>
              <button
                onClick={() => onToggle(node.path)}
                className="w-full flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-50 text-left"
                style={{ paddingLeft: depth * 12 + 4 }}
              >
                {node.children.length > 0 ? (
                  isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                ) : <span className="w-3.5" />}
                <FolderOpen className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-slate-700">{node.name}</span>
                <span className="text-xs text-slate-400">{node.children.length}</span>
              </button>
              {isOpen && <Tree nodes={node.children} expanded={expanded} onToggle={onToggle} depth={depth + 1} />}
            </div>
          )
        }

        return (
          <a
            key={node.path}
            href={file ? `https://drive.google.com/file/d/${file.drive_file_id}/view` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-50 group"
            style={{ paddingLeft: depth * 12 + 22 }}
          >
            {getIcon(file?.mime_type || null)}
            <span className="text-sm text-slate-700 truncate group-hover:text-blue-600">{node.name}</span>
            {file?.zone && <span className={`w-1.5 h-1.5 rounded-full ${ZONE_COLORS[file.zone]} ml-auto`} />}
          </a>
        )
      })}
    </div>
  )
}
