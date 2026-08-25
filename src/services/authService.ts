export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  bloodGroup?: string;
  emergencyNotes?: string;
  createdAt: string;
  isGuest?: boolean;
}

const AUTH_STORAGE_KEY = 'safety_dosth_auth_user';
const USERS_DB_KEY = 'safety_dosth_registered_users';

class AuthService {
  private currentUser: AuthUser | null = null;

  constructor() {
    this.loadSession();
  }

  private loadSession() {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        this.currentUser = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load auth session', e);
    }
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  public signUp(email: string, password: string, name: string, phone: string, bloodGroup: string = 'O+', emergencyNotes: string = ''): AuthUser {
    if (!email || !password || !name) {
      throw new Error('Please fill in all required fields');
    }

    const users = this.getRegisteredUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists');
    }

    const newUser: AuthUser = {
      id: `usr-${Date.now()}`,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phone.trim(),
      bloodGroup: bloodGroup.trim(),
      emergencyNotes: emergencyNotes.trim(),
      createdAt: new Date().toISOString(),
      isGuest: false
    };

    users.push(newUser);
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));

    this.currentUser = newUser;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
    return newUser;
  }

  public login(email: string, _password: string): AuthUser {
    const users = this.getRegisteredUsers();
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!existing) {
      // If logging in for the first time, auto-create account for seamless UX
      return this.signUp(email, _password, email.split('@')[0] ?? email, '+91 98765 43210');
    }

    this.currentUser = existing;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(existing));
    return existing;
  }

  public loginAsGuest(): AuthUser {
    const guestUser: AuthUser = {
      id: `guest-${Date.now()}`,
      email: 'guest@safetydosth.app',
      name: 'Vajra (Guest)',
      phone: '+91 98765 43210',
      bloodGroup: 'O+',
      emergencyNotes: 'Guest Explorer Session',
      createdAt: new Date().toISOString(),
      isGuest: true
    };
    this.currentUser = guestUser;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(guestUser));
    return guestUser;
  }

  public updateUser(patch: Partial<AuthUser>): AuthUser {
    if (!this.currentUser) throw new Error('No user logged in');
    this.currentUser = { ...this.currentUser, ...patch };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));

    const users = this.getRegisteredUsers().map(u => u.id === this.currentUser?.id ? this.currentUser : u);
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    return this.currentUser;
  }

  public logout() {
    this.currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  private getRegisteredUsers(): AuthUser[] {
    try {
      const raw = localStorage.getItem(USERS_DB_KEY);
      return raw ? JSON.parse(raw) : [
        {
          id: 'usr-default',
          email: 'vajra@safetydosth.app',
          name: 'Vajra',
          phone: '+91 98765 43210',
          bloodGroup: 'O+',
          emergencyNotes: 'No medical allergies. Contact family first in emergency.',
          createdAt: new Date().toISOString(),
          isGuest: false
        }
      ];
    } catch {
      return [];
    }
  }
}

export const authService = new AuthService();
