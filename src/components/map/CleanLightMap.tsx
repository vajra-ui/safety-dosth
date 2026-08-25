import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useSafety } from '../../store/useSafetyStore';

interface CleanLightMapProps {
  interactive?: boolean;
  showAllRoutes?: boolean;
  className?: string;
}

export const CleanLightMap: React.FC<CleanLightMapProps> = ({
  interactive = true,
  showAllRoutes = true,
  className = 'w-full h-full'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const markerLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const {
    currentLocation,
    selectedRoute,
    availableRoutes,
    journeyState
  } = useSafety();

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const map = L.map(mapContainerRef.current, {
      center: [currentLocation.lat, currentLocation.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive
    });

    // Premium light raster tile layer (CartoDB Positron - light, minimal, soft roads)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; CARTO &copy; OSM'
    }).addTo(map);

    routeLayerGroupRef.current = L.layerGroup().addTo(map);
    markerLayerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update center & routes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routesGroup = routeLayerGroupRef.current;
    const markersGroup = markerLayerGroupRef.current;
    if (!map || !routesGroup || !markersGroup) return;

    routesGroup.clearLayers();
    markersGroup.clearLayers();

    const currPoint = journeyState.isActive
      ? [journeyState.currentCoordinate.lat, journeyState.currentCoordinate.lng]
      : [currentLocation.lat, currentLocation.lng];

    // User Pulse Marker (Clean Light Emerald Dot)
    const userIcon = L.divIcon({
      className: 'user-pin',
      html: `
        <div class="relative flex items-center justify-center w-7 h-7">
          <div class="absolute w-7 h-7 rounded-full bg-emerald-400/30 animate-ping"></div>
          <div class="absolute w-5 h-5 rounded-full bg-emerald-500/40"></div>
          <div class="relative w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white shadow-md"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    L.marker(currPoint as [number, number], { icon: userIcon, zIndexOffset: 500 }).addTo(markersGroup);

    // Draw route polylines
    if (showAllRoutes && availableRoutes) {
      // Fastest / Balanced routes in subtle muted lines
      if (availableRoutes.fastest && selectedRoute.id !== 'fastest') {
        L.polyline(availableRoutes.fastest.coordinates, {
          color: '#94A3B8',
          weight: 3.5,
          opacity: 0.5,
          dashArray: '4, 8'
        }).addTo(routesGroup);
      }
      if (availableRoutes.balanced && selectedRoute.id !== 'balanced') {
        L.polyline(availableRoutes.balanced.coordinates, {
          color: '#94A3B8',
          weight: 3.5,
          opacity: 0.6
        }).addTo(routesGroup);
      }
    }

    // Selected / Active Route (Glowing emerald highlight)
    if (selectedRoute && selectedRoute.coordinates.length > 0) {
      // Subtle glow underlay
      L.polyline(selectedRoute.coordinates, {
        color: '#10B981',
        weight: 8,
        opacity: 0.25
      }).addTo(routesGroup);

      // Main polyline
      L.polyline(selectedRoute.coordinates, {
        color: '#059669',
        weight: 4.5,
        opacity: 0.95
      }).addTo(routesGroup);

      // Destination Marker
      const lastCoord = selectedRoute.coordinates[selectedRoute.coordinates.length - 1];
      const destIcon = L.divIcon({
        className: 'dest-pin',
        html: `
          <div class="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-700 border-2 border-white shadow-md text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      });

      L.marker(lastCoord!, { icon: destIcon }).addTo(markersGroup);

      // Auto fit bounds smoothly
      const bounds = L.latLngBounds(selectedRoute.coordinates);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    } else {
      map.panTo(currPoint as [number, number], { animate: true });
    }
  }, [currentLocation, selectedRoute, availableRoutes, journeyState.currentCoordinate, journeyState.isActive, showAllRoutes]);

  return (
    <div className={`relative overflow-hidden rounded-3xl ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};
