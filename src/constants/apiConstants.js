export const ApiConstants = {
    //BASE_URL: "https://localhost:7268/api",
    BASE_URL: "https://brunswick-endless-eyed-female.trycloudflare.com/api",
};

export function isLocalDev() {
    return ApiConstants.BASE_URL.includes('localhost') || ApiConstants.BASE_URL.includes('127.0.0.1');
}

export const DEMO_MODE = false;

export const DEMO_USERS = {
    'Itallo Cerqueira': { name: 'Anakin', image: 'https://i.pravatar.cc/150?img=8' },
    'Rodrigo Barbosa':  { name: 'Neytiri', image: 'https://i.pravatar.cc/150?img=16' },
    'Kemilly Alvez':    { name: 'Dijkstra', image: 'https://i.pravatar.cc/150?img=12' },
    'Marcos Paulo':     { name: 'Penny', image: 'https://i.pravatar.cc/150?img=27' },
    'Fabio Cabral':     { name: 'Morpheus', image: 'https://i.pravatar.cc/150?img=33' }
};

export const DEMO_PROJECTS = {
    'DF-e': 'Projeto Alpha',
    'DF-e Eventos': 'Projeto Beta',
    'CT-e Buscador': 'Buscador Pro',
    'CT-e Conversor': 'Conversor Ultra',
    'NF-e Buscador': 'Sefaz Link',
    'NF-e Conversor': 'Doc Transformer',
    'NFS-e Buscador': 'Service Finder',
    'NFS-e Conversor': 'Service Handler',
    'NF-e Buscador InvoiSys': 'InvoiSys Tracker',
    'Classification': 'Classificador AI',
};

export function getDemoProject(projectName) {
    if (!DEMO_MODE || !projectName) return projectName;
    if (DEMO_PROJECTS[projectName]) return DEMO_PROJECTS[projectName];
    
    return projectName;
}

export function getDemoName(devName) {
    if (DEMO_MODE && DEMO_USERS[devName]) return DEMO_USERS[devName].name;
    return devName;
}
