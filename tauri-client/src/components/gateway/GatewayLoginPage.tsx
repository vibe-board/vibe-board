import { useState } from 'react';
import { useGateway } from '@/contexts/GatewayContext';

export function GatewayLoginPage() {
  const { signup, login, authError, authLoading, registrationOpen } =
    useGateway();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignupMode, setIsSignupMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignupMode) {
      await signup(email, password, name || undefined);
    } else {
      await login(email, password);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-foreground">
          Vibe Board Gateway
        </h1>
        <p className="text-sm text-foreground opacity-70">
          {isSignupMode ? 'Create your account' : 'Sign in to continue'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignupMode && (
          <div className="space-y-1">
            <label htmlFor="name" className="block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="gateway-input"
              placeholder="Your name"
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="gateway-input"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="gateway-input"
            placeholder="Password"
          />
        </div>

        {authError && (
          <div className="gateway-error">
            <p className="text-sm">{authError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={authLoading}
          className="gateway-button-primary"
        >
          {authLoading ? 'Loading...' : isSignupMode ? 'Sign Up' : 'Sign In'}
        </button>
      </form>

      {/* Toggle */}
      {registrationOpen !== false && (
        <p className="text-center text-sm opacity-70">
          {isSignupMode ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setIsSignupMode(false)}
                className="gateway-link"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => setIsSignupMode(true)}
                className="gateway-link"
              >
                Sign up
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
