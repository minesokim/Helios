-- Vector similarity search function for Drive files
-- Uses pgvector's cosine distance operator

CREATE OR REPLACE FUNCTION search_drive_files(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20,
  filter_user_id uuid DEFAULT NULL,
  filter_zone text DEFAULT NULL
)
RETURNS TABLE (
  file_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.file_id,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM drive_file_embeddings e
  INNER JOIN drive_files f ON f.id = e.file_id
  WHERE
    (filter_user_id IS NULL OR e.user_id = filter_user_id)
    AND (filter_zone IS NULL OR f.zone = filter_zone)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for faster vector searches if not exists
CREATE INDEX IF NOT EXISTS drive_file_embeddings_embedding_idx
  ON drive_file_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_drive_files TO authenticated;

-- Function to find duplicate files based on embedding similarity
CREATE OR REPLACE FUNCTION find_duplicate_files(
  filter_user_id uuid,
  similarity_threshold float DEFAULT 0.92
)
RETURNS TABLE (
  file_id_1 uuid,
  file_id_2 uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e1.file_id AS file_id_1,
    e2.file_id AS file_id_2,
    1 - (e1.embedding <=> e2.embedding) AS similarity
  FROM drive_file_embeddings e1
  INNER JOIN drive_file_embeddings e2
    ON e1.file_id < e2.file_id  -- Avoid duplicates and self-joins
    AND e1.user_id = e2.user_id
  WHERE
    e1.user_id = filter_user_id
    AND 1 - (e1.embedding <=> e2.embedding) > similarity_threshold
  ORDER BY similarity DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION find_duplicate_files TO authenticated;
