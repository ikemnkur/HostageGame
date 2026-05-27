/* ─── Runtime Config (frontend/backend split) ─────────── */

window.RuntimeConfig = (() => {
  const env = window.__HOSTAGE_ENV__ || {};

  function normalizeBase(url) {
    if (!url) return '';
    return String(url).trim().replace(/\/$/, '');
  }

  // Host-based defaults for production convenience.
  function inferDefaults() {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    if (isLocal) {
      return {
        apiBaseUrl: '',
        socketUrl: '',
        socketPath: '/socket.io',
      };
    }

    if (host === 'hostagechess.boredgamez.org') {
      return {
        apiBaseUrl: 'https://server.hostagechess.boredgamez.org',
        socketUrl: 'https://server.hostagechess.boredgamez.org',
        socketPath: '/socket.io',
      };
    }

    return {
      apiBaseUrl: '',
      socketUrl: '',
      socketPath: '/socket.io',
    };
  }

  const inferred = inferDefaults();
  const apiBaseUrl = normalizeBase(
    env.API_BASE_URL ||
    localStorage.getItem('hostage_api_base_url') ||
    inferred.apiBaseUrl
  );
  const socketUrl = normalizeBase(
    env.SOCKET_URL ||
    localStorage.getItem('hostage_socket_url') ||
    inferred.socketUrl ||
    apiBaseUrl
  );
  const socketPath = env.SOCKET_PATH || localStorage.getItem('hostage_socket_path') || inferred.socketPath;

  function apiUrl(path) {
    if (!path) return apiBaseUrl;
    if (/^https?:\/\//i.test(path)) return path;
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.startsWith('/api/')) {
      return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
    }
    return path;
  }

  // Patch fetch once so existing code using /api/* works unchanged.
  if (!window.__HOSTAGE_FETCH_PATCHED__) {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input === 'string') {
        return nativeFetch(apiUrl(input), init);
      }

      if (input instanceof Request) {
        const rewritten = apiUrl(input.url);
        if (rewritten !== input.url) {
          return nativeFetch(new Request(rewritten, input), init);
        }
      }

      return nativeFetch(input, init);
    };
    window.__HOSTAGE_FETCH_PATCHED__ = true;
  }

  return {
    apiBaseUrl,
    socketUrl,
    socketPath,
    apiUrl,
  };
})();
