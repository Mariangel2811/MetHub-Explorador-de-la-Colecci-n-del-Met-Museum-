const MetAPI = (() => {
  const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';
  const DEFAULT_TIMEOUT_MS = 10000;

  /**
   * Wrapper de fetch con timeout propio, es combinable con una señal externa
   * (la que viene del router al cambiar de vista, ver router.js).
   */
  async function request(path, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Si además nos pasan una señal externa (p. ej. porque el usuario
    // cambió de vista), se propaga también.
    if (signal) {
      signal.addEventListener('abort', () => timeoutController.abort());
    }

    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new ApiError('NOT_FOUND', `Recurso no encontrado: ${path}`);
        }
        throw new ApiError('HTTP_ERROR', `Error HTTP ${response.status} en ${path}`);
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError('TIMEOUT', `La petición a ${path} superó el tiempo de espera`);
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError('NETWORK_ERROR', `Fallo de red al llamar a ${path}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  class ApiError extends Error {
    constructor(kind, message) {
      super(message);
      this.name = 'ApiError';
      this.kind = kind; 
    }
  }

  // --- Endpoints concretos (RNF-03: siempre async/await, siempre promesas) ---

  function getDepartments(opts) {
    return request('/departments', opts);
  }

  function getObject(objectId, opts) {
    return request(`/objects/${objectId}`, opts);
  }

  /**
   * Búsqueda genérica. `params` puede incluir: q, departmentId,
   * isHighlight, hasImages, artistOrCulture, dateBegin, dateEnd, etc.
   * (ver documentación oficial: https://metmuseum.github.io/)
   */
  function search(params = {}, opts) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    });
    return request(`/search?${query.toString()}`, opts);
  }

  async function resolveObjects(objectIds, opts) {
    const settled = await Promise.allSettled(
      objectIds.map((id) => getObject(id, opts))
    );

    const artworks = [];
    let failedCount = 0;

    settled.forEach((result) => {
      if (result.status === 'fulfilled') {
        artworks.push(result.value);
      } else {
        failedCount += 1;
      }
    });

    return { artworks, failedCount };
  }

  return { getDepartments, getObject, search, resolveObjects, ApiError };
})();
