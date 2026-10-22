-- One concept end-to-end on the source data: fuel tanks for Touring.
-- Confirms year/model/OEM columns line up before writing ETL.
SELECT *
FROM oem_fitment
WHERE description ~* 'fuel tank|tank, fuel'
LIMIT 50;
