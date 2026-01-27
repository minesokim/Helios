import { createClient } from '@/lib/supabase/server'
import { refreshAccessToken } from '@/lib/google/oauth'
import { extractFileContent } from '@/services/drive/classifier'
import {
  intelligentClassify,
  saveIntelligentClassification,
} from '@/services/organization/intelligence'
import { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']
type DriveFile = Database['public']['Tables']['drive_files']['Row']
type Person = Database['public']['Tables']['people']['Row']
type Project = Database['public']['Tables']['projects']['Row']

// Helper to get valid access token
async function getValidAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  const tokenData = data as GoogleOAuthToken | null

  if (error || !tokenData) {
    return null
  }

  const expiresAt = new Date(tokenData.expires_at)
  const now = new Date()

  if (expiresAt <= now) {
    try {
      const newCredentials = await refreshAccessToken(tokenData.refresh_token)

      if (!newCredentials.access_token) {
        return null
      }

      const newExpiresAt = newCredentials.expiry_date
        ? new Date(newCredentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString()

      await supabase
        .from('google_oauth_tokens')
        .update({
          access_token: newCredentials.access_token,
          expires_at: newExpiresAt,
        } as never)
        .eq('user_id', userId)

      return newCredentials.access_token
    } catch {
      return null
    }
  }

  return tokenData.access_token
}

// Process a single file with intelligent classification
async function processFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accessToken: string,
  file: DriveFile,
  people: Person[],
  projects: Project[]
): Promise<{
  success: boolean
  zone?: string
  type?: string
  detectedPeople?: string[]
  detectedProjects?: string[]
  suggestedPath?: string
  newPeople?: Person[]
  newProjects?: Project[]
}> {
  try {
    const content = await extractFileContent(
      accessToken,
      file.drive_file_id,
      file.mime_type
    )

    const result = await intelligentClassify(
      userId,
      {
        id: file.id,
        name: file.name,
        mimeType: file.mime_type,
        fullPath: file.full_path,
        driveFileId: file.drive_file_id,
      },
      content,
      { people, projects }
    )

    // Save to database with auto-create entities enabled
    const { newPeople, newProjects } = await saveIntelligentClassification(
      userId,
      file.id,
      result,
      {
        autoCreateEntities: true,
        existingPeople: people,
        existingProjects: projects,
      }
    )

    return {
      success: true,
      zone: result.zone,
      type: result.documentType,
      detectedPeople: result.detectedPeople.map((p) => p.name),
      detectedProjects: result.detectedProjects.map((p) => p.name),
      suggestedPath: result.suggestedPath,
      newPeople,
      newProjects,
    }
  } catch {
    return { success: false }
  }
}

// POST /api/drive/intelligent-classify - Stream intelligent classification progress
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  // Parse request body for optional zone filter
  let reclassifyZone: string | null = null
  try {
    const body = await request.json()
    reclassifyZone = body.zone || null
  } catch {
    // No body or invalid JSON - classify pending files only
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const supabase = await createClient()

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) {
          send({ error: 'Unauthorized', done: true })
          controller.close()
          return
        }

        const accessToken = await getValidAccessToken(supabase, user.id)
        if (!accessToken) {
          send({ error: 'Google Drive not connected', done: true })
          controller.close()
          return
        }

        // Pre-fetch all people and projects for efficiency
        const { data: peopleData } = await supabase
          .from('people')
          .select('*')
          .eq('user_id', user.id)
          .is('deleted_at', null)

        const { data: projectsData } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .is('deleted_at', null)

        const people = (peopleData || []) as Person[]
        const projects = (projectsData || []) as Project[]

        // Get files to classify - either pending, specific zone, or ALL
        let query = supabase
          .from('drive_files')
          .select('*')
          .eq('user_id', user.id)

        if (reclassifyZone === 'ALL') {
          // Re-classify ALL files - no filter
        } else if (reclassifyZone) {
          // Re-classify files from a specific zone
          query = query.eq('zone', reclassifyZone)
        } else {
          // Only classify files not yet classified
          query = query.is('document_type', null)
        }

        const { data: allFiles } = await query.limit(5000)

        const files = (allFiles as DriveFile[] | null) || []

        if (files.length === 0) {
          send({
            status: 'complete',
            done: true,
            classified: 0,
            message: 'No files to classify',
          })
          controller.close()
          return
        }

        send({
          status: 'starting',
          total: files.length,
          peopleCount: people.length,
          projectsCount: projects.length,
        })

        let totalClassified = 0
        let totalErrors = 0
        let totalNewPeople = 0
        let totalNewProjects = 0
        const detectedAssociations = {
          people: new Set<string>(),
          projects: new Set<string>(),
        }
        const PARALLEL_BATCH_SIZE = 10

        // Mutable arrays that grow as we auto-create entities
        const currentPeople = [...people]
        const currentProjects = [...projects]

        // Process in parallel batches
        for (let i = 0; i < files.length; i += PARALLEL_BATCH_SIZE) {
          const batch = files.slice(i, i + PARALLEL_BATCH_SIZE)

          const results = await Promise.all(
            batch.map((file) =>
              processFile(supabase, user.id, accessToken, file, currentPeople, currentProjects)
            )
          )

          for (const result of results) {
            if (result.success) {
              totalClassified++
              result.detectedPeople?.forEach((p) => detectedAssociations.people.add(p))
              result.detectedProjects?.forEach((p) => detectedAssociations.projects.add(p))

              // Add newly created entities to current lists for subsequent batches
              if (result.newPeople) {
                totalNewPeople += result.newPeople.length
                currentPeople.push(...result.newPeople)
                result.newPeople.forEach(p => detectedAssociations.people.add(p.name))
              }
              if (result.newProjects) {
                totalNewProjects += result.newProjects.length
                currentProjects.push(...result.newProjects)
                result.newProjects.forEach(p => detectedAssociations.projects.add(p.name))
              }
            } else {
              totalErrors++
            }
          }

          send({
            status: 'progress',
            classified: totalClassified,
            errors: totalErrors,
            remaining: files.length - (i + batch.length),
            current: batch[batch.length - 1]?.name,
            detectedPeople: Array.from(detectedAssociations.people),
            detectedProjects: Array.from(detectedAssociations.projects),
            newPeopleCount: totalNewPeople,
            newProjectsCount: totalNewProjects,
          })

          if (i + PARALLEL_BATCH_SIZE < files.length) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        }

        // Log the action
        await supabase.from('drive_audit_log').insert({
          user_id: user.id,
          action: 'INTELLIGENT_CLASSIFY',
          action_params: {
            total_classified: totalClassified,
            total_errors: totalErrors,
            new_people_created: totalNewPeople,
            new_projects_created: totalNewProjects,
            detected_people: Array.from(detectedAssociations.people),
            detected_projects: Array.from(detectedAssociations.projects),
          },
          triggered_by: 'user',
        } as never)

        send({
          status: 'complete',
          done: true,
          classified: totalClassified,
          errors: totalErrors,
          detectedPeople: Array.from(detectedAssociations.people),
          detectedProjects: Array.from(detectedAssociations.projects),
          newPeopleCount: totalNewPeople,
          newProjectsCount: totalNewProjects,
          message: `Done! Classified ${totalClassified} files. Auto-created ${totalNewPeople} people and ${totalNewProjects} projects.`,
        })
      } catch (error) {
        send({
          error: error instanceof Error ? error.message : 'Classification failed',
          done: true,
        })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
