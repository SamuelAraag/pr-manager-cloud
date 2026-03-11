export const ApiConstants = {
    //BASE_URL: "https://localhost:7268/api",
    BASE_URL: "https://ross-targets-eco-political.trycloudflare.com/api",
};

export function isLocalDev() {
    return ApiConstants.BASE_URL.includes('localhost') || ApiConstants.BASE_URL.includes('127.0.0.1');
}

export const DEMO_MODE = false;

export const DEMO_USERS = {
    'Itallo Cerqueira': { name: 'Chaves', image: 'https://i.pravatar.cc/150?img=8' },
    'Rodrigo Barbosa':  { name: 'Julia', image: 'https://i.pravatar.cc/150?img=5' },
    'Kemilly Alvez':    { name: 'Julian', image: 'https://i.pravatar.cc/150?img=12' },
    'Marcos Paulo':     { name: 'Raquel', image: 'https://i.pravatar.cc/150?img=27' },
};

export const DEMO_PROJECTS = {
    'DF-e': 'Projeto Alpha',
    'DF-e Eventos': 'Projeto Beta',
    'NF-e': 'Projeto Gamma',
    'PR Manager': 'Manager App',
};

export function getDemoProject(projectName) {
    if (!DEMO_MODE || !projectName) return projectName;
    if (DEMO_PROJECTS[projectName]) return DEMO_PROJECTS[projectName];
    
    const genericName = `Projeto ${projectName.substring(0, 3).toUpperCase()}`;
    DEMO_PROJECTS[projectName] = genericName;
    return genericName;
}

export function getDemoName(devName) {
    if (DEMO_MODE && DEMO_USERS[devName]) return DEMO_USERS[devName].name;
    return devName;
}
