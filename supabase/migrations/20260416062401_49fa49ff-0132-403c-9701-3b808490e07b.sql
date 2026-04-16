
ALTER TABLE positions DROP CONSTRAINT positions_status_check;
ALTER TABLE positions ADD CONSTRAINT positions_status_check CHECK (status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text, 'PENDING'::text]));
