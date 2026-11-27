const SUPABASE_URL = "https://wdpkqlkexpjrcshxavjt.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

function getLocalActivities() {
    try {
        return JSON.parse(localStorage.getItem("eduplay_saved_activities") || "[]");
    } catch (e) {
        return [];
    }
}

function saveLocalActivity(activity) {
    try {
        const existing = getLocalActivities();
        const filtered = existing.filter(item => String(item.id) !== String(activity.id));
        filtered.unshift(activity);
        localStorage.setItem("eduplay_saved_activities", JSON.stringify(filtered));
    } catch (e) {
        console.warn("Local storage save skipped:", e);
    }
}

function removeLocalActivity(id) {
    try {
        const existing = getLocalActivities();
        const filtered = existing.filter(item => String(item.id) !== String(id));
        localStorage.setItem("eduplay_saved_activities", JSON.stringify(filtered));
    } catch (e) {
        console.warn("Local storage remove skipped:", e);
    }
}

function getSupabaseHeaders(extraHeaders = {}) {
    return {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        ...extraHeaders
    };
}

function mapRowToActivity(r) {
    let parsedItems = [];
    if (Array.isArray(r.items)) {
        parsedItems = r.items;
    } else if (typeof r.items === "string") {
        try {
            const temp = JSON.parse(r.items);
            if (Array.isArray(temp)) parsedItems = temp;
        } catch (e) {
            parsedItems = [];
        }
    }

    return {
        id: r.id,
        title: r.title,
        template: r.template,
        items: parsedItems,
        lockMode: Boolean(r.lockMode),
        createdAt: r.created_at
    };
}

async function cloudSaveActivity(activity) {
    saveLocalActivity(activity);

    const payload = {
        id: activity.id,
        title: activity.title,
        template: activity.template,
        items: activity.items,
        lockMode: Boolean(activity.lockMode),
        created_at: activity.createdAt || new Date().toISOString()
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/activities?on_conflict=id`, {
        method: "POST",
        headers: getSupabaseHeaders({
            "Prefer": "resolution=merge-duplicates,return=representation"
        }),
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Supabase save failed (${res.status}): ${errText}`);
    }

    return { savedToCloud: true, activity };
}

async function cloudFetchActivityById(id) {
    if (!id) return null;

    const endpoint = `${SUPABASE_URL}/rest/v1/activities?id=eq.${encodeURIComponent(id)}&select=*`;
    const res = await fetch(endpoint, {
        method: "GET",
        headers: getSupabaseHeaders()
    });

    if (!res.ok) {
        throw new Error(`Supabase fetch by ID failed (${res.status})`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
        return null;
    }

    return mapRowToActivity(rows[0]);
}

async function cloudFetchAllActivities() {
    try {
        const endpoint = `${SUPABASE_URL}/rest/v1/activities?select=*&order=created_at.desc`;
        const res = await fetch(endpoint, {
            method: "GET",
            headers: getSupabaseHeaders()
        });

        if (!res.ok) {
            throw new Error(`Supabase list failed (${res.status})`);
        }

        const rows = await res.json();
        const cloudItems = Array.isArray(rows) ? rows.map(mapRowToActivity) : [];

        cloudItems.forEach(item => saveLocalActivity(item));
        return cloudItems;
    } catch (e) {
        console.warn("Using local activities fallback:", e);
        return getLocalActivities();
    }
}

async function cloudDeleteActivity(id) {
    removeLocalActivity(id);

    const endpoint = `${SUPABASE_URL}/rest/v1/activities?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(endpoint, {
        method: "DELETE",
        headers: getSupabaseHeaders({
            "Prefer": "return=minimal"
        })
    });

    if (!res.ok) {
        throw new Error(`Supabase delete failed (${res.status})`);
    }

    return true;
}
