export function createTenantOperationGuard() {
    let revision = 0;
    let transitioning = false;

    return {
        snapshot() {
            return revision;
        },
        beginTransition() {
            transitioning = true;
            revision += 1;
            return revision;
        },
        endTransition(expectedRevision) {
            if (revision === expectedRevision) transitioning = false;
        },
        isCurrent(expectedRevision) {
            return revision === expectedRevision;
        },
        isTransitioning() {
            return transitioning;
        }
    };
}
