import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  ActiveAppView,
  ActiveJourneyState,
  LocationCoordinate,
  MainNavTab,
  RouteOption,
  TrustedContact,
  UserProfile
} from '../types/safety';
import { DEFAULT_ROUTES, INITIAL_USER_PROFILE } from '../services/seedData';
import { RoutingService } from '../services/routingService';
import { GeocodingService } from '../services/geocodingService';
import { authService, AuthUser } from '../services/authService';
import { soundService } from '../services/soundService';

interface SafetyContextType {
  // Navigation & Views
  currentTab: MainNavTab;
  setCurrentTab: (tab: MainNavTab) => void;
  activeView: ActiveAppView;
  setActiveView: (view: ActiveAppView) => void;

  // Search & Destination
  currentLocation: LocationCoordinate;
  setCurrentLocation: (loc: LocationCoordinate) => void;
  selectedDestination: LocationCoordinate | null;
  setSelectedDestination: (dest: LocationCoordinate | null) => void;
  isLoadingRoutes: boolean;
  calculateRoutesForDestination: (dest: LocationCoordinate) => Promise<void>;

  // Routes
  availableRoutes: { safest: RouteOption; balanced: RouteOption; fastest: RouteOption };
  selectedRoute: RouteOption;
  setSelectedRoute: (route: RouteOption) => void;

  // Active Journey
  journeyState: ActiveJourneyState;
  startJourney: (route?: RouteOption) => void;
  pauseJourney: () => void;
  resumeJourney: () => void;
  endJourney: () => void;

  // SOS & Emergency
  isEmergencyActive: boolean;
  triggerEmergencyAlert: () => void;
  cancelEmergencyAlert: () => void;

  // Trusted Contacts & Profile
  userProfile: UserProfile;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  toggleAutoAlert: () => void;
  addTrustedContact: (contact: Omit<TrustedContact, 'id'>) => void;
  removeTrustedContact: (id: string) => void;

  // Real Auth
  currentUser: AuthUser | null;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  logout: () => void;

  // Safety Check
  isSafetyCheckOpen: boolean;
  safetyCheckCountdown: number;
  handleCheckInSafe: () => void;
  handleCheckInEmergency: () => void;
  triggerSafetyCheckModal: () => void;
}

const SafetyContext = createContext<SafetyContextType | null>(null);

