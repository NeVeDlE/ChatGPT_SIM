export default class Router {
    constructor({ rootId = 'app', viewBase = '/views', useHash = false } = {}) {
        this.root = document.getElementById(rootId);
        this.viewBase = viewBase.replace(/\/$/, '');
        this.useHash = useHash;
        this.routes = [];
        this.beforeEachHook = null;
        this._navToken = 0;

        // link delegation
        document.addEventListener('click', (e) => {
            const a = e.target.closest('a[data-link]');
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('http')) return;
            e.preventDefault();
            this.go(href);
        });

        window.addEventListener('popstate', () => this._navigate(this._currentPath()));
    }

    add({ path, view, script, meta = {} }) {
        this.routes.push({ path, view, script, meta });
        return this;
    }

    beforeEach(fn) { this.beforeEachHook = fn; return this; }

    start(defaultPath = '/login') {
        const startPath = this._currentPath() || defaultPath;
        this.go(startPath, { replace: true });
    }

    go(path, { replace = false } = {}) {
        if (this.useHash) {
            location.hash = path;
            this._navigate(path);
        } else {
            (replace ? history.replaceState : history.pushState).call(history, {}, '', path);
            this._navigate(path);
        }
    }

    _currentPath() { return this.useHash ? (location.hash.slice(1) || '/') : location.pathname; }

    async _navigate(path) {
        const token = ++this._navToken;
        const route = this.routes.find(r => r.path === path) || null;

        if (!route) {
            this.root.innerHTML = `<h1 style="padding:2rem">404 — Not Found</h1>`;
            return;
        }

        if (this.beforeEachHook) {
            const redirect = await this.beforeEachHook({ to: route, path });
            if (typeof redirect === 'string' && redirect !== path) return this.go(redirect, { replace: true });
        }

        this.root.innerHTML = `<div style="padding:2rem;opacity:.7">Loading…</div>`;

        try {
            const res = await fetch(`${this.viewBase}/${route.view}`, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Failed to load ${route.view} (${res.status})`);
            const html = await res.text();
            if (token !== this._navToken) return;
            this.root.innerHTML = html;

            if (route.script) {
                const mod = await import(/* webpackMode: "lazy" */ `../pages/${route.script}`);
                if (token !== this._navToken) return;
                if (mod && typeof mod.init === 'function') mod.init({ path });
            }
        } catch (err) {
            if (token !== this._navToken) return;
            this.root.innerHTML = `<pre style="padding:1rem;color:#f88;background:#300;border-radius:8px">${err.message}</pre>`;
        }
    }
}
