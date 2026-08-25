import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BellRing,
  Check,
  Copy,
  Flag,
  Hospital,
  Loader2,
  Phone,
  Shield,
  ShieldAlert,
  Siren,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Map } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { nearbyPlacesFn } from "@/lib/maps.functions";
import {
  closestIndex,
  decodePolyline,
  distanceToPath,
  formatDistance,
  formatDuration,
  haversineMeters,
} from "@/lib/geo";
import { soundService } from "@/services/soundService";
import type { LatLng, RouteOption, SafePlace } from "@/lib/maps-types";

export const Route = createFileRoute("/_authenticated/navigate/$id")({
  head: () => ({
    meta: [
      { title: "Live navigation — Safety Dosth" },
      {
        name: "description",
        content: "Follow your route with live safety check-ins, deviation alerts and one-tap DOSTH MODE.",
      },
      { property: "og:title", content: "Live navigation — Safety Dosth" },
      { property: "og:description", content: "Live journey tracking with SOS and trusted circle sharing." },
    ],
  }),
  component: NavigatePage,
});

interface JourneyRow {
  id: string;
  dest_lat: number;
  dest_lng: number;
  dest_address: string | null;
  origin_lat: number;
  origin_lng: number;
  travel_mode: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  status: string;
  is_shared: boolean;
  share_token: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  phone: string | null;
}

const DEVIATION_METERS = 150;

function NavigatePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const geo = useGeolocation(true);
  const nearby = useServerFn(nearbyPlacesFn);

  const [journey, setJourney] = useState<JourneyRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteOption | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [checkMinutes, setCheckMinutes] = useState(10);
  const [deviationAlerts, setDeviationAlerts] = useState(true);
  const [checkDue, setCheckDue] = useState(false);
  const [lastCheck, setLastCheck] = useState(() => Date.now());
  const [deviated, setDeviated] = useState(false);
  const [dosth, setDosth] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);
  const [safePlaces, setSafePlaces] = useState<SafePlace[] | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const lastPush = useRef(0);

  const pos: LatLng | null = geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null;

  // Load journey, route geometry, contacts and safety settings.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: j, error }, { data: c }, { data: s }, { data: shares }] = await Promise.all([
        supabase
          .from("journeys")
          .select(
            "id,dest_lat,dest_lng,dest_address,origin_lat,origin_lng,travel_mode,distance_meters,duration_seconds,status,is_shared,share_token",
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("trusted_contacts").select("id,name,phone").order("created_at"),
        supabase.from("user_settings").select("safety_check_minutes,deviation_alerts").maybeSingle(),
        supabase.from("journey_shares").select("contact_id").eq("journey_id", id),
      ]);
      if (cancelled) return;
      if (error || !j) {
        setLoadError(error?.message ?? "That journey isn't available.");
        return;
      }
      setJourney(j);
      setContacts(c ?? []);
      setSharedIds((shares ?? []).map((r) => r.contact_id));
      if (s) {
        setCheckMinutes(s.safety_check_minutes);
        setDeviationAlerts(s.deviation_alerts);
      }
      const cached = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(`sd-route-${id}`) : null;
      if (cached) {
        try {
          setRoute(JSON.parse(cached) as RouteOption);
        } catch {
          setRoute(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const path = useMemo(() => (route ? decodePolyline(route.polyline) : []), [route]);

  const destination: LatLng | null = journey ? { lat: journey.dest_lat, lng: journey.dest_lng } : null;

  const remaining = useMemo(() => {
    if (!pos || !destination) return null;
    if (path.length > 1) {
      const idx = closestIndex(pos, path);
      let meters = haversineMeters(pos, path[idx]!);
      for (let i = idx; i < path.length - 1; i++) meters += haversineMeters(path[i]!, path[i + 1]!);
      return meters;
    }
    return haversineMeters(pos, destination);
  }, [pos, destination, path]);

  const speedFactor = journey?.travel_mode === "WALK" ? 1.35 : journey?.travel_mode === "BICYCLE" ? 4.2 : 8.5; // m/s
  const etaSeconds = remaining === null ? null : remaining / speedFactor;

  // Push live position to the journey row (at most every 15s).
  useEffect(() => {
    if (!pos || !journey || journey.status !== "active") return;
    const now = Date.now();
    if (now - lastPush.current < 15000) return;
    lastPush.current = now;
    void supabase
      .from("journeys")
      .update({
        current_lat: pos.lat,
        current_lng: pos.lng,
        updated_at: new Date().toISOString(),
        ...(etaSeconds !== null ? { eta: new Date(now + etaSeconds * 1000).toISOString() } : {}),
      })
      .eq("id", journey.id);
  }, [pos?.lat, pos?.lng, journey?.id, journey?.status, etaSeconds]);

  // Deviation detection against the planned polyline.
  useEffect(() => {
    if (!deviationAlerts || !pos || path.length < 2) return;
    const off = distanceToPath(pos, path);
    const isOff = off > DEVIATION_METERS;
    setDeviated((prev) => {
      if (isOff && !prev) {
        soundService.playCountdownTick(true);
        toast.warning("You've moved off the planned route.");
      }
      return isOff;
    });
  }, [pos?.lat, pos?.lng, path, deviationAlerts]);

  // Periodic safety check-in.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Date.now() - lastCheck >= checkMinutes * 60_000) {
        setCheckDue((was) => {
          if (!was) soundService.playCheckInChime();
          return true;
        });
      }
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [lastCheck, checkMinutes]);

  const shareUrl = journey?.share_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${journey.share_token}`
    : null;

  const loadSafePlaces = useCallback(async () => {
    if (!pos) {
      toast.error("Location unavailable — can't find nearby help.");
      return;
    }
    setPlacesLoading(true);
    try {
      const res = await nearby({
        data: { center: pos, categories: ["hospital", "police"], radius: 5000 },
      });
      setSafePlaces(res);
    } catch (err) {
      setSafePlaces([]);
      toast.error(err instanceof Error ? err.message : "Nearby help data unavailable.");
    } finally {
      setPlacesLoading(false);
    }
  }, [pos?.lat, pos?.lng]);

  async function shareWithCircle() {
    if (!journey) return;
    if (contacts.length === 0) {
      toast.error("Add someone to your trusted circle first.");
      navigate({ to: "/circle" });
      return;
    }
    const { error } = await supabase.from("journeys").update({ is_shared: true }).eq("id", journey.id);
    if (error) return void toast.error(error.message);
    const rows = contacts
      .filter((c) => !sharedIds.includes(c.id))
      .map((c) => ({ journey_id: journey.id, contact_id: c.id }));
    if (rows.length > 0) {
      const { error: shareErr } = await supabase.from("journey_shares").insert(rows);
      if (shareErr) return void toast.error(shareErr.message);
    }
    setSharedIds(contacts.map((c) => c.id));
    setJourney({ ...journey, is_shared: true });
    toast.success("Live journey shared with your circle");
    if (shareUrl && navigator.share) {
      void navigator.share({ title: "My live journey — Safety Dosth", url: shareUrl }).catch(() => undefined);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Live link copied");
  }

  function toggleAlarm() {
    if (alarmOn) {
      soundService.stopSOSSiren();
      setAlarmOn(false);
    } else {
      soundService.startSOSSiren();
      setAlarmOn(true);
    }
  }

  async function triggerSos() {
    setDosth(true);
    if (!alarmOn) {
      soundService.startSOSSiren();
      setAlarmOn(true);
    }
    await shareWithCircle();
    void loadSafePlaces();
  }

  async function endJourney(arrived: boolean) {
    if (!journey) return;
    setEnding(true);
    soundService.stopSOSSiren();
    setAlarmOn(false);
    const { error } = await supabase
      .from("journeys")
      .update({ status: arrived ? "completed" : "cancelled", ended_at: new Date().toISOString(), is_shared: false })
      .eq("id", journey.id);
    setEnding(false);
    if (error) return void toast.error(error.message);
    if (arrived) soundService.playSafeArrivalJingle();
    toast.success(arrived ? "You've arrived safely" : "Journey ended");
    navigate({ to: "/home" });
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldAlert className="size-8 text-alert" />
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button onClick={() => navigate({ to: "/home" })}>Back to home</Button>
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your journey…
      </div>
    );
  }

  const nextStep = route?.steps?.[0] ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative h-[42vh] w-full overflow-hidden">
        <Map
          center={pos ?? { lat: journey.origin_lat, lng: journey.origin_lng }}
          markers={[
            ...(pos ? [{ id: "me", lat: pos.lat, lng: pos.lng, label: "You", kind: "user" as const }] : []),
            {
              id: "dest",
              lat: journey.dest_lat,
              lng: journey.dest_lng,
              label: journey.dest_address ?? "Destination",
              kind: "destination" as const,
            },
            ...(safePlaces ?? []).map((p) => ({
              id: p.placeId,
              lat: p.lat,
              lng: p.lng,
              label: p.name,
              kind: "place" as const,
            })),
          ]}
          paths={path.length > 1 ? [{ id: "route", points: path, tone: deviated ? "alert" : "primary", active: true }] : []}
        />
        {deviated ? (
          <div className="absolute inset-x-4 top-4 flex items-center gap-2 rounded-2xl bg-alert px-4 py-2.5 text-xs font-medium text-alert-foreground shadow-lg">
            <AlertTriangle className="size-4 shrink-0" />
            You're more than {DEVIATION_METERS} m off your planned route.
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 px-5 py-4 pb-8">
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Heading to</p>
          <p className="truncate font-display text-lg font-semibold">{journey.dest_address ?? "Destination"}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-semibold">{remaining === null ? "—" : formatDistance(remaining)}</p>
              <p className="text-[11px] text-muted-foreground">Remaining</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{etaSeconds === null ? "—" : formatDuration(etaSeconds)}</p>
              <p className="text-[11px] text-muted-foreground">Time left</p>
            </div>
            <div>
              <p className="text-sm font-semibold">
                {etaSeconds === null
                  ? "—"
                  : new Date(Date.now() + etaSeconds * 1000).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </p>
              <p className="text-[11px] text-muted-foreground">Arrival</p>
            </div>
          </div>
          {geo.error ? <p className="mt-3 text-xs text-alert">{geo.error}</p> : null}
          {nextStep ? (
            <p className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-xs text-primary">
              Next: {nextStep.instruction} · {formatDistance(nextStep.distanceMeters)}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Turn-by-turn steps unavailable for this journey.</p>
          )}
        </div>

        {checkDue ? (
          <div className="surface-card border-caution bg-caution-soft p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-caution-foreground">
              <BellRing className="size-4" /> Safety check-in — are you okay?
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setCheckDue(false);
                  setLastCheck(Date.now());
                  toast.success("Thanks — check-in logged");
                }}
              >
                <Check className="size-4" /> I'm safe
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => void triggerSos()}>
                <Siren className="size-4" /> Need help
              </Button>
            </div>
          </div>
        ) : null}

        <div className={`surface-card p-4 ${dosth ? "border-alert bg-alert-soft" : ""}`}>
          <p className="flex items-center gap-2 font-display text-sm font-semibold">
            <Shield className="size-4 text-primary" /> DOSTH MODE
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            One tap alerts your circle, sounds the alarm and finds the closest help.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="destructive" onClick={() => void triggerSos()}>
              <Siren className="size-4" /> SOS
            </Button>
            <Button variant={alarmOn ? "destructive" : "secondary"} onClick={toggleAlarm}>
              <BellRing className="size-4" /> {alarmOn ? "Stop alarm" : "Alarm"}
            </Button>
            <Button variant="secondary" onClick={() => void loadSafePlaces()} disabled={placesLoading}>
              {placesLoading ? <Loader2 className="size-4 animate-spin" /> : <Hospital className="size-4" />} Nearby help
            </Button>
            <Button variant="secondary" onClick={() => void shareWithCircle()}>
              <Users className="size-4" /> Share live
            </Button>
          </div>

          {contacts[0]?.phone ? (
            <a
              href={`tel:${contacts[0].phone}`}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-safe-soft py-2.5 text-sm font-medium text-safe"
            >
              <Phone className="size-4" /> Call {contacts[0].name}
            </a>
          ) : null}

          {journey.is_shared && shareUrl ? (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-muted py-2.5 text-xs text-muted-foreground"
            >
              <Copy className="size-3.5" /> Copy live link
            </button>
          ) : null}

          {safePlaces !== null ? (
            safePlaces.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Nearby help data unavailable.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {safePlaces.slice(0, 5).map((p) => (
                  <li key={p.placeId} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.category === "hospital" ? "Hospital" : "Police"} · {formatDistance(p.distanceMeters)}
                      </p>
                    </div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-primary-soft px-3 py-1 text-[11px] font-medium text-primary"
                    >
                      Go
                    </a>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/reports" })}>
            <Flag className="size-4" /> Report here
          </Button>
          <Button onClick={() => void endJourney(true)} disabled={ending}>
            {ending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} I've arrived
          </Button>
        </div>
        <button
          type="button"
          onClick={() => void endJourney(false)}
          className="w-full py-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel this journey
        </button>
      </div>
    </div>
  );
}
