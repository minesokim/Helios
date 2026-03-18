# Project Helios - Task Plan

## Current Phase: 3 - Document Intelligence (STARTING)

### Phase 2 + 2.5: Financial Core - COMPLETE
- [x] Teller API integration
- [x] Bank account connection flow
- [x] Transaction sync service
- [x] AI categorization pipeline (Claude Haiku)
- [x] Transaction list UI with filtering
- [x] Dashboard with real data
- [x] Subscription detection service
- [x] Subscriptions UI page
- [x] Spending analytics charts (Recharts)
- [x] Build passes clean

### Phase 3: Document Intelligence (IN PROGRESS)
1. [ ] File upload component (drag-drop, multi-file)
2. [ ] Supabase Storage integration
3. [ ] OCR pipeline (PDF text extraction, image OCR)
4. [ ] Document auto-categorization (contract, invoice, receipt, etc.)
5. [ ] Vector embeddings generation (text-embedding-3-small)
6. [ ] pgvector RAG search implementation
7. [ ] Document-transaction linking
8. [ ] Document viewer UI
9. [ ] Document search UI

### Prerequisites
- [ ] Enable Supabase Storage bucket
- [ ] Add OpenAI API key for embeddings (or use Claude)
- [ ] Install pdf-parse, sharp for document processing

## API Endpoints Created

**Banking:**
- POST /api/banking/connect - Handle Teller Connect callback
- POST /api/banking/sync - Sync transactions
- GET /api/banking/accounts - List accounts
- DELETE /api/banking/accounts?id= - Disconnect account

**Transactions:**
- GET /api/transactions - List with filters
- PATCH /api/transactions - Update transaction
- POST /api/transactions/categorize - Run AI categorization

**Analytics:**
- GET /api/analytics - Spending analytics
- GET /api/categories - List categories

## Notes
- Teller requires HTTPS in production
- Sandbox provides test bank credentials automatically
- AI categorization uses Haiku for cost efficiency
