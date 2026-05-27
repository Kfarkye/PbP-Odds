const run = async () => {
    try {
        console.log("Fetching from cron generator...");
        const res = await fetch("http://localhost:3000/api/cron/trigger-feed-publish", { method: 'POST' });
        const text = await res.text();
        console.log("Response:", text);
    } catch (e) {
        console.error(e);
    }
};

run();
