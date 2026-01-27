// Zone detection and file protection services for Document Intelligence

// Protected filenames that should never be modified
const PROTECTED_FILENAMES = new Set([
  // Environment files
  '.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.staging', '.env.example',
  // Package managers
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'Cargo.lock', 'Cargo.toml', 'Gemfile', 'Gemfile.lock',
  'requirements.txt', 'pyproject.toml', 'poetry.lock',
  'go.mod', 'go.sum', 'composer.json', 'composer.lock',
  // TypeScript/JavaScript config
  'tsconfig.json', 'jsconfig.json',
  'next.config.js', 'next.config.mjs', 'next.config.ts',
  'nuxt.config.js', 'nuxt.config.ts',
  'vite.config.js', 'vite.config.ts',
  'webpack.config.js', 'rollup.config.js',
  'babel.config.js', '.babelrc',
  'tailwind.config.js', 'tailwind.config.ts',
  'postcss.config.js', 'postcss.config.cjs',
  // Linting/Formatting
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json',
  '.stylelintrc', '.editorconfig',
  // Git
  '.gitignore', '.gitattributes', '.gitmodules',
  // Docker
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
  // CI/CD
  '.travis.yml', '.gitlab-ci.yml', 'Jenkinsfile',
  'cloudbuild.yaml', 'vercel.json', 'netlify.toml', 'fly.toml', 'render.yaml',
  // Documentation
  'README.md', 'README', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  // Other
  'Makefile', 'Procfile', '.nvmrc', '.node-version', '.python-version', '.ruby-version', '.tool-versions',
])

// Code file extensions that indicate actual source code
const SOURCE_CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'pyw', 'rb', 'go', 'rs', 'java', 'kt', 'scala',
  'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'm',
  'php', 'pl', 'pm', 'r', 'lua', 'vim', 'el',
  'clj', 'cljs', 'ex', 'exs', 'erl', 'hrl',
  'hs', 'ml', 'fs', 'v', 'sv', 'vhd', 'asm', 's',
  'vue', 'svelte', 'prisma', 'graphql', 'gql',
])

// Patterns that indicate a file path is in a code repository
const CODE_REPO_INDICATORS = [
  'node_modules', '.git', '__pycache__', 'venv', '.venv',
  'dist', 'build', '.next', '.nuxt', '.svelte-kit',
  'src/', 'lib/', '/app/', 'components/', 'pages/',
]

// Zone names - expanded with MUSIC, DESIGN, PHOTOGRAPHY
export type ZoneName =
  | 'CLIENTS'
  | 'BUSINESS'
  | 'PROJECTS'
  | 'CODE'
  | 'CONFIG'
  | 'PERSONAL'
  | 'UNSORTED'
  | 'MUSIC'
  | 'DESIGN'
  | 'PHOTOGRAPHY'

// Zone detection patterns - order matters! First match wins
interface ZonePattern {
  zone: ZoneName
  // Folder name patterns (case-insensitive)
  folderPatterns?: string[]
  // File name patterns (case-insensitive)
  filePatterns?: string[]
  // File extension patterns
  extensions?: string[]
  // MIME type patterns
  mimeTypes?: string[]
  // Custom match function for complex logic
  customMatch?: (path: string, filename: string, mimeType: string | null) => boolean
}

