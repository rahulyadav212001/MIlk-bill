import React from 'react';

/**
 * Fallback / No-Op Shim for Metro Bundler Cache.
 * Prevents "Unable to resolve ../context/AuthContext" when running bundlers
 * reload with cached ASTs from before authentication was removed.
 */
export const useAuth = () => ({
  user: null,
  profile: null,
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export default { useAuth, AuthProvider };

