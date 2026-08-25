import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Crosshair, Loader2, LocateFixed, Route as RouteIcon, Search, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Map } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  autocompletePlacesFn,
  placeDetailsFn,
  planRouteFn,
  reverseGeocodeFn,
} from "@/lib/maps.functions";
import { decodePolyline, formatDistance, formatDuration, formatEta } from "@/lib/geo";
import type { LatLng, PlaceSuggestion, ResolvedPlace, RouteOption, TravelMode } from "@/lib/maps-types";
import type { SafetyAnalysis } from "@/lib/safety-types";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Plan a safe route — Safety Dosth" },
      {
        name: "description",
        content: "Search a destination and compare live routes scored on verified places, weather and community reports.",
      },
      { property: "og:title", content: "Plan a safe route — Safety Dosth" },
      { property: "og:description", content: "Compare routes on real safety signals before you leave." },
    ],
  }),
  component: HomePage,
});

const MODES: { value: TravelMode; label: string }[] = [
  { value: "WALK", label: "Walk" },
  { value: "DRIVE", label: "Drive" },
  { value: "BICYCLE", label: "Cycle" },
  { value: "TRANSIT", label: "Transit" },
];

interface Recent {
  id: string;
  label: string;
  address: string | null;
  lat: number;
  lng: number;
}

function toneClass(score: number | null) {
  if (score === null) return "bg-unknown-soft text-unknown-foreground";
  if (score >= 70) return "bg-safe-soft text-safe";
  if (score >= 45) return "bg-caution-soft text-caution-foreground";
  return "bg-alert-soft text-alert";
}

