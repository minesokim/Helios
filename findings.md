# Jim AI - Research Findings

## Tech Decisions

### Node Version
Using Node 20.x LTS (system has 24.x installed, compatible)

### Next.js 15
- App Router for server components
- Route handlers for API endpoints
- Server actions for mutations

### Supabase
- Postgres with pgvector for document embeddings
- RLS for row-level security
- Edge Functions for background jobs
- Storage for document files

### AI Pipeline
- Claude Haiku: Transaction categorization, document classification (cost: ~$0.25/1M input tokens)
- Claude Sonnet: Query responses, briefing generation, complex reasoning
- text-embedding-3-small: Document embeddings for RAG (1536 dimensions)

### Banking
- Teller API: Free for personal use, supports major US banks
- Webhook for real-time transaction updates
- Manual sync fallback

## Architecture Notes

### Multi-tenancy
All tables include user_id for future Jane AI deployment. RLS policies enforce isolation.

### Document Processing Pipeline
1. Upload to Supabase Storage
2. Extract text (pdf-parse for PDFs, tesseract.js for images)
3. Classify document type with Haiku
4. Chunk text and generate embeddings
5. Store in document_embeddings table

### Voice Pipeline
1. Record audio in browser
2. Send to Whisper API for transcription
3. Process query with Sonnet
4. Generate response
5. Send to ElevenLabs for TTS
6. Play audio in browser

---