export const SafetyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Tabs & Views
  const [currentTab, setCurrentTab] = useState<MainNavTab>('home');
  const [activeView, setActiveView] = useState<ActiveAppView>('main');

  // Auth State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => authService.getCurrentUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setCurrentUser(authService.getCurrentUser());
  };

  const logout = () => {
    authService.logout();
    setCurrentUser(null);
    updateUserProfile({ name: 'Guest' });
  };

  // Locations & GPS
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinate>({
    lat: 11.6643,
    lng: 78.1460,
    name: 'Fairlands, Salem'
  });

  const [selectedDestination, setSelectedDestination] = useState<LocationCoordinate | null>({
    lat: 11.6705,
    lng: 78.1338,
    name: 'Central Bus Stand Terminal',
    address: 'Meyyanur Bypass, Salem'
  });

  // Watch Real GPS when available
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const name = await GeocodingService.reverseGeocode(lat, lng);
          setCurrentLocation({ lat, lng, name });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // Routes
  const [availableRoutes, setAvailableRoutes] = useState(DEFAULT_ROUTES);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption>(DEFAULT_ROUTES.safest);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);

  const calculateRoutesForDestination = async (dest: LocationCoordinate) => {
    setIsLoadingRoutes(true);
    setSelectedDestination(dest);

    try {
      const realRoutes = await RoutingService.calculateRealRoutes(currentLocation, dest, 'walk');
      setAvailableRoutes(realRoutes);
      setSelectedRoute(realRoutes.safest);
      setActiveView('route_selection');
    } catch (e) {
      console.warn('Real route computation error:', e);
      setActiveView('route_selection');
    } finally {
      setIsLoadingRoutes(false);
    }
  };

  // User Profile
  const [userProfile, setUserProfileState] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('safety_dosth_real_profile');
    if (saved) return JSON.parse(saved);
    const auth = authService.getCurrentUser();
    return {
      ...INITIAL_USER_PROFILE,
      name: auth ? auth.name : INITIAL_USER_PROFILE.name,
      phone: auth ? auth.phone : INITIAL_USER_PROFILE.phone
    };
  });

  const updateUserProfile = (patch: Partial<UserProfile>) => {
    setUserProfileState(prev => {
      const updated = { ...prev, ...patch };
      localStorage.setItem('safety_dosth_real_profile', JSON.stringify(updated));
      return updated;
    });
  };

  const toggleAutoAlert = () => {
    updateUserProfile({ autoAlertEmergencies: !userProfile.autoAlertEmergencies });
  };

  const addTrustedContact = (contact: Omit<TrustedContact, 'id'>) => {
    const newContact: TrustedContact = {
      ...contact,
      id: `tc-${Date.now()}`
    };
    updateUserProfile({ trustedCircle: [...userProfile.trustedCircle, newContact] });
  };

  const removeTrustedContact = (id: string) => {
    updateUserProfile({ trustedCircle: userProfile.trustedCircle.filter(c => c.id !== id) });
  };

  // SOS Emergency
  const [isEmergencyActive, setIsEmergencyActive] = useState<boolean>(false);

  const triggerEmergencyAlert = () => {
    setIsEmergencyActive(true);
    soundService.startSOSSiren();
  };

  const cancelEmergencyAlert = () => {
    setIsEmergencyActive(false);
    soundService.stopSOSSiren();
    setActiveView('main');
  };

  // Active Journey
  const [journeyState, setJourneyState] = useState<ActiveJourneyState>({
    isActive: false,
    isPaused: false,
    selectedRoute: DEFAULT_ROUTES.safest,
    startLocation: currentLocation,
    destinationLocation: { lat: 11.6705, lng: 78.1338, name: 'Central Bus Stand' },
    currentStepIndex: 0,
    currentCoordinate: { lat: 11.6643, lng: 78.1460 },
    distanceRemainingKm: 3.2,
    timeRemainingMinutes: 18,
    averageSpeedKmh: 14,
    startTime: Date.now(),
    batteryLevel: 94,
    liveSafetyScore: 94,
    indicators: {
      crowd: 'High',
      lighting: 'Good',
      risk: 'Low',
      network: 'Strong'
    }
  });

  const startJourney = (route?: RouteOption) => {
    const chosen = route || selectedRoute || DEFAULT_ROUTES.safest;
    setSelectedRoute(chosen);
    setJourneyState({
      isActive: true,
      isPaused: false,
      selectedRoute: chosen,
      startLocation: currentLocation,
      destinationLocation: selectedDestination || { lat: chosen.coordinates[chosen.coordinates.length - 1]![0]!, lng: chosen.coordinates[chosen.coordinates.length - 1]![1]!, name: 'Destination' },
      currentStepIndex: 0,
      currentCoordinate: { lat: chosen.coordinates[0]![0]!, lng: chosen.coordinates[0]![1]! },
      distanceRemainingKm: chosen.distanceKm,
      timeRemainingMinutes: chosen.durationMinutes,
      averageSpeedKmh: 15,
      startTime: Date.now(),
      batteryLevel: 96,
      liveSafetyScore: chosen.safetyScore,
      indicators: {
        crowd: chosen.indicators.crowd as any,
        lighting: chosen.indicators.lighting === 'Well lit' ? 'Good' : 'Fair',
        risk: chosen.indicators.risk as any,
        network: 'Strong'
      }
    });
    soundService.playCheckInChime();
    setActiveView('live_journey');
  };

  const pauseJourney = () => setJourneyState(prev => ({ ...prev, isPaused: true }));
  const resumeJourney = () => setJourneyState(prev => ({ ...prev, isPaused: false }));

  const endJourney = () => {
    soundService.playSafeArrivalJingle();
    setJourneyState(prev => ({ ...prev, isActive: false }));
    setActiveView('main');
    setCurrentTab('home');
  };

  // Safety Check-In
  const [isSafetyCheckOpen, setIsSafetyCheckOpen] = useState(false);
  const [safetyCheckCountdown, setSafetyCheckCountdown] = useState(30);

  const triggerSafetyCheckModal = () => {
    soundService.playCheckInChime();
    setSafetyCheckCountdown(30);
    setIsSafetyCheckOpen(true);
  };

  const handleCheckInSafe = () => setIsSafetyCheckOpen(false);

  const handleCheckInEmergency = () => {
    setIsSafetyCheckOpen(false);
    triggerEmergencyAlert();
    setActiveView('emergency');
  };

  // GPS position simulation along coordinates
  useEffect(() => {
    if (!journeyState.isActive || journeyState.isPaused || !journeyState.selectedRoute) return;

    const coords = journeyState.selectedRoute.coordinates;
    const total = coords.length;

    const timer = setInterval(() => {
      setJourneyState(prev => {
        if (prev.currentStepIndex >= total - 1) {
          clearInterval(timer);
          endJourney();
          return prev;
        }

        const next = prev.currentStepIndex + 1;
        const coord = coords[next];
        const frac = next / total;
        const remKm = Math.max(0, parseFloat((prev.selectedRoute!.distanceKm * (1 - frac)).toFixed(1)));
        const remMin = Math.max(1, Math.round(prev.selectedRoute!.durationMinutes * (1 - frac)));

        return {
          ...prev,
          currentStepIndex: next,
          currentCoordinate: { lat: coord![0]!, lng: coord![1]! },
          distanceRemainingKm: remKm,
          timeRemainingMinutes: remMin
        };
      });
    }, 4500);

    return () => clearInterval(timer);
  }, [journeyState.isActive, journeyState.isPaused, journeyState.selectedRoute]);

  return (
    <SafetyContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        activeView,
        setActiveView,
        currentLocation,
        setCurrentLocation,
        selectedDestination,
        setSelectedDestination,
        isLoadingRoutes,
        calculateRoutesForDestination,
        availableRoutes,
        selectedRoute,
        setSelectedRoute,
        journeyState,
        startJourney,
        pauseJourney,
        resumeJourney,
        endJourney,
        isEmergencyActive,
        triggerEmergencyAlert,
        cancelEmergencyAlert,
        userProfile,
        updateUserProfile,
        toggleAutoAlert,
        addTrustedContact,
        removeTrustedContact,
        currentUser,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        logout,
        isSafetyCheckOpen,
        safetyCheckCountdown,
        handleCheckInSafe,
        handleCheckInEmergency,
        triggerSafetyCheckModal
      }}
    >
      {children}
    </SafetyContext.Provider>
  );
};

export const useSafety = () => {
  const ctx = useContext(SafetyContext);
  if (!ctx) throw new Error('useSafety must be used within a SafetyProvider');
  return ctx;
};
