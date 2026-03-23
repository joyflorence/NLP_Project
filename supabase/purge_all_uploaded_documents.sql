-- Purge all uploaded academic documents from Supabase.
-- Run this in the Supabase SQL Editor after first emptying the
-- Storage bucket `academic-docs` from the Supabase Dashboard.
--
-- Recommended order:
-- 1. Storage > academic-docs > delete all files/folders
-- 2. Run this SQL to remove metadata rows
-- 3. Restart backend or use the app's clear-cache action

begin;

-- Remove all document metadata rows.
delete from public.documents;

commit;

-- Verification
select count(*) as remaining_documents from public.documents;
select count(*) as remaining_storage_rows
from storage.objects
where bucket_id = 'academic-docs';
