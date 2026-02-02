import { getItem } from './localStorageService.js';
import { ApiConstants } from './constants/apiConstants.js';

export const GitLabService = {
    async createIssue(batchId) {
        const url = `${ApiConstants.BASE_URL}/automation/create-issue/${batchId}`;
        const token = getItem('token');
        
        const headers = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || response.statusText);
            }

            const result = await response.json();
            return { web_url: result.webUrl };
        } catch (error) {
            console.error('Backend Automation Error:', error);
            throw error;
        }
    }
};
