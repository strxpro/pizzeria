-- Startowe menu (to samo, co w src/lib/data.ts). Uruchamiane po migracjach: supabase db reset / seed.
insert into public.menu_categories (id, label, position) values
  ('classiche', 'Classiche', 0),
  ('speciali', 'Speciali', 1),
  ('bevande', 'Bevande', 2),
  ('dolci', 'Dolci', 3)
on conflict (id) do nothing;

insert into public.menu_items (id, category_id, name, description, price, tag, art, available, position) values
  ('margherita', 'classiche', 'Margherita', 'San Marzano, fiordilatte, basilico, olio EVO', 7.50, 'Più amata', 'margherita', true, 0),
  ('marinara', 'classiche', 'Marinara', 'Pomodoro, aglio, origano, olio EVO', 6.50, 'Vegetariana', 'marinara', true, 1),
  ('diavola', 'classiche', 'Diavola', 'Pomodoro, fiordilatte, salame piccante', 9.50, 'Piccante', 'diavola', true, 2),
  ('capricciosa', 'classiche', 'Capricciosa', 'Prosciutto cotto, funghi, carciofi, olive', 11.00, null, 'capricciosa', true, 3),
  ('prosciutto-funghi', 'classiche', 'Prosciutto e funghi', 'Pomodoro, fiordilatte, cotto, champignon', 10.00, null, 'funghi', true, 4),
  ('quattro-formaggi', 'classiche', 'Quattro formaggi', 'Fiordilatte, gorgonzola, pecorino, parmigiano', 11.50, 'Vegetariana', 'quattro', true, 5),
  ('bufalina', 'speciali', 'Bufalina', 'Pomodoro, mozzarella di bufala DOP, basilico', 10.50, null, 'bufalina', true, 0),
  ('tartufo-porcini', 'speciali', 'Tartufo e porcini', 'Fiordilatte, porcini, crema al tartufo nero', 15.50, 'Novità', 'tartufo', true, 1),
  ('nduja', 'speciali', 'Nduja e stracciatella', 'Nduja di Spilinga, stracciatella, limone', 14.00, 'Piccante', 'nduja', true, 2),
  ('mortadella', 'speciali', 'Mortadella e pistacchio', 'Fiordilatte, mortadella IGP, pesto di pistacchio', 14.50, null, 'mortadella', true, 3),
  ('acqua', 'bevande', 'Acqua', 'Naturale o frizzante, 0,5 L', 1.50, null, null, true, 0),
  ('coca-cola', 'bevande', 'Coca-Cola', '0,33 L', 2.50, null, null, true, 1),
  ('chinotto', 'bevande', 'Chinotto', '0,275 L', 2.80, null, null, true, 2),
  ('moretti', 'bevande', 'Birra Moretti', '0,33 L', 3.50, null, null, true, 3),
  ('tiramisu', 'dolci', 'Tiramisù', 'Fatto in casa, savoiardi e mascarpone', 5.50, null, null, true, 0),
  ('panna-cotta', 'dolci', 'Panna cotta', 'Con frutti di bosco', 5.00, null, null, true, 1),
  ('cannolo', 'dolci', 'Cannolo siciliano', 'Ricotta e pistacchio', 4.80, null, null, true, 2)
on conflict (id) do nothing;
