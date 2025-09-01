/**
 * VariantGraph manages variant groups and the pinned visible path.
 * It is DOM-aware only via the article HTMLElements you pass in `build()`.
 */
export class VariantGraph {
    #groups = new Map(); // key -> { articles: HTMLElement[], active: number }
    #byId = new Map();   // id -> HTMLElement
    #pinnedLeafId = null;

    build(articles) {
        this.#groups.clear();
        this.#byId.clear();

        const groupMap = new Map(); // `${parentId}|${role}` -> HTMLElement[]
        for (const el of articles) {
            const id = el.dataset.id;
            if (id) this.#byId.set(id, el);

            const role = el.classList.contains("assistant") ? "assistant" : "user";
            const pid = (!el.dataset.parentId || el.dataset.parentId === "null") ? "root" : el.dataset.parentId;
            const key = `${pid}|${role}`;
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key).push(el);
        }

        for (const [key, list] of groupMap.entries()) {
            if (!list.length) continue;

            // default: last item is active
            let active = list.length - 1;

            // prefer server active or "is-current"
            list.forEach((el, i) => {
                const serverActive = el.dataset.variantActive === "1";
                if (serverActive || el.classList.contains("is-current")) active = i;
            });

            this.#groups.set(key, {articles: list, active});
        }

        if (this.#pinnedLeafId) this.applyPinnedPath(this.#pinnedLeafId);
        return this;
    }

    setPinnedLeaf(leafId) {
        this.#pinnedLeafId = leafId ? String(leafId) : null;
    }

    applyPinnedPath(leafId) {
        if (!leafId) return;
        let child = this.#byId.get(String(leafId));
        while (child) {
            const childId = child.dataset.id;
            const parentId = child.dataset.parentId;

            const childRole = child.classList.contains("assistant") ? "assistant" : "user";
            if (!parentId || parentId === "null") {
                // Also flip the ROOT group's active to this child (usually a 'user' root)
                const rootKey = `root|${childRole}`;
                const rootGroup = this.#groups.get(rootKey);
                if (rootGroup) {
                    const idx = rootGroup.articles.findIndex((el) => el.dataset.id === childId);
                    if (idx !== -1) rootGroup.active = idx;
                }
                break;
            }
            const key = `${parentId}|${childRole}`;
            const g = this.#groups.get(key);
            if (g) {
                const idx = g.articles.findIndex((el) => el.dataset.id === childId);
                if (idx !== -1) g.active = idx;
            }
            child = this.#byId.get(String(parentId));
        }
    }

    get groups() {
        return this.#groups;
    }

    get byId() {
        return this.#byId;
    }

    getGroup(key) {
        return this.#groups.get(key) || null;
    }

    getActiveChild(parentId, childRole) {
        if (!parentId) return null;
        const key = `${parentId}|${childRole}`;
        const g = this.#groups.get(key);
        if (!g) return null;
        return g.articles[g.active] ?? null;
    }

    switchVariantByArticle(article, step) {
        if (!article) return null;
        const key = article.dataset.variantGroup;
        if (!key || !this.#groups.has(key)) return article;

        const g = this.#groups.get(key);
        const total = g.articles.length;
        g.active = (g.active + step + total) % total;
        return g.articles[g.active];
    }
}
