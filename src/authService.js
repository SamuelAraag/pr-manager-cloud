/**
 * Authentication Service
 * Centralized service for JWT token handling and role-based access control
 */

import { getItem, setItem } from './localStorageService.js';
import { ROLES, PERMISSIONS } from './constants/roles.js';
import * as API from './apiService.js';

/**
 * Decode JWT token (simple base64 decode)
 * @param {string} token - JWT token
 * @returns {object|null} Decoded token payload
 */
function decodeJWT(token) {
    if (!token) return null;
    
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.error('Invalid token format');
            return null;
        }
        
        // Decode the payload (second part)
        const payload = parts[1];
        const decoded = JSON.parse(atob(payload));
        return decoded;
    } catch (error) {
        console.error('Error decoding JWT:', error);
        return null;
    }
}

/**
 * Extract roles from JWT token
 * Handles both simple claim names and .NET full claim URIs
 * @returns {string[]} Array of role names (e.g., ['Admin'], ['QA'], ['Dev'])
 */
export function getRolesFromToken() {
    const payload = getTokenPayload();
    if (!payload) return [];

    // .NET uses full URI claim names
    const roleClaimNames = [
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/role', // .NET Core default
        'role',   // Standard JWT
        'roles',  // Alternative standard
        'Role',   // Capitalized
        'Roles'   // Capitalized plural
    ];

    let roles = null;
    
    // Try each possible claim name
    for (const claimName of roleClaimNames) {
        if (payload[claimName]) {
            roles = payload[claimName];
            break;
        }
    }

    if (!roles) return [];

    // Roles can be a single string or an array
    if (Array.isArray(roles)) {
        return roles;
    }
    
    return [roles];
}

/**
 * Papel do usuário logado, por app (Épico 4). Vem da claim "memberships" do JWT:
 * [{ appId, role }]. Pode ficar desatualizado por até 30 dias (duração do token) se as
 * memberships mudarem — para dado fresco, ver GET /api/Users/me.
 * @returns {{appId: string, role: string}[]}
 */
export function getMembershipsFromToken() {
    const payload = getTokenPayload();
    if (!payload || !payload.memberships) return [];
    try {
        return JSON.parse(payload.memberships);
    } catch (error) {
        console.error('Error parsing memberships claim:', error);
        return [];
    }
}

// Épico 9 Fase 3: PlatformAdmin/TenantAdmin não são mais claim do JWT (token vale até 30
// dias e não pode carregar um papel que precisa de efeito imediato quando revogado). A fonte
// fresca é GET /api/Users/me, revalidada no backend a cada chamada — cacheada aqui em memória
// e atualizada por refreshMe(), chamada no login e na troca de tenant.
let meCache = null;

/**
 * Busca a identidade "fresca" do usuário logado (IsPlatformAdmin, tenant atual, papel no
 * tenant atual, lista de tenants) e cacheia em memória para os getters síncronos abaixo.
 * Deve ser chamada após login e após troca de tenant, antes de applyRoleBasedVisibility().
 * @returns {Promise<object|null>}
 */
export async function refreshMe() {
    try {
        const me = await API.fetchMe();
        meCache = me;
        if (me?.currentTenantId) {
            setItem('currentTenantId', me.currentTenantId);
        }
        return me;
    } catch (error) {
        console.error('Falha ao buscar identidade atual (/Users/me):', error);
        meCache = null;
        return null;
    }
}

/** @returns {object|null} último resultado cacheado de refreshMe() */
export function getMe() {
    return meCache;
}

/** @returns {string|null} "TenantAdmin" | "Member" | null (sem tenant resolvido) */
export function getRoleInCurrentTenant() {
    return meCache?.roleInCurrentTenant ?? null;
}

/** @returns {{tenantId: string, tenantName: string, role: string}[]} */
export function getMyTenants() {
    return meCache?.tenants ?? [];
}

/**
 * Administrador global da plataforma (User.IsPlatformAdmin) — bypassa qualquer checagem de
 * tenant/app. Fonte: refreshMe() (fresca, revalidada no backend), não o JWT.
 * @returns {boolean}
 */
export function isPlatformAdmin() {
    return !!meCache?.isPlatformAdmin;
}

/**
 * Administrador com poderes de gestão do tenant atual — PlatformAdmin (bypassa) OU
 * TenantAdmin do tenant resolvido pro request. Substitui a antiga claim "is_admin" (removida
 * do JWT no Épico 9 — não representa mais nem o modelo de dados nem revoga na hora).
 * @returns {boolean}
 */
export function isAdminGlobal() {
    return isPlatformAdmin() || getRoleInCurrentTenant() === 'TenantAdmin';
}

/**
 * Épico 8b: admin da organização-plataforma — a única organização que gerencia o
 * cadastro de todas as demais (criar/renomear/ativar-desativar organizações). Não confundir
 * com isAdminGlobal (admin dentro da própria organização, desde o Épico 8).
 * @returns {boolean}
 */
