import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, MapPin, Plus, ShieldCheck, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Map } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { reverseGeocodeFn } from "@/lib/maps.functions";
import { formatDistance, haversineMeters } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Community safety reports — Safety Dosth" },
      {
        name: "description",
        content: "See and confirm real safety reports shared by people walking the same streets as you.",
      },
      { property: "og:title", content: "Community safety reports — Safety Dosth" },
      { property: "og:description", content: "Real reports from the community, confirmed by neighbours." },
    ],
  }),
  component: ReportsPage,
});

const CATEGORIES = [
  { value: "poor_lighting", label: "Poor lighting" },
  { value: "harassment", label: "Harassment" },
  { value: "unsafe_area", label: "Unsafe area" },
  { value: "stray_animals", label: "Stray animals" },
  { value: "road_hazard", label: "Road hazard" },
  { value: "other", label: "Other" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  community: "Community report",
  multiple: "Confirmed by several",
  verified: "Verified",
};

interface ReportRow {
  id: string;
  category: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  photo_url: string | null;
  status: string;
  confirmations: number;
  created_at: string;
}

function label(category: string) {
  return CATEGORIES.find((c) => c.value === category)?.label ?? "Other";
}

function ReportsPage() {
  const geo = useGeolocation(true);
  const reverse = useServerFn(reverseGeocodeFn);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("poor_lighting");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const pos = geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null;

  const load = useCallback(async () => {
    const [{ data, error }, { data: mine }] = await Promise.all([
      supabase
        .from("community_reports")
        .select("id,category,description,lat,lng,address,photo_url,status,confirmations,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("report_confirmations").select("report_id"),
    ]);
    if (error) toast.error(error.message);
    setReports(data ?? []);
    setConfirmed((mine ?? []).map((r) => r.report_id));
    setLoading(false);

    const withPhotos = (data ?? []).filter((r) => r.photo_url);
    if (withPhotos.length > 0) {
      const { data: signed } = await supabase.storage
        .from("report-photos")
        .createSignedUrls(withPhotos.map((r) => r.photo_url as string), 3600);
      const map: Record<string, string> = {};
      signed?.forEach((s, i) => {
        const report = withPhotos[i];
        if (report && s.signedUrl) map[report.id] = s.signedUrl;
      });
      setPhotoUrls(map);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    if (!pos) return reports;
    return [...reports].sort(
      (a, b) => haversineMeters(pos, { lat: a.lat, lng: a.lng }) - haversineMeters(pos, { lat: b.lat, lng: b.lng }),
    );
  }, [reports, pos?.lat, pos?.lng]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pos) {
      toast.error("We need your location to place this report.");
      return;
    }
    setBusy(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Session expired");

      let photoPath: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("report-photos").upload(path, file);
        if (upErr) throw upErr;
        photoPath = path;
      }

      let address: string | null = null;
      try {
        address = (await reverse({ data: pos })).address;
      } catch {
        address = null;
      }

      const { error } = await supabase.from("community_reports").insert({
        user_id: userId,
        category,
        description: description.trim() || null,
        lat: pos.lat,
        lng: pos.lng,
        address,
        photo_url: photoPath,
      });
      if (error) throw error;

      setOpen(false);
      setDescription("");
      setFile(null);
      setCategory("poor_lighting");
      await load();
      toast.success("Report shared with the community");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit that report.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(reportId: string) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return void toast.error("Session expired");
    const { error } = await supabase.from("report_confirmations").insert({ report_id: reportId, user_id: userId });
    if (error) return void toast.error(error.message);
    setConfirmed((c) => [...c, reportId]);
    setReports((rs) => rs.map((r) => (r.id === reportId ? { ...r, confirmations: r.confirmations + 1 } : r)));
    toast.success("Thanks for confirming");
  }

  return (
    <AppShell title="Community reports" subtitle="Real reports from people nearby — confirm what you've seen">
      <div className="surface-card mb-4 h-48 overflow-hidden">
        <Map
          center={pos}
          markers={[
            ...(pos ? [{ id: "me", lat: pos.lat, lng: pos.lng, label: "You", kind: "user" as const }] : []),
            ...sorted.map((r) => ({
              id: r.id,
              lat: r.lat,
              lng: r.lng,
              label: label(r.category),
              kind: "report" as const,
            })),
          ]}
        />
      </div>

      <Button className="mb-4 w-full" onClick={() => setOpen((o) => !o)}>
        {open ? <X className="size-4" /> : <Plus className="size-4" />} {open ? "Cancel" : "Report something here"}
      </Button>

      {open ? (
        <form onSubmit={submit} className="surface-card mb-4 space-y-3 p-4">
          <div>
            <Label className="text-xs">Category</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    category === c.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="desc" className="text-xs">
              What happened? (optional)
            </Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Keep it factual — no personal details."
            />
          </div>
          <div>
            <Label htmlFor="photo" className="text-xs">
              Photo (optional)
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Camera className="size-4 text-muted-foreground" />
              <Input
                id="photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" />
            {pos ? "Pinned to your current GPS location" : geo.error ?? "Waiting for your location…"}
          </p>
          <Button type="submit" className="w-full" disabled={busy || !pos}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Submit report
          </Button>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading community reports…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No community reports yet in this area.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => (
            <li key={r.id} className="surface-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label(r.category)}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.address ?? "Address unavailable"}</p>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.status === "verified"
                      ? "bg-safe-soft text-safe"
                      : r.status === "multiple"
                        ? "bg-caution-soft text-caution-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <ShieldCheck className="size-3" /> {STATUS_LABEL[r.status] ?? "Community report"}
                </span>
              </div>
              {r.description ? <p className="mt-2 text-xs text-foreground/80">{r.description}</p> : null}
              {photoUrls[r.id] ? (
                <img
                  src={photoUrls[r.id]}
                  alt={`${label(r.category)} report photo`}
                  loading="lazy"
                  className="mt-2 h-36 w-full rounded-xl object-cover"
                />
              ) : null}
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {new Date(r.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  {pos ? ` · ${formatDistance(haversineMeters(pos, { lat: r.lat, lng: r.lng }))} away` : ""}
                </span>
                <button
                  type="button"
                  disabled={confirmed.includes(r.id)}
                  onClick={() => void confirm(r.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
                    confirmed.includes(r.id) ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary"
                  }`}
                >
                  <ThumbsUp className="size-3.5" />
                  {confirmed.includes(r.id) ? "Confirmed" : "Confirm"} · {r.confirmations}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
