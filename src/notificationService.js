
import { ApiConstants } from './constants/apiConstants.js';
import { showToast } from './domService.js';

let connection = null;

export async function connectSignalR(onMessageReceived) {
    if (typeof signalR === 'undefined') {
        console.warn('SignalR library not loaded.');
        return;
    }

    const hubUrl = ApiConstants.BASE_URL.replace('/api', '/notificationHub');

    connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect([0, 2000, 10000, 30000]) 
        .build();

    connection.on("ReceiveNotification", (messageJson) => {
        try {
            const data = JSON.parse(messageJson);
            
            const title = `PR - ${data.Project}`;
            let msg = data.Summary;
            let type = 'info';

            // Determine type and message based on state changes
            if (data.Status === 'Archived') {
                type = 'warning';
                msg = `PR Arquivado: ${data.Summary}`;
            } else if (data.Approved) {
                type = 'success';
                msg = `PR Aprovado por ${data.ApprovedBy}`;
            } else if (data.NeedsCorrection) {
                type = 'error';
                msg = `Correção Solicitada: ${data.CorrectionReason}`;
            } else if (data.ReqVersion === 'pending') {
                type = 'info';
                msg = `Nova solicitação de versão`;
            } else if (data.DeployedToStg) {
                type = 'success';
                msg = `Deploy em Staging Realizado (v${data.Version})`;
            }

            showToast(msg, type, title);

            if (onMessageReceived) {
                setTimeout(onMessageReceived, 500); // Small delay to allow toast to render and backend to settle
            }

        } catch (e) {
            console.error("Error parsing notification:", e);
            showToast("Atualização recebida", 'info', 'PR Manager');
            if (onMessageReceived) onMessageReceived();
        }
    });

    try {
        await connection.start();
        console.log("SignalR Connected to " + hubUrl);
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
    }
}
