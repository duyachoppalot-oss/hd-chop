-- 010: tasks in the admin console (apps/admin /tasks, local only).
-- Work for Laken (owner 'laken') or Claude ('claude'). Any change Laken saves sets
-- review = 'pending'; Claude reads those (scripts/dev/notes.mjs), acts, answers in
-- `reply` and sets review = 'reviewed'. `link` is an admin path ('/part/6808655') or a
-- repo file ('reports/name_review.csv').
-- Removable: DROP TABLE admin_tasks.
BEGIN;

CREATE TABLE admin_tasks (
  task_id     serial PRIMARY KEY,
  title       text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  area        text NOT NULL DEFAULT 'Data',      -- Data | Specs | Search | Sources | App | Server
  owner       text NOT NULL DEFAULT 'laken' CHECK (owner IN ('laken', 'claude')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done', 'parked')),
  priority    smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),   -- 1 high, 3 low
  link        text,
  note        text NOT NULL DEFAULT '',          -- Laken's note
  reply       text NOT NULL DEFAULT '',          -- Claude's answer
  review      text NOT NULL DEFAULT 'reviewed' CHECK (review IN ('pending', 'reviewed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON admin_tasks (status, owner);

COMMIT;