const ZONE_PATTERNS: ZonePattern[] = [
  // MUSIC/WORSHIP - check first since user has lots of these
  {
    zone: 'MUSIC',
    folderPatterns: [
      'praise', 'worship', 'music', 'songs', 'hymns', 'choir',
      'set list', 'setlist', 'chords', 'lyrics', 'tabs',
      'church', 'sermon', 'ministry', 'band', 'guitar',
      'piano', 'drums', 'bass', 'keys', 'vocal',
      'ccli', 'hillsong', 'bethel', 'elevation',
    ],
    filePatterns: [
      'chord', 'lyric', 'tab', 'sheet music',
      'worship', 'praise', 'hymn', 'song',
    ],
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'mid', 'midi'],
  },

  // DESIGN - mockups, graphics, UI/UX work
  {
    zone: 'DESIGN',
    folderPatterns: [
      'design', 'mockup', 'mockups', 'ui', 'ux', 'wireframe',
      'prototype', 'graphics', 'assets', 'branding', 'logo',
      'figma', 'sketch', 'adobe', 'photoshop', 'illustrator',
      'creative', 'artwork', 'visual', 'imagery',
    ],
    filePatterns: [
      'mockup', 'wireframe', 'prototype', 'design',
      'logo', 'banner', 'poster', 'flyer',
    ],
    extensions: [
      'psd', 'ai', 'xd', 'fig', 'sketch',
      'indd', 'afdesign', 'afphoto',
    ],
    mimeTypes: [
      'application/vnd.google-apps.drawing',
    ],
  },

  // PHOTOGRAPHY - photos, camera work, editing
  {
    zone: 'PHOTOGRAPHY',
    folderPatterns: [
      'photography', 'photos', 'pictures', 'camera', 'shots',
      'lightroom', 'raw', 'edits', 'portraits', 'landscape',
      'photoshoot', 'shoot', 'session', 'gallery',
    ],
    filePatterns: [
      'photo', 'img_', 'dsc_', 'raw_', 'edit_',
    ],
    extensions: [
      'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2',
      'raf', 'srw', 'pef', 'x3f',
    ],
  },

  // CONFIG - system/code config files
  {
    zone: 'CONFIG',
    customMatch: (path, filename) => {
      if (PROTECTED_FILENAMES.has(filename)) return true
      if (filename.startsWith('.')) return true
      if (/\.config\.[a-z]+$/.test(filename)) return true
      return false
    },
  },

  // CODE - actual source code repositories
  {
    zone: 'CODE',
    customMatch: (path, filename) => {
      const pathLower = path.toLowerCase()

      // Check for code repo indicators in path
      for (const indicator of CODE_REPO_INDICATORS) {
        if (pathLower.includes(indicator)) {
          // Verify it's actually code, not just a folder named "src" in Drive
          const ext = filename.split('.').pop()?.toLowerCase()
          if (ext && SOURCE_CODE_EXTENSIONS.has(ext)) {
            return true
          }
        }
      }

      // Check for programming project folders
      if (
        pathLower.includes('/github/') ||
        pathLower.includes('/repos/') ||
        pathLower.includes('/repositories/') ||
        pathLower.includes('/code/') ||
        pathLower.includes('/development/')
      ) {
        const ext = filename.split('.').pop()?.toLowerCase()
        if (ext && SOURCE_CODE_EXTENSIONS.has(ext)) {
          return true
        }
      }

      return false
    },
  },

  // CLIENTS - client work
  {
    zone: 'CLIENTS',
    folderPatterns: [
      'client', 'clients', 'customer', 'customers',
      'freelance', 'contract', 'commission',
    ],
  },

  // BUSINESS - business/finance documents
  {
    zone: 'BUSINESS',
    folderPatterns: [
      'noctworks', 'business', 'finance', 'accounting',
      'invoice', 'invoices', 'receipt', 'receipts',
      'tax', 'taxes', 'expense', 'expenses',
      'legal', 'contracts', 'payroll', 'hr',
      'insurance', 'bank', 'statement',
    ],
    filePatterns: [
      'invoice', 'receipt', 'statement', 'contract',
      'w-2', 'w2', '1099', 'tax return',
    ],
  },

  // PROJECTS - work projects (non-code)
  {
    zone: 'PROJECTS',
    folderPatterns: [
      'project', 'projects', 'work', 'portfolio',
      'campaign', 'initiative', 'venture',
    ],
  },

  // PERSONAL - personal content including gaming
  {
    zone: 'PERSONAL',
    folderPatterns: [
      'personal', 'private', 'family', 'photos', 'pictures',
      'vacation', 'travel', 'home', 'medical', 'health',
      'journal', 'diary', 'notes', 'recipes',
      // Gaming
      'gaming', 'games', 'minecraft', 'steam', 'playstation', 'xbox',
      'nintendo', 'switch', 'screenshots', 'gameplay', 'saves',
    ],
    filePatterns: [
      'minecraft', 'screenshot', 'gameplay',
    ],
  },

  // UNSORTED - downloads and misc
  {
    zone: 'UNSORTED',
    folderPatterns: [
      'download', 'downloads', 'unsorted', 'inbox',
      'temp', 'tmp', 'misc', 'miscellaneous',
      'other', 'random', 'stuff',
    ],
  },
]

// Check if a filename is protected
export function isProtectedFilename(filename: string): boolean {
  if (PROTECTED_FILENAMES.has(filename)) return true
  if (filename.startsWith('.')) return true
  if (/\.config\.[a-z]+$/.test(filename)) return true
  return false
}

// Check if a file extension indicates code
export function isCodeExtension(extension: string | null): boolean {
  if (!extension) return false
  return SOURCE_CODE_EXTENSIONS.has(extension.toLowerCase())
}

// Check if a path is inside a code repository
export function isInsideCodeRepo(path: string): boolean {
  const pathLower = path.toLowerCase()
  for (const indicator of CODE_REPO_INDICATORS) {
    if (pathLower.includes(`/${indicator}/`) || pathLower.includes(`/${indicator}`)) {
      return true
    }
  }
  return false
}

// Check if a file is protected
export function isProtectedFile(
  filename: string,
  extension: string | null,
  path: string
): boolean {
  if (isProtectedFilename(filename)) return true

  if (isInsideCodeRepo(path)) {
    if (isCodeExtension(extension)) return true
  }

  const pathLower = path.toLowerCase()
  if (pathLower.includes('node_modules')) return true
  if (pathLower.includes('.git')) return true

  return false
}

