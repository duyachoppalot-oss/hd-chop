-- Top 300 part descriptions: seeds part_concepts.hd_terms from real wording.
-- Adjust column name if discovery 01 shows it differs.
SELECT description, COUNT(*) AS n
FROM oem_fitment
GROUP BY description
ORDER BY n DESC
LIMIT 300;
