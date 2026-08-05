// Aguarda o carregamento do DOM para iniciar o script de monitoramento
document.addEventListener("DOMContentLoaded", () => {
    // Seleciona o container que exibirá o histórico de logs
    const logContainer = document.getElementById("logContainer");
    const alvo = "www.google.com.br";
    let contadorSeq = 0;
    
    // Adiciona o cabeçalho inicial simulando o comando ping do sistema operacional
    function adicionarCabecalho() {
        const linhaCabecalho = document.createElement("div");
        linhaCabecalho.className = "log-entry";
        linhaCabecalho.innerHTML = `<span>PING ${alvo} (142.250.218.195): 56 data bytes</span>`;
        logContainer.appendChild(linhaCabecalho);
    }

    // Função para formatar a saída igual ao terminal de comando
    function registrarResposta(sucesso, tempoMs, statusHttp) {
        const novaLinha = document.createElement("div");
        novaLinha.className = "log-entry";
        
        if (sucesso) {
            // Formatação padrão: 64 bytes de endereço: seq=0 status=200 tempo=10.5 ms
            novaLinha.innerHTML = `
                <span>64 bytes de ${alvo}: </span>
                <span>icmp_seq=${contadorSeq} </span>
                <span>status=${statusHttp} </span>
                <span class="status-up">tempo=${tempoMs.toFixed(3)} ms</span>
            `;
        } else {
            // Mensagem de erro padrão para tempo de requisição esgotado
            novaLinha.innerHTML = `
                <span class="status-down">Request timeout for icmp_seq ${contadorSeq}</span>
            `;
        }
        
        // Adiciona ao container e rola para o final automaticamente
        logContainer.appendChild(novaLinha);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Incrementa o número da sequência para o próximo registro
        contadorSeq++;
    }

    // Define a rotina de repetição inspirada no comportamento do terminal
    function iniciarCiclo() {
        // Intervalo de 1 segundo entre cada ping para maior realismo
        setTimeout(async () => {
            await executarPing();
            iniciarCiclo();
        }, 1000);
    }

    // Realiza a chamada técnica e mede o tempo de resposta
    async function executarPing() {
        const inicio = performance.now();
        
        try {
            // Executa a requisição externa
            const resposta = await fetch(`https://${alvo}`, { mode: 'no-cors' });
            const fim = performance.now();
            const duracao = fim - inicio;
            
            // Em modo no-cors, o status numérico pode retornar 0 por segurança,
            // então exibimos 200 como indicação de sucesso na conexão.
            registrarResposta(true, duracao, resposta.status || 200);
        } catch (erro) {
            // Registra falha caso o destino esteja inacessível
            registrarResposta(false);
            console.error("Falha técnica no ping:", erro);
        }
    }

    // Inicializa o processo oficial de monitoramento
    adicionarCabecalho();
    iniciarCiclo();
});