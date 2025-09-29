import { useEffect, useState } from 'react';
import { FiUser, FiCalendar, FiTwitch } from 'react-icons/fi';

export interface UserProfile {
  id: string;
  login: string;
  display_name: string;
  email?: string;
  profile_image_url?: string;
  offline_image_url?: string;
  description?: string;
  broadcaster_type?: string;
  created_at?: string;
}

interface UserProfileProps {
  isAuthenticated: boolean;
  port?: number | null;
}

export function UserProfile({ isAuthenticated, port }: UserProfileProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !port) {
      setProfile(null);
      setError(null);
      return;
    }

    async function fetchProfile() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`http://localhost:${port}/api/user/profile`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        const data = await response.json();
        setProfile(data.profile);
      } catch (err) {
        setError((err as Error).message);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [isAuthenticated, port]);

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-surface/80 backdrop-blur rounded-2xl p-6 shadow-glow border border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/10 rounded-full animate-pulse"></div>
          <div className="space-y-2">
            <div className="h-4 bg-white/10 rounded w-32 animate-pulse"></div>
            <div className="h-3 bg-white/10 rounded w-24 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface/80 backdrop-blur rounded-2xl p-6 shadow-glow border border-red-500/20">
        <div className="flex items-center gap-3 text-red-400">
          <FiUser className="text-lg" />
          <span className="text-sm">Failed to load profile: {error}</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-surface/80 backdrop-blur rounded-2xl p-6 shadow-glow border border-white/5">
        <div className="flex items-center gap-3 text-fg-muted">
          <FiUser className="text-lg" />
          <span className="text-sm">No profile data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface/80 backdrop-blur rounded-2xl p-6 shadow-glow border border-white/5">
      <div className="flex items-start gap-4">
        {/* Profile Image */}
        <div className="relative">
          {profile.profile_image_url ? (
            <img
              src={profile.profile_image_url}
              alt={`${profile.display_name}'s profile`}
              className="w-16 h-16 rounded-full border-2 border-primary/30"
              onError={(e) => {
                // Fallback to default avatar if image fails to load
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const fallback = parent.querySelector('.fallback-avatar') as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className="fallback-avatar w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary text-xl font-semibold"
            style={{ display: profile.profile_image_url ? 'none' : 'flex' }}
          >
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <FiTwitch className="w-3 h-3 text-white" />
          </div>
        </div>

        {/* Profile Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-fg truncate">
              {profile.display_name}
            </h3>
            {profile.broadcaster_type && profile.broadcaster_type !== '' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-accent/20 text-accent">
                {profile.broadcaster_type}
              </span>
            )}
          </div>
          
          <div className="space-y-1 text-sm text-fg-muted">
            <div className="flex items-center gap-2">
              <FiUser className="w-3 h-3" />
              <span className="truncate">@{profile.login}</span>
            </div>
            
            {profile.created_at && (
              <div className="flex items-center gap-2">
                <FiCalendar className="w-3 h-3" />
                <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {profile.description && (
            <p className="mt-3 text-sm text-fg-muted leading-relaxed line-clamp-2">
              {profile.description}
            </p>
          )}
        </div>
      </div>

      {/* Channel Background Preview */}
      {profile.offline_image_url && (
        <div className="mt-4 relative rounded-lg overflow-hidden">
          <img
            src={profile.offline_image_url}
            alt="Channel background"
            className="w-full h-24 object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent"></div>
          <div className="absolute bottom-2 left-3 text-xs text-fg">
            Channel Background
          </div>
        </div>
      )}
    </div>
  );
}