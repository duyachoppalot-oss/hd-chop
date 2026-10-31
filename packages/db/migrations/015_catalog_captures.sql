-- 015: catalog captures from the admin catalog viewer (apps/admin /catalog): a box Laken
-- draws on a catalog page, the words inside it, and what kind of fact it holds. Review
-- material for the next reviewed lists / loaders (DATA_RIGHTS still decides what loads);
-- nothing reads this into the app. Box in PDF points, origin top-left.
-- Removable: DROP TABLE catalog_captures.
BEGIN;

CREATE TABLE catalog_captures (
  capture_id serial       PRIMARY KEY,
  catalog    text         NOT NULL,              -- 'vtwin'
  page       int          NOT NULL CHECK (page > 0),
  x0         numeric(7,1) NOT NULL,
  y0         numeric(7,1) NOT NULL,
  x1         numeric(7,1) NOT NULL,
  y1         numeric(7,1) NOT NULL,
  text       text         NOT NULL,              -- words in the box, one line per row (editable)
  kind       text         NOT NULL CHECK (kind IN ('fitment', 'size', 'stock_spec', 'supersession', 'other')),
  note       text         NOT NULL DEFAULT '',
  status     text         NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'loaded', 'rejected')),
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ON catalog_captures (catalog, page);

COMMENT ON TABLE catalog_captures IS
  'Boxes drawn on catalog pages in the admin viewer: the words inside + the kind of fact. Review material only.';

COMMIT;
