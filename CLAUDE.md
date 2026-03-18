# Project Helios - Claude Code Context

## Project Overview
Personal AI financial assistant for David (Noctworks founder). Multi-tenant architecture for future Jane AI deployment.

## Tech Stack
- Next.js 15 (App Router), Tailwind, shadcn/ui
- Supabase (Postgres + pgvector + Auth + Storage + Edge Functions)
- Claude API (Haiku for categorization, Sonnet for queries)
- Teller API (banking), Google APIs (calendar/email/tasks)
- Whisper (STT), ElevenLabs (TTS)

## Key Patterns
- All tables have user_id for multi-tenancy
- Soft deletes with deleted_at
- RLS policies on all tables
- Server components by default, client only when needed
- Streaming for AI responses

## Current Phase
Phase 1: Foundation
Check task_plan.md for current work

## Code Style
- TypeScript strict mode
- Functional components only
- Named exports
- Descriptive variable names
- No console.log in production code (use proper logging)

## Testing
- Vitest for unit tests
- Playwright for E2E (later)
- Test files adjacent to source files

## Commands
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run test` - Run tests
- `npm run db:migrate` - Run migrations
- `npm run db:seed` - Seed database

## Important Files
- `/src/lib/supabase/client.ts` - Supabase client
- `/src/lib/ai/claude.ts` - Claude API wrapper
- `/src/lib/banking/teller.ts` - Teller integration
- `/src/services/` - Business logic services

## Do Not Modify
- `.env.local` - Secrets (never commit)
- `supabase/migrations/` - Do not modify existing migrations, only add new ones

## Constraints
- No em-dashes in code comments or UI text
- Concise, natural language
- Mobile-first responsive design
- Cost-conscious AI usage (Haiku for high-volume tasks)
