/**
 * Role constants matching backend role structure
 * These values are extracted from JWT tokens
 */
export const ROLES = {
    ADMIN: 'Admin',
    QA: 'QA',
    DEV: 'Dev'
};

/**
 * Permission constants for feature-based access control
 * Maps permissions to required roles
 */
export const PERMISSIONS = {
    APPROVE_PR: [ROLES.ADMIN],
    REQUEST_CORRECTION: [ROLES.ADMIN],
    ARCHIVE_PR: [ROLES.ADMIN],
    MANAGE_SPRINTS: [ROLES.ADMIN, ROLES.QA],
    MANAGE_BATCHES: [ROLES.ADMIN],
    CONFIGURE_TOKENS: [ROLES.ADMIN],
    REQUEST_VERSION: [ROLES.ADMIN, ROLES.QA],
    COMPLETE_SPRINT: [ROLES.ADMIN, ROLES.QA],
    DEPLOY_TO_STAGING: [ROLES.ADMIN],
    CREATE_GITLAB_ISSUE: [ROLES.ADMIN],
    DELETE_BATCH: [ROLES.ADMIN],
    REMOVE_PR_FROM_BATCH: [ROLES.ADMIN],
    REMOVE_VERSION: [ROLES.ADMIN]
};
