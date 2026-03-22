insert into campaign_board.faction_missions (faction, title, reward, location, hook, status, assigned_to, notes)
values
  ('Harpers 🎼', 'Shadows Beneath the Dock Ward', '250 gp', 'Dock Ward', 'A cell of smugglers has been moving cursed relics after dusk. Find the cache before the watch stumbles into it.', 'Available', null, 'Ideal opening mission.'),
  ('Force Grey 🥷', 'The Stone that Whispers', 'A favour from Vajra', 'Castle Ward', 'A speaking fragment of primordial stone has resurfaced. Retrieve it before every cult in the city catches the scent.', 'Accepted', 'Cassian', 'This one points neatly toward giant trouble.');

insert into campaign_board.story_arcs (title, type, blurb, is_visible)
values
  ('The Ember Crown Conspiracy', 'MSQ', 'Rumours from the markets suggest that a stolen draconic crown is quietly changing hands among the city''s wealthiest houses.', true),
  ('The Lanterns Below', 'SQ', 'A chain of disappearances in the sewers has left behind only salt, candle wax, and a hymn nobody admits to knowing.', true),
  ('The Giant''s Petition', 'MSQ/SQ', 'An exiled goliath receives a message carved into mountain-stone: return, or watch the old blood wake without you.', true);
