-- ═══════════════════════════════════════════
-- SEED DATA — Quarta Billing Time
-- ═══════════════════════════════════════════

-- USERS
INSERT INTO users (email, full_name, role) VALUES
  ('emejia@quarta.co', 'Esteban Mejía Arango', 'super_admin'),
  ('tflorez@quarta.co', 'Tulio Flórez Alzate', 'partner_admin'),
  ('agomez@quarta.co', 'Ana María Gómez', 'attorney'),
  ('acardona@quarta.co', 'Andrés Cardona', 'attorney'),
  ('marango@quarta.co', 'María Fernanda Arango', 'attorney'),
  ('mgaviria@quarta.co', 'María Antonia Gaviria', 'attorney'),
  ('ltoro@quarta.co', 'Lina Toro', 'attorney'),
  ('secheverri@quarta.co', 'Sofía Echeverri', 'attorney');

-- USER PREFERENCES (one per user)
INSERT INTO user_preferences (user_id)
SELECT id FROM users;

-- CLIENTS
INSERT INTO clients (name, billing_type, monthly_hour_cap) VALUES
  ('BPOZEN', 'fee', 2400),
  ('GLUKY GROUP S.A.S.', 'fee', 1800),
  ('PÉREZ Y VILLA S.A.S.', 'hourly', NULL),
  ('HACEB WHIRLPOOL INDUSTRIAL S.A.S.', 'fee', 3600),
  ('GRUPO SINMENTE', 'fee', 1200),
  ('BREAKFAST CLUB S.A.S.', 'hourly', NULL);

-- DEFAULT "General" MATTER for each client
INSERT INTO matters (client_id, name, is_default)
SELECT id, 'General', true FROM clients;

-- Assign all clients to Esteban (super_admin) and Tulio (partner_admin)
INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u
CROSS JOIN clients c
WHERE u.role IN ('super_admin', 'partner_admin');

-- Assign some clients to attorneys for demo
INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u
CROSS JOIN clients c
WHERE u.email = 'acardona@quarta.co';

INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u, clients c
WHERE u.email = 'agomez@quarta.co'
  AND c.name IN ('BPOZEN', 'GLUKY GROUP S.A.S.', 'PÉREZ Y VILLA S.A.S.');

INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u, clients c
WHERE u.email = 'marango@quarta.co'
  AND c.name IN ('HACEB WHIRLPOOL INDUSTRIAL S.A.S.', 'GRUPO SINMENTE');

INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u, clients c
WHERE u.email = 'mgaviria@quarta.co'
  AND c.name IN ('BPOZEN', 'BREAKFAST CLUB S.A.S.');

INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u, clients c
WHERE u.email = 'ltoro@quarta.co'
  AND c.name IN ('GLUKY GROUP S.A.S.', 'HACEB WHIRLPOOL INDUSTRIAL S.A.S.');

INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u, clients c
WHERE u.email = 'secheverri@quarta.co'
  AND c.name IN ('GRUPO SINMENTE', 'PÉREZ Y VILLA S.A.S.', 'BREAKFAST CLUB S.A.S.');
