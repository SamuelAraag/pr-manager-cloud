export function findDeveloperById(users, developerId) {
    if (!developerId || !Array.isArray(users)) return null;

    return users.find(user => String(user.id) === String(developerId)) || null;
}

export function resolveDeveloperId(users, preferredId, fallbackName = '') {
    const developerById = findDeveloperById(users, preferredId);
    if (developerById) return String(developerById.id);

    if (!fallbackName || !Array.isArray(users)) return '';

    const developerByName = users.find(user => user.name === fallbackName);
    return developerByName ? String(developerByName.id) : '';
}
