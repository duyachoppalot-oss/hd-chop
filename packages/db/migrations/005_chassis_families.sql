-- 005: FL and FX chassis families get their own platforms (docs/HD_TERMINOLOGY.md).
--   fl = EL/FL/FLH big twins 1936-1984 (Knucklehead, Panhead, Shovelhead; rigid, Hydra-, Duo-, Electra Glide)
--   fx = FX Super Glide swingarm family 1971-1986 (FX, FXE, FXS, FXEF, FXWG, FXB, FXSB), not Softail, not FXR
-- 'vintage' stays for flathead-era models until they get their own families.
ALTER TABLE vehicles DROP CONSTRAINT vehicles_platform_check;
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_platform_check
  CHECK (platform IN ('touring','softail','dyna','sportster','fxr','trike',
                      'v_rod','street','revolution_max','vintage','fl','fx'));
COMMENT ON COLUMN vehicles.platform IS
  'touring | softail | dyna | sportster | fxr | trike | v_rod | street | revolution_max | fl | fx | vintage';
