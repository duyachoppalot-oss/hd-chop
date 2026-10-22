-- How often condition wording survives in source text.
-- If these are near zero, fix the PDF extractor before building conditions.
SELECT
  COUNT(*)                                                     AS total,
  COUNT(*) FILTER (WHERE description ~* 'carb')                AS carb,
  COUNT(*) FILTER (WHERE description ~* '\yefi\y|inject')      AS efi,
  COUNT(*) FILTER (WHERE description ~* '\yabs\y')             AS abs,
  COUNT(*) FILTER (WHERE description ~* '\ycvo\y')             AS cvo,
  COUNT(*) FILTER (WHERE description ~* 'calif|\yhdi\y')       AS ca_hdi,
  COUNT(*) FILTER (WHERE description ~* 'hydraulic|cable')     AS clutch
FROM oem_fitment;

-- Sample rows that mention a condition, to see the real phrasing.
SELECT description
FROM oem_fitment
WHERE description ~* 'carb|\yefi\y|inject|\yabs\y|\ycvo\y|calif|\yhdi\y'
LIMIT 50;
