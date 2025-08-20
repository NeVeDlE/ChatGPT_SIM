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

export async function createStream(path, { onMessage, onError } = {}) {
    const token = getToken();
    const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "text/event-stream",
        }
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let parts = buffer.split("\n\n");
        buffer = parts.pop(); // keep incomplete chunk

        for (const part of parts) {
            if (part.startsWith("data:")) {
                const data = part.replace(/^data:\s*/, "");
                try {
                    onMessage?.(JSON.parse(data));
                } catch {
                    onMessage?.(data);
                }
            }
        }
    }
}

function getToken() {
    let raw = localStorage.getItem("token");
    if (!raw) return null;
    return raw.replace(/^"|"$/g, ""); // normalize once
}