// Determine the zone for a file based on its path - IMPROVED VERSION
export function determineZone(
  path: string,
  mimeType: string | null,
  filename: string
): ZoneName {
  const pathLower = path.toLowerCase()
  const filenameLower = filename.toLowerCase()
  const extension = filename.split('.').pop()?.toLowerCase() || null

  // Extract folder names from path for pattern matching
  const pathSegments = path.split('/').filter(Boolean)
  const folderNames = pathSegments.slice(0, -1) // All segments except the file itself

  // Check each zone pattern in order
  for (const pattern of ZONE_PATTERNS) {
    // Custom match takes priority
    if (pattern.customMatch && pattern.customMatch(path, filename, mimeType)) {
      return pattern.zone
    }

    // Check folder patterns - look at ALL folders in the path
    if (pattern.folderPatterns) {
      for (const folder of folderNames) {
        const folderLower = folder.toLowerCase()
        for (const folderPattern of pattern.folderPatterns) {
          if (folderLower.includes(folderPattern)) {
            return pattern.zone
          }
        }
      }
    }

    // Check file name patterns
    if (pattern.filePatterns) {
      for (const filePattern of pattern.filePatterns) {
        if (filenameLower.includes(filePattern)) {
          return pattern.zone
        }
      }
    }

    // Check extensions
    if (pattern.extensions && extension) {
      if (pattern.extensions.includes(extension)) {
        return pattern.zone
      }
    }

    // Check MIME types
    if (pattern.mimeTypes && mimeType) {
      for (const mimePattern of pattern.mimeTypes) {
        if (mimeType.includes(mimePattern)) {
          return pattern.zone
        }
      }
    }
  }

  // Check for Google Docs types and default based on depth
  if (mimeType === 'application/vnd.google-apps.folder') {
    const depth = pathSegments.length
    if (depth <= 1) return 'PERSONAL'
  }

  // Root level files go to UNSORTED
  if (pathSegments.length <= 1) {
    return 'UNSORTED'
  }

  // Default to PERSONAL (safe, no auto-actions)
  return 'PERSONAL'
}

// Get zone configuration
export interface ZoneConfig {
  name: ZoneName
  displayName: string
  icon: string
  color: string
  applyNamingConvention: boolean
  autoOrganize: 'YES' | 'SUGGEST_ONLY' | 'NO'
  duplicateMerge: 'YES_WITH_APPROVAL' | 'ALERT_ONLY' | 'NO'
  confidenceThresholdAuto: number
  confidenceThresholdSuggest: number
}

export const DEFAULT_ZONE_CONFIGS: Record<ZoneName, ZoneConfig> = {
  CLIENTS: {
    name: 'CLIENTS',
    displayName: 'Clients',
    icon: 'Users',
    color: '#6366f1',
    applyNamingConvention: true,
    autoOrganize: 'YES',
    duplicateMerge: 'YES_WITH_APPROVAL',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  BUSINESS: {
    name: 'BUSINESS',
    displayName: 'Business',
    icon: 'Briefcase',
    color: '#22c55e',
    applyNamingConvention: true,
    autoOrganize: 'YES',
    duplicateMerge: 'YES_WITH_APPROVAL',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  PROJECTS: {
    name: 'PROJECTS',
    displayName: 'Projects',
    icon: 'Rocket',
    color: '#f59e0b',
    applyNamingConvention: true,
    autoOrganize: 'YES',
    duplicateMerge: 'YES_WITH_APPROVAL',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  CODE: {
    name: 'CODE',
    displayName: 'Code',
    icon: 'Code',
    color: '#ef4444',
    applyNamingConvention: false,
    autoOrganize: 'NO',
    duplicateMerge: 'ALERT_ONLY',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  CONFIG: {
    name: 'CONFIG',
    displayName: 'Config',
    icon: 'Settings',
    color: '#64748b',
    applyNamingConvention: false,
    autoOrganize: 'NO',
    duplicateMerge: 'NO',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  PERSONAL: {
    name: 'PERSONAL',
    displayName: 'Personal',
    icon: 'User',
    color: '#8b5cf6',
    applyNamingConvention: false,
    autoOrganize: 'NO',
    duplicateMerge: 'ALERT_ONLY',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  UNSORTED: {
    name: 'UNSORTED',
    displayName: 'Unsorted',
    icon: 'Inbox',
    color: '#f97316',
    applyNamingConvention: false,
    autoOrganize: 'SUGGEST_ONLY',
    duplicateMerge: 'YES_WITH_APPROVAL',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  MUSIC: {
    name: 'MUSIC',
    displayName: 'Music & Worship',
    icon: 'Music',
    color: '#ec4899',
    applyNamingConvention: false,
    autoOrganize: 'SUGGEST_ONLY',
    duplicateMerge: 'ALERT_ONLY',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  DESIGN: {
    name: 'DESIGN',
    displayName: 'Design',
    icon: 'Palette',
    color: '#06b6d4',
    applyNamingConvention: false,
    autoOrganize: 'SUGGEST_ONLY',
    duplicateMerge: 'ALERT_ONLY',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
  PHOTOGRAPHY: {
    name: 'PHOTOGRAPHY',
    displayName: 'Photography',
    icon: 'Camera',
    color: '#a855f7',
    applyNamingConvention: false,
    autoOrganize: 'SUGGEST_ONLY',
    duplicateMerge: 'ALERT_ONLY',
    confidenceThresholdAuto: 0.95,
    confidenceThresholdSuggest: 0.80,
  },
}
