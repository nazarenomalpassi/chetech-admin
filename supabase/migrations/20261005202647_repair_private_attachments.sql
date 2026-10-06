begin;
create table public.repair_order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.repair_access_orders(id),
  object_path text not null unique,
  file_name text not null check(length(file_name)<=200),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  file_size integer not null check(file_size between 1 and 8388608),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(split_part(object_path,'/',1)=order_id::text and split_part(object_path,'/',2)=created_by::text)
);
create index repair_attachments_order_idx on public.repair_order_attachments(order_id,created_at);
alter table public.repair_order_attachments enable row level security;
create policy repair_attachments_read on public.repair_order_attachments for select to authenticated using((select private.can_access_operations()));
create policy repair_attachments_upload on public.repair_order_attachments for insert to authenticated with check((select private.can_access_operations()) and created_by=(select auth.uid()));
grant select,insert on public.repair_order_attachments to authenticated;
grant all on public.repair_order_attachments to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chetech-repair-files','chetech-repair-files',false,8388608,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy chetech_repair_files_read on storage.objects for select to authenticated using(bucket_id='chetech-repair-files' and (select private.can_access_operations()));
create policy chetech_repair_files_upload on storage.objects for insert to authenticated with check(bucket_id='chetech-repair-files' and (select private.can_access_operations()) and split_part(name,'/',2)=(select auth.uid())::text);
create policy chetech_repair_files_cleanup on storage.objects for delete to authenticated using(bucket_id='chetech-repair-files' and split_part(name,'/',2)=(select auth.uid())::text and not exists(select 1 from public.repair_order_attachments where object_path=storage.objects.name));
create or replace function private.record_repair_attachment() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.workshop_events(order_id,kind,message,actor_id) values(new.order_id,'attachment','Foto de equipo agregada',new.created_by);
  return new;
end $$;
create trigger repair_attachment_event after insert on public.repair_order_attachments for each row execute function private.record_repair_attachment();
commit;
