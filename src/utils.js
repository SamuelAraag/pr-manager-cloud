/**
 * Get Jira Id
 * @param {string} url - task jira url
 * @returns {string|null} - jira id or null if not found
 */
export function extractJiraId(url) {
    if (!url) return null;
    const regex = /(?:browse\/|selectedIssue=)([A-Z0-9]+-[0-9]+)/i;
    const match = url.match(regex);
    return match ? match[1].toUpperCase() : null;
}
