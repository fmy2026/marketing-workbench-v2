-- Target database: marketing_workbench_v2
-- Scope: P04 video material local asset registration.
-- Stores v2-owned local MP4 metadata only. Does not store legacy source paths.

UPDATE mwb.game_assets
SET asset_hash = '3240649a53786763244421475235e4ec4ddd735cf00c41bf9b576461399cc028',
    metadata = metadata || jsonb_build_object(
      'local_file',
      jsonb_build_object(
        'path', '/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/videos/JSZC-HUNT-4IG2-3.mp4',
        'sha256', '3240649a53786763244421475235e4ec4ddd735cf00c41bf9b576461399cc028',
        'size_bytes', 118915155,
        'source', 'v2_independent_local_asset_copy',
        'legacy_source_path_stored', false
      )
    ),
    updated_at = now()
WHERE asset_id = 'JSZC-HUNT-4IG2-3'
  AND game_code = 'JSZC';

UPDATE mwb.game_assets
SET asset_hash = 'de340357f8485b85fe5240c5951d0d0af52cbacf3dcf6dbec5d076b44ca39db6',
    metadata = metadata || jsonb_build_object(
      'local_file',
      jsonb_build_object(
        'path', '/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/videos/JSZC-HUNT-4GE6-14.mp4',
        'sha256', 'de340357f8485b85fe5240c5951d0d0af52cbacf3dcf6dbec5d076b44ca39db6',
        'size_bytes', 15562862,
        'source', 'v2_independent_local_asset_copy',
        'legacy_source_path_stored', false
      )
    ),
    updated_at = now()
WHERE asset_id = 'JSZC-HUNT-4GE6-14'
  AND game_code = 'JSZC';
