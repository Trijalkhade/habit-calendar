(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            if (url.includes('graphql') || url.includes('submit')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.status_msg === 'Accepted' || (data.data && data.data.submissionDetails && data.data.submissionDetails.statusDisplay === 'Accepted')) {
                        window.postMessage({ type: 'LC_SUBMISSION_ACCEPTED' }, '*');
                    }
                }).catch(e => {});
            }
        } catch(e) {}
        return response;
    };
})();