function HomePage() {
  const navigate = useNavigate();
  const geo = useGeolocation(true);
  const autocomplete = useServerFn(autocompletePlacesFn);
  const details = useServerFn(placeDetailsFn);
  const plan = useServerFn(planRouteFn);
  const reverse = useServerFn(reverseGeocodeFn);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<ResolvedPlace | null>(null);
  const [mode, setMode] = useState<TravelMode>("WALK");
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [safety, setSafety] = useState<SafetyAnalysis | null>(null);
  const [selected, setSelected] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const origin: LatLng | null = geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null;

  useEffect(() => {
    supabase
      .from("recent_destinations")
      .select("id,label,address,lat,lng")
      .order("searched_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecents(data ?? []));
  }, []);

  useEffect(() => {
    if (!origin) return;
    let active = true;
    reverse({ data: origin })
      .then((r) => active && setOriginLabel(r.address))
      .catch(() => active && setOriginLabel(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat?.toFixed(3), origin?.lng?.toFixed(3)]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await autocomplete({ data: { input: query.trim(), bias: origin } });
        setSuggestions(res);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const runPlan = useCallback(
    async (dest: ResolvedPlace, travelMode: TravelMode) => {
      if (!origin) {
        toast.error("We need your location to plan a route.");
        return;
      }
      setPlanning(true);
      setPlanError(null);
      try {
        const res = await plan({
          data: { origin, destination: { lat: dest.lat, lng: dest.lng }, mode: travelMode },
        });
        setRoutes(res.routes);
        setSafety(res.safety);
        setSelected(0);
        if (res.routes.length === 0) setPlanError("No route available for this mode right now.");
      } catch (err) {
        setRoutes([]);
        setSafety(null);
        setPlanError(err instanceof Error ? err.message : "Route data unavailable right now.");
      } finally {
        setPlanning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origin?.lat, origin?.lng],
  );

  async function chooseSuggestion(s: PlaceSuggestion) {
    setQuery("");
    setSuggestions([]);
    try {
      const place = await details({ data: { placeId: s.placeId } });
      setDestination(place);
      void supabase.from("recent_destinations").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id ?? "",
        label: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      });
      await runPlan(place, mode);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load that place.");
    }
  }

  function chooseRecent(r: Recent) {
    const place: ResolvedPlace = { name: r.label, address: r.address ?? "", lat: r.lat, lng: r.lng };
    setDestination(place);
    void runPlan(place, mode);
  }

  async function changeMode(next: TravelMode) {
    setMode(next);
    if (destination) await runPlan(destination, next);
  }

  async function startJourney() {
    const route = routes[selected];
    if (!route || !destination || !origin) return;
    setStarting(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Session expired");
      const { data, error } = await supabase
        .from("journeys")
        .insert({
          user_id: userId,
          origin_lat: origin.lat,
          origin_lng: origin.lng,
          origin_address: originLabel,
          dest_lat: destination.lat,
          dest_lng: destination.lng,
          dest_address: destination.address || destination.name,
          travel_mode: mode,
          distance_meters: Math.round(route.distanceMeters),
          duration_seconds: Math.round(route.durationSeconds),
          current_lat: origin.lat,
          current_lng: origin.lng,
          eta: new Date(Date.now() + route.durationSeconds * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      sessionStorage.setItem(`sd-route-${data.id}`, JSON.stringify(route));
      navigate({ to: "/route" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the journey.");
    } finally {
      setStarting(false);
    }
  }

  const paths = useMemo(
    () =>
      routes.map((r, i) => ({
        id: r.id,
        points: decodePolyline(r.polyline),
        tone: (i === selected ? "primary" : "muted") as "primary" | "muted",
        active: i === selected,
      })),
    [routes, selected],
  );

  const markers = [
    ...(origin ? [{ id: "me", lat: origin.lat, lng: origin.lng, label: "You", kind: "user" as const }] : []),
    ...(destination
      ? [
          {
            id: "dest",
            lat: destination.lat,
            lng: destination.lng,
            label: destination.name,
            kind: "destination" as const,
          },
        ]
      : []),
  ];

  return (
    <AppShell padded={false}>
      <div className="relative">
        <div className="h-[46vh] w-full overflow-hidden">
          <Map center={origin} markers={markers} paths={paths} fitKey={`${destination?.lat}-${selected}`} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
          <div className="pointer-events-auto surface-card p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LocateFixed className="size-3.5 text-primary" />
              <span className="truncate">
                {geo.status === "watching"
                  ? originLabel ?? "Locating address…"
                  : geo.error ?? "Getting your location…"}
              </span>
              {geo.status !== "watching" ? (
                <button type="button" className="ml-auto font-medium text-primary" onClick={geo.start}>
                  Retry
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
              <Search className="size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Where are you going?"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
              {searching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear">
                  <X className="size-4 text-muted-foreground" />
                </button>
              ) : null}
            </div>

            {suggestions.length > 0 ? (
              <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onClick={() => chooseSuggestion(s)}
                      className="w-full px-1 py-2.5 text-left"
                    >
                      <p className="text-sm font-medium">{s.primary}</p>
                      <p className="text-xs text-muted-foreground">{s.secondary}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 pb-28 pt-4">
        <div className="flex gap-2 overflow-x-auto">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => changeMode(m.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                mode === m.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {!destination ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-muted-foreground" /> Recent destinations
            </h2>
            {recents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent destinations yet — search a place to get started.
              </p>
            ) : (
              <ul className="space-y-2">
                {recents.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => chooseRecent(r)}
                      className="surface-card flex w-full items-center gap-3 p-3 text-left"
                    >
                      <Crosshair className="size-4 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.address ?? "Address unavailable"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {planning ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Analysing routes with live safety data…
          </p>
        ) : null}

        {planError ? <p className="text-sm text-alert">{planError}</p> : null}

        {routes.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <RouteIcon className="size-4 text-muted-foreground" /> Route options to{" "}
              {destination?.name ?? "destination"}
            </h2>

            {safety && !safety.comparable ? (
              <p className="rounded-xl bg-unknown-soft px-3 py-2 text-xs text-unknown-foreground">
                Safety scores unavailable — not enough verified data to compare these routes fairly.
              </p>
            ) : null}

            {routes.map((r, i) => {
              const s = safety?.routes.find((x) => x.routeId === r.id) ?? null;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`surface-card w-full p-4 text-left transition-all ${
                    i === selected ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-semibold">
                        {formatDuration(r.durationSeconds)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistance(r.distanceMeters)} · arrive {formatEta(r.durationSeconds)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{r.summary || "Route"}</p>
                    </div>
                    <span
                      className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ${toneClass(
                        s?.score ?? null,
                      )}`}
                    >
                      {s?.score !== null && s?.score !== undefined ? (
                        <>
                          {s.score}
                          <span className="block text-[10px] font-normal">safety</span>
                        </>
                      ) : (
                        "Data unavailable"
                      )}
                    </span>
                  </div>

                  {s?.classification ? (
                    <Badge variant="secondary" className="mt-3 capitalize">
                      {s.classification === "safer"
                        ? "Safer route"
                        : s.classification === "fastest"
                          ? "Fastest route"
                          : "Balanced"}
                    </Badge>
                  ) : null}

                  {i === selected && s ? (
                    <ul className="mt-3 space-y-2 border-t border-border pt-3">
                      {s.factors.map((f) => (
                        <li key={f.label} className="text-xs">
                          <span
                            className={`font-medium ${
                              f.tone === "positive"
                                ? "text-safe"
                                : f.tone === "caution"
                                  ? "text-caution-foreground"
                                  : f.tone === "alert"
                                    ? "text-alert"
                                    : "text-unknown-foreground"
                            }`}
                          >
                            {f.label}
                          </span>
                          {f.detail ? (
                            <span className="block text-muted-foreground">{f.detail}</span>
                          ) : null}
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {f.source === "verified" ? "Verified source" : "Community reported"}
                          </span>
                        </li>
                      ))}
                      {s.unavailable.length > 0 ? (
                        <li className="text-[11px] text-unknown-foreground">
                          Data unavailable: {s.unavailable.join(", ")}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </button>
              );
            })}

            <Button className="w-full" size="lg" onClick={startJourney} disabled={starting}>
              {starting ? "Starting…" : "Start journey"}
            </Button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
