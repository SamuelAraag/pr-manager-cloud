const setItem = (key, value) => {
    try {
        const serializedValue = JSON.stringify(value);
        localStorage.setItem(key, serializedValue);
    } catch (error) {
        console.error("Erro ao salvar no localStorage:", error);
    }
};

const getItem = (key) => {
    try {
        const serializedValue = localStorage.getItem(key);
        return serializedValue ? JSON.parse(serializedValue) : null;
    } catch (error) {
        console.error("Erro ao obter do localStorage:", error);
        return null;
    }
};

const removeItem = (key) => {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error("Erro ao remover do localStorage:", error);
    }
};

const clear = () => {
    try {
        localStorage.clear();
    } catch (error) {
        console.error("Erro ao limpar o localStorage:", error);
    }
};

const init = () => {
    try {
        const testKey = '__test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (error) {
        console.error("localStorage não está disponível.");
        return false;
    }
};

export { setItem, getItem, removeItem, clear, init };
