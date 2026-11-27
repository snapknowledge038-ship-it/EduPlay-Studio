// supabase-config.js
const SUPABASE_URL = "https://wdpkqlkexpjrcshxavjt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_n4koDe4SFn0OMSoyUw-HFA_WAuQwH8v";
const LOCAL_STORAGE_KEY = "eduplay_saved_activities";

function isSupabaseConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getSupabaseHeaders() {
    return {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    };
}

function saveLocalActivityCache(activity) {
    try {
        const list = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
        const idx = list.findIndex(x => String(x.id) === String(activity.id));
        if (idx >= 0) list[idx] = activity;
        else list.unshift(activity);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn("Local cache save warning:", e);
    }
}

function getLocalActivitiesCache() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    } catch (e) {
        return [];
    }
}

async function cloudSaveActivity(activity) {
    saveLocalActivityCache(activity);

    if (!isSupabaseConfigured()) {
        return { savedToCloud: false };
    }

    const endpoint = `${SUPABASE_URL}/rest/v1/activities?on_conflict=id`;
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            ...getSupabaseHeaders(),
            "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify([{
            id: activity.id,
            title: activity.title,
            template: activity.template,
            items: activity.items,
            created_at: activity.createdAt || new Date().toISOString()
        }])
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to save to Supabase");
    }

    const data = await res.json();
    return { savedToCloud: true, data: data[0] || activity };
}

async function cloudFetchAllActivities() {
    const localList = getLocalActivitiesCache();

    if (!isSupabaseConfigured()) {
        return localList;
    }

    try {
        const endpoint = `${SUPABASE_URL}/rest/v1/activities?select=*&order=created_at.desc`;
        const res = await fetch(endpoint, {
            method: "GET",
            headers: getSupabaseHeaders()
        });

        if (!res.ok) {
            return localList;
        }

        const rows = await res.json();
        const normalized = rows.map(r => ({
            id: r.id,
            title: r.title,
            template: r.template,
            items: Array.isArray(r.items) ? r.items : [],
            createdAt: r.created_at
        }));

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
    } catch (e) {
        return localList;
    }
}

async function cloudFetchActivityById(id) {
    if (!id) return null;

    if (isSupabaseConfigured()) {
        try {
            const endpoint = `${SUPABASE_URL}/rest/v1/activities?id=eq.${encodeURIComponent(id)}&select=*`;
            const res = await fetch(endpoint, {
                method: "GET",
                headers: getSupabaseHeaders()
            });

            if (res.ok) {
                const rows = await res.json();
                if (rows && rows.length > 0) {
                    const r = rows[0];
                    return {
                        id: r.id,
                        title: r.title,
                        template: r.template,
                        items: Array.isArray(r.items) ? r.items : [],
                        createdAt: r.created_at
                    };
                }
            }
        } catch (e) {
            console.warn("Cloud fetch by id fallback:", e);
        }
    }

    const localList = getLocalActivitiesCache();
    return localList.find(x => String(x.id) === String(id)) || null;
}

async function cloudDeleteActivity(id) {
    const remaining = getLocalActivitiesCache().filter(x => String(x.id) !== String(id));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));

    if (!isSupabaseConfigured()) return;

    const endpoint = `${SUPABASE_URL}/rest/v1/activities?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(endpoint, {
        method: "DELETE",
        headers: getSupabaseHeaders()
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to delete from Supabase");
    }
}
