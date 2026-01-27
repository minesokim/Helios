import { google } from 'googleapis'

// Google OAuth2 client configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/drive/callback'

// Scopes for full Google integration
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',  // For creating drafts
  'https://www.googleapis.com/auth/gmail.send',     // For sending emails
  'https://www.googleapis.com/auth/calendar.events', // Read + write calendar events
  'https://www.googleapis.com/auth/photoslibrary.readonly',  // Google Photos
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

// Legacy alias for backwards compatibility
export const DRIVE_SCOPES = GOOGLE_SCOPES

// Create OAuth2 client
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  )
}

// Generate authorization URL
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client()

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent select_account', // Force account picker for multi-account support
    state: state || '',
  })
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

// Create authenticated OAuth2 client with tokens
export function createAuthenticatedClient(accessToken: string, refreshToken?: string) {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return oauth2Client
}

// Get user info from Google
export async function getGoogleUserInfo(accessToken: string) {
  const oauth2Client = createAuthenticatedClient(accessToken)
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })

  const { data } = await oauth2.userinfo.get()
  return data
}
