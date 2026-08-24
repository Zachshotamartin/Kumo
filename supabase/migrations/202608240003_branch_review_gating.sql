alter table public.branch_reviews
  add column if not exists reviewed_checksum text;

create index if not exists branch_reviews_blocking_idx
  on public.branch_reviews(branch_id, status, reviewed_checksum);
