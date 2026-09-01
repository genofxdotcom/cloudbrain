import React from 'react';
import { useUser } from '../userContext';

/**
 * Access gate — CloudBrain has no own login. Identity comes from Cloudflare
 * Access in front of the Worker. If /api/auth/me 401s, the user either hasn't
 * authenticated with Access yet, or the deployment isn't behind Access.
 */
export function AuthScreen(): React.ReactElement {
  const { refresh } = useUser();

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <span className="mark">CB</span> CloudBrain
        </div>
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>
            This deployment is protected by <strong>Cloudflare Access</strong>. Sign in with your
            identity provider, then return here.
          </p>
          <button className="btn primary" style={{ justifyContent: 'center' }} onClick={() => void refresh()}>
            I've signed in — continue
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Operator? Configure Zero Trust → Applications to cover this domain. See the README's
            Cloudflare Access section.
          </p>
        </div>
      </div>
    </div>
  );
}
