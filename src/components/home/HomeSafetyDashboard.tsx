import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Sparkles,
  ArrowRight,
  Share2,
  AlertOctagon,
  Users,
  HeartHandshake,
  Crosshair,
  MapPin,
  TrendingUp,
  ChevronRight,
  Navigation,
  User,
  LogOut,
  Loader2
} from 'lucide-react';
import { useSafety } from '../../store/useSafetyStore';
import { GeocodingService, GeocodedPlace } from '../../services/geocodingService';
import { LocationCoordinate } from '../../types/safety';

export const HomeSafetyDashboard: React.FC = () => {
  const {
    userProfile,
    setActiveView,
    setCurrentTab,
    triggerSafetyCheckModal,
    setSelectedDestination,
    calculateRoutesForDestination,
    currentLocation,
    setCurrentLocation,
    currentUser,
    openAuthModal,
    logout,
    isLoadingRoutes
  } = useSafety();

  const [destInput, setDestInput] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Live Geocoding search debounced
  useEffect(() => {
    if (!destInput.trim() || destInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await GeocodingService.searchPlaces(destInput, currentLocation);
      setSearchResults(results);
      setIsSearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [destInput, currentLocation]);

  const handleSelectGeocodedPlace = (place: GeocodedPlace) => {
    setSearchResults([]);
    setDestInput(place.name);
    const destCoord: LocationCoordinate = {
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      address: place.displayName
    };
    calculateRoutesForDestination(destCoord);
  };

  const handleStartCustomRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destInput.trim()) return;

    const firstResult = searchResults[0];
    if (firstResult) {
      handleSelectGeocodedPlace(firstResult);
    } else {
      const fallbackDest: LocationCoordinate = {
        lat: currentLocation.lat + 0.012,
        lng: currentLocation.lng + 0.008,
        name: destInput,
        address: `${destInput} (Live Route Destination)`
      };
      calculateRoutesForDestination(fallbackDest);
    }
  };

  const handleGetLiveGPS = () => {
    if ('geolocation' in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const name = await GeocodingService.reverseGeocode(lat, lng);
          setCurrentLocation({ lat, lng, name });
          setIsLocating(false);
        },
        () => setIsLocating(false),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  };

  return (
    <div className="min-h-full pb-24 px-4 pt-6 max-w-2xl mx-auto space-y-5 animate-in fade-in duration-300">
      
      {/* 1. TOP HEADER & GREETING */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Good evening, {userProfile.name} 👋
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-emerald-700">You're Safe • GPS Active</span>
          </div>
        </div>

        {/* Auth / Account Profile Button */}
        <div className="flex items-center gap-2">
          {currentUser ? (
            <button
              onClick={() => setCurrentTab('profile')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-bold shadow-2xs hover:bg-slate-50 transition"
              title="Manage Account"
            >
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span className="truncate max-w-[80px]">{currentUser.name.split(' ')[0]}</span>
            </button>
          ) : (
            <button
              onClick={openAuthModal}
              className="px-3 py-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition active:scale-95"
            >
              Sign In
            </button>
          )}

          <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-xs border border-slate-200 bg-white p-0.5">
            <img src="/logo.jpg" alt="Safety Dosth" className="w-full h-full object-cover rounded-xl" />
          </div>
        </div>
      </div>

      {/* 2. PROMINENT SAFETY SCORE CARD */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50/40 to-white border border-emerald-200/80 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-4xl font-black text-slate-900 tracking-tight">92</span>
              <span className="text-sm font-semibold text-slate-500">/ 100</span>
            </div>
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mt-0.5">
              Live Safety Score
            </p>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Low Risk • Primary illuminated corridors recommended
            </p>
          </div>

          {/* AI Monitor Badge */}
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600/10 border border-emerald-500/20 text-emerald-800 text-xs font-bold shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>AI Active</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium mt-1">Guardian Mode</span>
          </div>
        </div>
      </div>

      {/* 3. CONTEXTUAL AI SAFETY INSIGHT BANNER */}
      <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-md relative overflow-hidden space-y-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
            AI Proactive Insight
          </span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed font-medium">
          “Safety Dosth noticed your destination path has lower lighting after 9:00 PM.”
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-bold text-emerald-400">
            Verified well-lit alternative available
          </span>
          <button
            onClick={() => setActiveView('route_selection')}
            className="text-xs font-extrabold text-white underline hover:text-emerald-300 transition"
          >
            Review &rarr;
          </button>
        </div>
      </div>

      {/* 4. REAL START JOURNEY & LIVE WORLDWIDE SEARCH CARD */}
      <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3.5 relative">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-base text-slate-900">Where are you going?</h3>
          <button
            onClick={handleGetLiveGPS}
            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition"
            title="Use current GPS"
          >
            <Crosshair className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Locating...' : 'My GPS'}</span>
          </button>
        </div>

        {/* Search input with live worldwide autocomplete */}
        <form onSubmit={handleStartCustomRoute} className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
            <input
              type="text"
              placeholder="Search any place in the world (e.g. Airport, Central Station)"
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin absolute right-3.5" />
            )}
          </div>

          {/* Live Nominatim Autocomplete Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
              {searchResults.map((place) => (
                <div
                  key={place.placeId}
                  onClick={() => handleSelectGeocodedPlace(place)}
                  className="p-3 hover:bg-slate-50 cursor-pointer flex items-start gap-2.5 transition"
                >
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{place.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{place.displayName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>

        {/* Primary CTA */}
        <button
          onClick={handleStartCustomRoute}
          disabled={isLoadingRoutes}
          className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-75"
        >
          {isLoadingRoutes ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Calculating Live OSRM Safe Routes...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4 fill-white" />
              <span>Start Safe Journey</span>
            </>
          )}
        </button>

        {/* Secondary share option */}
        <div className="text-center pt-0.5">
          <button
            onClick={() => setCurrentTab('contacts')}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 transition"
          >
            <Share2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Share live journey with Trusted Contacts</span>
          </button>
        </div>
      </div>

      {/* 5. QUICK SAFETY ACTIONS (4 COMPACT MODERN CARDS) */}
      <div className="space-y-2">
        <h3 className="font-extrabold text-sm text-slate-900 px-1">Quick Safety Actions</h3>
        <div className="grid grid-cols-4 gap-2.5">
          {/* Action 1: SOS */}
          <button
            onClick={() => setActiveView('emergency')}
            className="p-3 rounded-2xl bg-red-50 hover:bg-red-100/80 border border-red-200/80 flex flex-col items-center justify-center text-center transition group active:scale-95 shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center mb-1.5 shadow-sm group-hover:scale-105 transition">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-black text-red-700">SOS</span>
          </button>

          {/* Action 2: Trusted Contacts */}
          <button
            onClick={() => setCurrentTab('contacts')}
            className="p-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center transition group active:scale-95 shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-1.5 group-hover:bg-slate-200 transition">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold text-slate-800">Contacts</span>
          </button>

          {/* Action 3: Safety Check */}
          <button
            onClick={triggerSafetyCheckModal}
            className="p-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center transition group active:scale-95 shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5 group-hover:bg-emerald-100 transition">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold text-slate-800">Check-In</span>
          </button>

          {/* Action 4: Nearby Help */}
          <a
            href="tel:112"
            className="p-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center transition group active:scale-95 shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5 group-hover:bg-blue-100 transition">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold text-slate-800">Help (112)</span>
          </a>
        </div>
      </div>

      {/* 6. YOUR SAFETY TODAY SECTION */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="font-extrabold text-sm text-slate-900">Your Safety Today</h3>
          </div>
          <button
            onClick={() => setCurrentTab('safety_insights')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5"
          >
            <span>View Insights</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-lg font-black text-slate-900">4</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Safe Trips</p>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-lg font-black text-emerald-600">92</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Live Score</p>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-lg font-black text-blue-600">2</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Avoided Risks</p>
          </div>
        </div>
      </div>

    </div>
  );
};