export function isPlatformAdmin() {
    const payload = getTokenPayload();
    return payload?.is_platform_admin === 'true';
}

// Papel do usuário no app atualmente selecionado (dashboard filtrado por ?app=).
// Setado explicitamente por quem sabe qual app está aberto (script.js) — authService
// não tem acesso à URL/estado de navegação por conta própria.
let currentAppRole = null;

/** @param {string|null} role - "Dev" | "Gestor" | "QA" | null (nenhum app selecionado) */
export function setCurrentAppRole(role) {
    currentAppRole = role || null;
}

export function getCurrentAppRole() {
    return currentAppRole;
}

/**
 * Get current user information including roles
 * @returns {object} User info with roles array
 */
export function getCurrentUser() {
    const userName = getItem('appUser');
    const userId = getItem('appUserId');
    const roles = getRolesFromToken();
    
    return {
        name: userName,
        id: userId,
        roles
    };
}

/**
 * Check if current user has a specific role
 * @param {string} role - Role to check (use ROLES constants)
 * @returns {boolean}
 */
export function hasRole(role) {
    const roles = getRolesFromToken();
    return roles.includes(role);
}

/**
 * Check if current user has any of the specified roles
 * @param {string[]} rolesToCheck - Array of roles to check
 * @returns {boolean}
 */
export function hasAnyRole(rolesToCheck) {
    const userRoles = getRolesFromToken();
    return rolesToCheck.some(role => userRoles.includes(role));
}

/**
 * Check if current user is an admin
 * @returns {boolean}
 */
export function isAdmin() {
    return hasRole(ROLES.ADMIN);
}

/**
 * Check if current user is QA
 * @returns {boolean}
 */
export function isQA() {
    return hasRole(ROLES.QA);
}

/**
 * Check if current user is a developer
 * @returns {boolean}
 */
export function isDeveloper() {
    return hasRole(ROLES.DEV);
}

/**
 * Check if current user can perform a specific action
 * @param {string[]} requiredRoles - Required roles for the permission (from PERMISSIONS)
 * @returns {boolean}
 */
export function can(requiredRoles) {
    if (!Array.isArray(requiredRoles)) {
        requiredRoles = [requiredRoles];
    }
    return hasAnyRole(requiredRoles);
}

/**
 * Get the decoded token payload (for debugging or additional claims)
 * @returns {object|null}
 */
export function getTokenPayload() {
    const token = getItem('token');
    return decodeJWT(token);
}

/**
 * Apply role-based visibility to HTML elements with data-roles attribute
 * This enables declarative permission control in HTML/templates
 * 
 * Usage in HTML:
 *   <button data-roles="Admin">Admin Only</button>
 *   <button data-roles="Admin,QA">Admin or QA</button>
 *   <button data-roles="PlatformAdmin">PlatformAdmin only (TenantAdmin não bypassa)</button>
 *
 * Should be called:
 *   - After login (depois de refreshMe())
 *   - After rendering dynamic content
 *   - After switching users or tenant
 */
export function applyRoleBasedVisibility() {
    const userRoles = getRolesFromToken();
    const platformAdmin = isPlatformAdmin();
    // TenantAdmin do tenant atual (ou PlatformAdmin) — bypassa telas gated por "Admin",
    // igual ao antigo admin de organização. "PlatformAdmin" no data-roles é mais restrito:
    // só passa pra quem é de fato PlatformAdmin (ver requiredRoles.includes abaixo).
    const tenantAdmin = isAdminGlobal();
    const appRole = getCurrentAppRole();

    // Select all elements with data-roles attribute
    document.querySelectorAll('[data-roles]').forEach(element => {
        const requiredRolesAttr = element.getAttribute('data-roles');
        if (!requiredRolesAttr) return;

        const requiredRoles = requiredRolesAttr
            .split(',')
            .map(r => r.trim())
            .filter(r => r.length > 0);

        let hasPermission = platformAdmin || requiredRoles.some(role => userRoles.includes(role));
        if (!hasPermission && tenantAdmin && requiredRoles.includes('Admin')) {
            hasPermission = true;
        }
        if (!hasPermission && appRole) {
            hasPermission = requiredRoles.some(role =>
                (role === 'Admin' && appRole === 'Gestor') || (role === 'QA' && appRole === 'QA'));
        }

        if (hasPermission) {
            // Show element
            element.style.removeProperty('display');
            element.removeAttribute('disabled');
        } else {
            // Hide element
            element.style.display = 'none';
        }
    });
}

// Export all functions
export default {
    getRolesFromToken,
    getCurrentUser,
    hasRole,
    hasAnyRole,
    isAdmin,
    isQA,
    isDeveloper,
    can,
    getTokenPayload,
    applyRoleBasedVisibility,
    getMembershipsFromToken,
    isAdminGlobal,
    isPlatformAdmin,
    setCurrentAppRole,
    getCurrentAppRole,
    refreshMe,
    getMe,
    getRoleInCurrentTenant,
    getMyTenants,
    isPlatformAdmin
};
