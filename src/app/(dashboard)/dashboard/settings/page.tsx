import { createClient } from '@/lib/supabase/server'
import { User, Bell, Shield, Palette } from 'lucide-react'
import { UsageSection } from '@/components/settings/usage-section'
import { PrivacySection } from '@/components/settings/privacy-section'
import { GoogleAccountsSection } from '@/components/settings/google-accounts-section'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-800">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account and preferences</p>
      </div>

      <div className="space-y-4">
        {/* Usage Section */}
        <UsageSection />

        {/* Google Accounts Section */}
        <GoogleAccountsSection />

        {/* Profile Section */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 flex items-center justify-center border border-blue-100">
              <User className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h2 className="font-medium text-slate-800">Profile</h2>
              <p className="text-sm text-slate-400">Manage your personal information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400 block mb-2">Name</label>
              <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                {user?.user_metadata?.full_name || 'Not set'}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400 block mb-2">Email</label>
              <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                {user?.email}
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 flex items-center justify-center border border-amber-100">
              <Bell className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h2 className="font-medium text-slate-800">Notifications</h2>
              <p className="text-sm text-slate-400">Configure notification preferences</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm">Coming soon</p>
        </div>

        {/* Security */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center border border-emerald-100">
              <Shield className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-medium text-slate-800">Security</h2>
              <p className="text-sm text-slate-400">Password and authentication</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm">Coming soon</p>
        </div>

        {/* Appearance */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/50 flex items-center justify-center border border-rose-100">
              <Palette className="h-6 w-6 text-rose-500" />
            </div>
            <div>
              <h2 className="font-medium text-slate-800">Appearance</h2>
              <p className="text-sm text-slate-400">Customize the look and feel</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm">Light theme is the default</p>
        </div>

        {/* Privacy / Demo Mode - at bottom */}
        <PrivacySection />
      </div>
    </div>
  )
}
