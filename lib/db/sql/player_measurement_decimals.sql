-- Keep first-entry and test measurements distinct, without rounding centimetres or kilograms.
ALTER TABLE players ALTER COLUMN height TYPE double precision USING height::double precision;
ALTER TABLE players ALTER COLUMN weight TYPE double precision USING weight::double precision;
