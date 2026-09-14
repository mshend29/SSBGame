update public.faculties set is_active = false;

insert into public.faculties(name,is_active) values
('Fakultas Teknologi Informasi dan Industri', true),
('Fakultas Hukum dan Bahasa', true),
('Fakultas Ekonomika dan Bisnis', true),
('Fakultas Vokasi', true)
on conflict (name) do update set is_active = excluded.is_active;
