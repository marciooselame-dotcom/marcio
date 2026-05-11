/**
 * GeminiService — Integração direta com a API do Google Gemini para Processamento de Áudio.
 */
const GeminiService = (() => {
    
    // Pool de Chaves para Rodízio Automático (Load Balancer para evitar limites de cota)
    // CARGA SEGURA DINÂMICA DE CHAVES (Para não vazar no GitHub Público!)
    const KEYS_POOL = (window.MASTER_KEYS && window.MASTER_KEYS.gemini) || ["CHAVE_FAKE_INSIRA_AQUI"];

    let currentKeyIndex = 0;

    function setApiKey(key) {
        // O usuário inseriu uma chave personalizada no input, vamos colocá-la no topo do pool
        if (key && key.trim()) {
            const cleanKey = key.trim();
            if (!KEYS_POOL.includes(cleanKey)) {
                KEYS_POOL.unshift(cleanKey);
            }
            currentKeyIndex = 0; // Reiniciar para usar a nova primeiro
            localStorage.setItem('gemini_api_key', cleanKey);
        }
    }

    /**
     * Loop Inteligente de Transcrição com Rodízio Automático em caso de Limite de Cota (429)
     */
    async function transcribeAudio(audioBlob) {
        let lastError = null;
        let attempts = 0;

        // Tenta até percorrer todas as chaves disponíveis no pool
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            console.log(`[GeminiService] Tentando requisição com Chave #${currentKeyIndex + 1}`);

            try {
                const result = await executeRequest(audioBlob, currentKey);
                return result; // SUCESSO! Retorna imediatamente
            } catch (err) {
                lastError = err;
                // Se o erro for de Limite de Cota (429) ou de Chave Expirada (403/400)
                if (err.message.includes("429") || err.message.includes("quota") || err.message.includes("limit")) {
                    console.warn(`Chave #${currentKeyIndex + 1} esgotou o limite. Alternando automaticamente...`);
                    currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length; // Vai para a próxima chave circularmente
                    attempts++;
                    continue; // Continua o loop com a próxima chave
                }
                
                // Se for outro erro fatal que não seja cota, estoura imediatamente
                throw err;
            }
        }

        // Se saiu do loop, significa que TODAS as chaves falharam
        throw new Error("TODAS as suas chaves de API do Gemini atingiram o limite simultâneo. Aguarde 1 minuto ou insira uma nova chave.");
    }

    // Extraído o core da requisição para suportar a retentativa limpa
    async function executeRequest(audioBlob, API_KEY) {
        if (!API_KEY) {
            throw new Error("Nenhuma Chave Gemini disponível.");
        }

        // 1. Converter Blob para Base64
        const base64Audio = await blobToBase64(audioBlob);
        
        // Higienizar o mimeType (remover ";codecs=..." que pode confundir a API)
        const cleanMime = (audioBlob.type || "audio/webm").split(';')[0];
        console.log("Enviando para Gemini com MIME Type:", cleanMime);

        // 2. Definir o payload do Gemini (Multimodal)


        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;

        const systemInstruction = {
            parts: [{
                text: "Você é um motor de transcrição médica profissional. Sua missão é converter o áudio em texto literal. " +
                      "REGRA DE PONTUAÇÃO: Você DEVE converter comandos verbais de pontuação para os símbolos gráficos correspondentes: " +
                      "Converta 'vírgula' para ',', 'ponto' ou 'ponto final' para '.', e 'parágrafo' ou 'nova linha' para '\\n'. " +
                      "PROIBIDO interpretar ou deduzir diagnósticos. Apenas converta o áudio e a pontuação falada. " +
                      "VOCABULÁRIO CLÍNICO OBRIGATÓRIO: Use sempre a grafia 'entesófito' (nunca entesofitose), 'Hoffa', 'patelofemoral', 'femorotibial', 'Baker'."
            }]
        };

        const payload = {
            systemInstruction: systemInstruction,
            contents: [{
                parts: [
                    {
                        inlineData: {
                            mimeType: cleanMime,
                            data: base64Audio
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.0, 
                topP: 0.1, 
                maxOutputTokens: 4096 // Aumentado para garantir que laudos longos nunca sejam cortados
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errText = "";
                try {
                    const errJson = await response.json();
                    errText = errJson.error?.message || JSON.stringify(errJson);
                } catch(e) {
                    errText = `Status ${response.status}: ${response.statusText}`;
                }
                throw new Error(`ERRO API GEMINI: ${errText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
                throw new Error("Nenhuma transcrição retornada (áudio pode estar mudo ou inaudível).");
            }

            const textPart = data.candidates[0].content.parts.find(p => p.text);
            if (!textPart) {
                throw new Error("Nenhum texto encontrado na resposta do Gemini.");
            }

            return textPart.text.trim();
            
        } catch (error) {
            console.error("Falha no GeminiService:", error);
            // Tratamento amigável para erros comuns (como Rede ou CORS)
            if (error.message === 'Failed to fetch') {
                throw new Error("Erro de Rede/CORS: Verifique se está rodando o app via Servidor Local (localhost:8080) e não abrindo o arquivo diretamente (file://).");
            }
            throw error;
        }
    }

    // Helper para converter blob para base64 puro sem o prefixo de data url
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    return {
        setApiKey,
        hasKey: () => KEYS_POOL.length > 0,
        transcribeAudio
    };

})();
