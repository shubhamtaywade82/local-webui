-- Null-safe vector helpers for knowledge_* RAG tables.
-- Apply: psql "$DATABASE_URL" -f database/knowledge_similarity_functions.sql

CREATE OR REPLACE FUNCTION dot_product(a double precision[], b double precision[])
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  na int;
  nb int;
  i int;
  s double precision := 0;
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN NULL;
  END IF;
  na := coalesce(cardinality(a), 0);
  nb := coalesce(cardinality(b), 0);
  IF na = 0 OR nb = 0 OR na <> nb THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..na LOOP
    s := s + a[i] * b[i];
  END LOOP;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION cosine_similarity(a double precision[], b double precision[])
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  dp double precision;
  na double precision;
  nb double precision;
BEGIN
  dp := dot_product(a, b);
  IF dp IS NULL THEN
    RETURN NULL;
  END IF;
  na := dot_product(a, a);
  nb := dot_product(b, b);
  IF na IS NULL OR nb IS NULL OR na = 0 OR nb = 0 THEN
    RETURN NULL;
  END IF;
  RETURN dp / (sqrt(na) * sqrt(nb));
END;
$$;
