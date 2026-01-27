'use client'

import { useState } from 'react'
import { X, Building2, User } from 'lucide-react'

interface AddClientFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    name: string
    company?: string
    email?: string
    type: 'company' | 'individual'
    status: string
    monthly_retainer?: number
    notes?: string
  }) => Promise<void>
}

export function AddClientForm({ isOpen, onClose, onSubmit }: AddClientFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    type: 'company' as 'company' | 'individual',
    status: 'lead',
    monthly_retainer: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    setSaving(true)
    try {
      await onSubmit({
        name: formData.name,
        company: formData.company || undefined,
        email: formData.email || undefined,
        type: formData.type,
        status: formData.status,
        monthly_retainer: formData.monthly_retainer ? parseFloat(formData.monthly_retainer) : undefined,
        notes: formData.notes || undefined,
      })

      // Reset form
      setFormData({
        name: '',
        company: '',
        email: '',
        type: 'company',
        status: 'lead',
        monthly_retainer: '',
        notes: '',
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-16 pb-28 overflow-y-auto">
      <div className="mercury-card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-white">Add Client</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'company' })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-colors ${
                  formData.type === 'company'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <Building2 className="h-4 w-4" />
                Company
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'individual' })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-colors ${
                  formData.type === 'individual'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <User className="h-4 w-4" />
                Individual
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">
              {formData.type === 'company' ? 'Contact Name' : 'Name'} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
              required
            />
          </div>

          {/* Company (only for company type) */}
          {formData.type === 'company' && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">Company Name</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Acme Corp"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 [&>option]:bg-[#1a1a24] [&>option]:text-white"
            >
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Monthly Retainer */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">Monthly Retainer</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span>
              <input
                type="number"
                value={formData.monthly_retainer}
                onChange={(e) => setFormData({ ...formData, monthly_retainer: e.target.value })}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm text-white/60 mb-2 block">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any notes about this client..."
              rows={3}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-white/10 rounded-lg text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.name.trim()}
              className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
