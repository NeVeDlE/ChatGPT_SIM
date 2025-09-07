export async function loginRequest(email, password) {
    const res = await fetch(`${__API_BASE_URL__}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({email, password})
    });

    return res.json();
}

// Prefer /api/* in dev (proxied), works with full host in prod too
const base = __API_BASE_URL__; // injected by DefinePlugin

export async function post(path, body) {
    const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return {ok: res.ok, data};
}


export async function get(path, token = null) {
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers,
    });

    const data = await res.json().catch(() => ({}));
    return {ok: res.ok, data};
}

export async function authPost(path, body) {
    const rawToken = localStorage.getItem('token') || "";
    const token = rawToken.replace(/^"|"$/g, ""); // remove leading/trailing quotes if present
    const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json', "Authorization": `Bearer ${token}`},
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return {ok: res.ok, data};
}

export async function authPostBlob(path, body) {
    const rawToken = localStorage.getItem('token') || "";
    const token = rawToken.replace(/^"|"$/g, "");

    const res = await fetch(`${base}${path}`, {
        method: 'POST',
        // do NOT force Accept: application/json, we expect audio back
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const ct = res.headers.get('content-type') || '';

    // Success path: audio/wav (or any audio/*)
    if (res.ok && ct.startsWith('audio/')) {
        const blob = await res.blob();
        return {ok: true, blob};
    }

    // Error path: backend sends JSON/text on failure
    let message = 'TTS failed';
    try {
        const err = await res.json();
        message = err.message || err.error || JSON.stringify(err);
    } catch {
        try {
            message = await res.text();
        } catch {
        }
    }
    return {ok: false, error: message};
}

export async function authGet(path) {
    const rawToken = localStorage.getItem('token') || "";
    const token = rawToken.replace(/^"|"$/g, ""); // remove leading/trailing quotes if present
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    };
    const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers: headers,
    });

    const data = await res.json().catch(() => ({}));
    return {ok: res.ok, data};
}

export function createStreamES(path, {
    params = {},            // e.g. { prompt, temperature }
    token = getToken(),          // optional: pass bearer; will go in the URL
    tokenParam = 'bearer',  // query key your backend reads
    withCredentials = false,// true if you use cookie auth
    onEvent = () => {
    },     // ({ type, data, raw })
    onError = console.error,
    onOpen = () => {
    },
} = {}) {
    // build URL
    const url = new URL(base + path);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    if (!withCredentials && token) url.searchParams.set(tokenParam, token);

    // start stream
    const es = new EventSource(url.toString(), {withCredentials});

    es.onopen = onOpen;
    es.onerror = onError;

    // one tiny parser for all events you emit
    const handle = (evt) => {
        const raw = evt.data ?? '';
        let data = raw;
        try {
            data = JSON.parse(raw);
        } catch {
        }
        onEvent({type: evt.type || 'message', data, raw});
        if (evt.type === 'done' || (data && typeof data === 'object' && data.type === 'done')) {
            es.close();
        } // stop when server says done
    };

    // your custom events + generic fallback
    es.addEventListener('init', handle);
    es.addEventListener('delta', handle);
    es.addEventListener('done', handle);
    es.addEventListener('message', handle);

    // simple API for caller
    return {
        es,
        close: () => es.close(),
        url: url.toString(),
    };
}


function getToken() {
    const raw = localStorage.getItem('token');
    return raw ? raw.replace(/^"|"$/g, '') : null;
}


