-- 1. Hide reporter / confirmer identity from other users (column-level privileges)
REVOKE SELECT ON public.community_reports FROM authenticated, anon;
GRANT SELECT (id, category, description, lat, lng, address, photo_url, status, confirmations, created_at)
  ON public.community_reports TO authenticated;

REVOKE SELECT ON public.report_confirmations FROM authenticated, anon;
GRANT SELECT (id, report_id, created_at) ON public.report_confirmations TO authenticated;

-- 2. Lock down SECURITY DEFINER trigger helpers - they must never be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recount_report_confirmations() FROM PUBLIC, anon, authenticated;

-- 3. Harden the share-link lookup: strict token format, only active shared journeys
CREATE OR REPLACE FUNCTION public.get_shared_journey(_token text)
 RETURNS TABLE(traveller text, dest_address text, current_lat double precision, current_lng double precision, dest_lat double precision, dest_lng double precision, eta timestamp with time zone, status text, travel_mode text, started_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.display_name, j.dest_address, j.current_lat, j.current_lng, j.dest_lat, j.dest_lng,
         j.eta, j.status, j.travel_mode, j.started_at, j.updated_at
  FROM public.journeys j
  LEFT JOIN public.profiles p ON p.id = j.user_id
  WHERE _token ~ '^[0-9a-f]{32}$'
    AND j.share_token = _token
    AND j.is_shared = true
    AND j.status = 'active'
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_journey(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_journey(text) TO anon, authenticated;