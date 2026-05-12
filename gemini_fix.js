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
                      "VOCABULÁRIO CLÍNICO OBRIGATÓRIO: Use sempre a grafia 'entesófito' (nunca entesofitose), 'Hoffa', 'patelofemoral', 'femorotibial', 'Baker'.\n" +
                      "🛑 REGRA DE SILÊNCIO: Se o áudio estiver em silêncio, SEM FALA humana, ou for apenas ruído, você DEVE retornar EXATAMENTE uma string vazia (nada).\n" +
                      "⚡ SAÍDA EXCLUSIVA E RÍGIDA: Escreva APENAS a transcrição literal. É TOTALMENTE PROIBIDO anexar confirmações, conversas, 'pronto para atuar' ou qualquer texto do chatbot ao final da transcrição."
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
                topP: 0.95, // Relaxado para evitar cutoff prematuro no final da fala
                maxOutputTokens: 8192 // Dobrado para segurança absoluta
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
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

            if (typeof window.updateApiHealth === 'function') {
                window.updateApiHealth('gemini', 100, 'Operacional');
            }
            let cleanText = textPart.text.trim();

            // 🛡️ RAZOR DE SANEAMENTO: Corta qualquer 'alucinação' de chatbot que a IA anexar no final!
            const hallucinationMarkers = ["Estou pronto", "Entendido.", "Envie o conteúdo"];
            for (const marker of hallucinationMarkers) {
                if (cleanText.includes(marker)) {
                    console.warn(`[GEMINI RAZOR] Cortando alucinação detectada: "${marker}"`);
                    cleanText = cleanText.split(marker)[0].trim();
                }
            }

            return cleanText;
            
        } catch (error) {
            if (typeof window.updateApiHealth === 'function') {
                window.updateApiHealth('gemini', 0, 'Falha na API');
            }
            console.error("Falha no GeminiService:", error);
            // Tratamento amigável para erros comuns (como Rede ou CORS)
            if (error.message === 'Failed to fetch') {
                throw new Error("Erro de Rede/CORS: Verifique se está rodando o app via Servidor Local (localhost:8080) e não abrindo o arquivo diretamente (file://).");
            }
            throw error;
        }
    }

    /**
     * SMART MERGE GEMINI: Versão redundante do motor de fusão de laudos.
     * Acionado caso o Groq atinja limite de cota ou falhe.
     */
    async function smartMerge(dictation, currentReportText) {
        if (!dictation || dictation.length < 3) return null;
        if (!currentReportText || currentReportText.length < 30) return null;

        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            try {
                return await executeMergeRequestGemini(dictation, currentReportText, currentKey);
            } catch (err) {
                console.warn(`⚠️ Falha Gemini SmartMerge Chave #${currentKeyIndex + 1}: ${err.message}. Rotacionando...`);
                currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                attempts++;
                continue;
            }
        }
        return null;
    }

    async function executeMergeRequestGemini(dictation, fullText, API_KEY) {
        if (!API_KEY) throw new Error("Sem chave Gemini");

        // 1. MICRO-RAG DINÂMICO (Clone do motor Groq)
        let relevantStyles = [];
        if (typeof DOCTOR_KNOWLEDGE_BASE !== 'undefined' && Array.isArray(DOCTOR_KNOWLEDGE_BASE)) {
            const keywords = dictation.toLowerCase().split(/\W+/).filter(w => w.length > 4);
            const matches = new Set();
            for (const phrase of DOCTOR_KNOWLEDGE_BASE) {
                const lowerPhrase = phrase.toLowerCase();
                for (const kw of keywords) {
                    if (lowerPhrase.includes(kw)) {
                        matches.add(phrase);
                        break;
                    }
                }
                if (matches.size >= 8) break;
            }
            relevantStyles = Array.from(matches);
        }

        let dynamicStyleGuide = relevantStyles.length > 0 
            ? relevantStyles.map(s => `- "${s}"`).join("\n")
            : `- "Edema da gordura infrapatelar lateral, inferindo impacto local."\n- "Pequeno derrame articular com espessamento sinovial."`;

        dynamicStyleGuide = dynamicStyleGuide.replace(/`/g, "'").replace(/\$/g, "S");

        // 2. SYSTEM PROMPT ATUALIZADO (Clone idêntico para garantir MESMO resultado)
        const systemPrompt = `Você é um sistema de processamento determinístico de strings médicas.
Sua função é realizar a substituição mecânica de parágrafos baseada nas instruções abaixo.

=== GUIA DE ESTILO DINÂMICO (FRASES REAIS DO SEU HISTÓRICO) ===
O médico historicamente escreve assim (utilize esta exata estrutura e vocabulário se compatível):
${dynamicStyleGuide}

=== DIRETRIZES DE PROCESSAMENTO E REFINAMENTO MÉDICO (OBRIGATÓRIO) ===
1. ADAPTAÇÃO AO ESTILO GOLD STANDARD: Priorize RIGOROSAMENTE converter o ditado bruto para as frases consagradas do "GUIA DE ESTILO DINÂMICO".
   - PROIBIÇÃO DE PREÂMBULOS: Nunca use a fórmula "Estrutura X com Achado Y". Use a forma nominal direta: "Achado Y da Estrutura X" (Ex: "Entesófito insercional do quadríceps", e NUNCA "Tendão quadríceps com entesófito").
   - CONCISÃO: Remova negações redundantes anexadas (Ex: "mas sem rupturas") caso a intenção do ditado foque na degeneração. 
2. FRAGMENTAÇÃO RÍGIDA DE COMPARTIMENTOS: É TERMINANTEMENTE PROIBIDO unir lesões de compartimentos diferentes na mesma linha usando conectivos como "além de" ou "associado a". Cada diagnóstico individual DEVE ter sua própria linha isolada. (EXCEÇÃO ÚNICA: Se o ditado usar o termo consolidado "Artropatia degenerativa femorotibial bicompartimental" ou similar contido no guia de estilo, MANTENHA em uma única linha complexa unificada, conforme Exemplo 4).
3. LOCALIZAÇÃO ANATÔMICA PURA E EXCLUSÃO DE HOFFA: Se citar QUALQUER edema (infrapatelar ou suprapatelar), essa frase nova deve SUBSTITUIR COMPLETAMENTE a frase da Gordura de Hoffa. É expressamente PROIBIDO adicionar "Gordura de Hoffa sem outras alterações" em seguida.
4. ORDENAÇÃO DE LIGAMENTOS: Todas as RUPTURAS e patologias ligamentares DEVEM vir PRIMEIRO. A frase de integridade residual (ex: "Ligamentos íntegros") deve obrigatoriamente vir DEPOIS das lesões relatadas.
5. INTEGRIDADE ABSOLUTA E FIM DO TEXTO (CRÍTICO): Você deve obrigatoriamente reescrever TODAS as linhas remanescentes até o final do documento, preservando-as caractere por caractere (Feixes neurovasculares, Subcutâneo, Ausência de lesões, etc.). NUNCA termine a saída antes da última palavra.

=== ESTRUTURAÇÃO E FORMATAÇÃO ===
1. LEI DA DUPLA ATUALIZAÇÃO: Toda patologia ditada DEVE aparecer em DOIS LUGARES: primeiro na seção ANÁLISE (substituindo a frase normal) e depois na seção IMPRESSÃO.
2. REGRA DO COMPARTIMENTO OPOSTO: Se houver lesão em APENAS UM menisco, você OBRIGATORIAMENTE deve escrever a frase "[Menisco Oposto] de morfologia e sinal normais" logo abaixo dele na ANÁLISE, exceto se o ditado citar ambos.
3. REGRA DE SUBTRAÇÃO DE CARTILAGEM: Se o ditado possuir lesão PATELAR ou TROCLEAR, você DEVE remover a palavra "femoropatelares" da frase residual de cartilagem. Se a lesão for FEMOROTIBIAL, remova a palavra "femorotibiais".
4. REGRA DOS LIGAMENTOS SAUDÁVEIS: Ao reportar lesão ligamentar, a frase residual de ligamentos saudáveis deve vir LOGO APÓS a última lesão ligamentar citada.
5. QUEBRA DE LINHA: Cada período diagnóstico isolado deve ocupar sua própria linha (\n).
6. SAÍDA DIRETA: Emita o laudo COMPLETO atualizado, do cabeçalho ao fim. Não omita nenhuma seção original.

=== ALGORITMO DE SUBSTITUIÇÃO E REFINAMENTO POR EXEMPLOS ===

EXEMPLO MASTER: MÚLTIPLAS LESÕES E CAUDA COMPLETA PRESERVADA
Ditado: "Ruptura do LCA. Tendão quadríceps com entesófito. Condropatia medial com fissuras e irregularidades laterais."
Laudo Atual:
ANÁLISE:
Ligamentos cruzados íntegros.
Tendão quadríceps sem alterações.
Superfícies condrais femorotibiais e femoropatelares regulares.
Gordura de Hoffa preservada.
Não há derrame articular significativo.
Demais estruturas ósseas preservadas.
Feixes neurovasculares livres.
Subcutâneo preservado.
Ausência de lesões expansivas.
IMPRESSÃO:
Estudo normal.

Saída Correta:
ANÁLISE:
Ruptura do LCA.
Ligamento cruzado posterior e colaterais íntegros.
Entesófito insercional do quadríceps.
Condropatia femorotibial medial com fissuras.
Irregularidades condrais superficiais no compartimento femorotibial lateral.
Gordura de Hoffa preservada.
Não há derrame articular significativo.
Demais estruturas ósseas preservadas.
Feixes neurovasculares livres.
Subcutâneo preservado.
Ausência de lesões expansivas.
IMPRESSÃO:
- Ruptura do LCA.
- Entesófito insercional do quadríceps.
- Condropatia femorotibial medial com fissuras.
- Irregularidades condrais superficiais no compartimento femorotibial lateral.

EXEMPLO 2: SUBSTITUIÇÃO DE GORDURA DE HOFFA (SEM REPETIÇÃO)
Ditado: "Gordura de Hoffa com edema da gordura suprapatelar por sobrecarga."
Laudo Atual:
ANÁLISE:
Gordura de Hoffa preservada.
Demais estruturas preservadas.
Feixes neurovasculares livres.
Subcutâneo preservado.
IMPRESSÃO:
Estudo normal.

Saída Correta:
ANÁLISE:
Edema da gordura suprapatelar, por sobrecarga do mecanismo extensor.
Demais estruturas preservadas.
Feixes neurovasculares livres.
Subcutâneo preservado.
IMPRESSÃO:
- Edema da gordura suprapatelar, por sobrecarga do mecanismo extensor.

EXEMPLO 3: UNIFICAÇÃO DE ARTROPATIA BICOMPARTIMENTAL (CONSOLIDAÇÃO DE ALTO NÍVEL)
Ditado: "Artropatia degenerativa femorotibial bicompartimental com erosões condrais profundas predominando no compartimento medial com exposição óssea subcondral."
Laudo Atual:
ANÁLISE:
Superfícies condrais femorotibiais e femoropatelares regulares.
Demais estruturas preservadas.
Feixes neurovasculares livres.
Subcutâneo preservado.
IMPRESSÃO:
Estudo normal.

Saída Correta:
ANÁLISE:
Artropatia degenerativa femorotibial bicompartimental com erosões condrais profundas, predominando no compartimento medial, com exposição óssea subcondral.
Superfícies condrais femoropatelares regulares.
Demais estruturas preservadas.
Feixes neurovasculares livres.
Subcutâneo preservado.
IMPRESSÃO:
- Artropatia degenerativa femorotibial bicompartimental com erosões condrais profundas, predominando no compartimento medial, com exposição óssea subcondral.

Lembre-se: Siga RIGOROSAMENTE o padrão de Saída Correta SEM USAR "..." PARA RESUMIR. Transcreva TODAS AS ÚLTIMAS LINHAS ATÉ A PALAVRA FINAL DO LAUDO. PROIBIDO qualquer comentário adicional fora do laudo.`;

        const combinedContent = `${systemPrompt}\n\n==========================================\nTAREFA FINAL: Mescle IMEDIATAMENTE o Ditado Médico abaixo dentro do Laudo Atual, respeitando TODAS as regras e exemplos fornecidos acima.\n\n--- DITADO DO MÉDICO ---\n"${dictation}"\n\n--- LAUDO ATUAL ---\n${fullText}\n\nIMPORTANTE: Emita O LAUDO INTEIRO E MODIFICADO. Proibido omitir ou resumir o final do texto.`;

        // URL Gemini (Estável: gemini-1.5-flash)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;
        
        const payload = {
            // Dupla redundantificação: Enviamos como Instrução E como Conteúdo do Usuário
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: combinedContent }] }],
            generationConfig: {
                temperature: 0.0,
                topP: 0.8,
                maxOutputTokens: 8192
            },
            // 🛡️ DESARMAMENTO DE CENSURA AUTOMÁTICA (CRÍTICO!)
            // O Gemini tende a achar termos médicos perigosos e corta a resposta no MEIO da palavra.
            // Isso garante que nada seja bloqueado por falso-positivo.
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Erro API Gemini SmartMerge: ${response.status}`);

        const data = await response.json();
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            if (typeof window.updateApiHealth === 'function') {
                window.updateApiHealth('gemini', 50, 'Resposta Parcial');
            }
            throw new Error("Resposta vazia do Gemini Merge");
        }

        if (typeof window.updateApiHealth === 'function') {
            window.updateApiHealth('gemini', 100, 'Operacional');
        }
        return data.candidates[0].content.parts[0].text.trim();
    }

    // =========================================================================
    // REDUNDÂNCIA ABSOLUTA: GERADOR DE CONCLUSÃO (IMPRESSÃO) VIA GEMINI
    // =========================================================================
    async function generateConclusion(fullText) {
        const keys = window.MASTER_KEYS?.gemini || [];
        if (keys.length === 0) throw new Error("Nenhuma chave Gemini.");
        const key = keys[0]; // Usa a primeira chave ativa
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
        
        const systemPrompt = `Você é um radiologista sênior especialista em laudos médicos.
Sua missão é gerar a seção IMPRESSÃO extraindo TODOS os diagnósticos patológicos ou anormais citados no laudo fornecido.

REGRAS RÍGIDAS DE EXTRAÇÃO:
1. COMPLETA: Percorra TODO o documento. Se houver MÚLTIPLAS anormalidades, liste TODAS elas sem exceção.
2. LISTA LIMPA: Empilhe os diagnósticos UM EMBAIXO DO OUTRO, um por linha.
3. PONTUAÇÃO OBRIGATÓRIA: Insira um ponto final (.) ao término de CADA UMA das linhas.
4. SEM FORMATAÇÃO: Proibido usar asteriscos (*), traços (-), números ou marcadores. Apenas texto puro por linha.
5. SEM INTRODUÇÃO: Nunca escreva "Conclusão:", "Nota:" ou frases genéricas. Vá direto ao ponto.
6. LAUDO NORMAL: Se NÃO houver nenhuma patologia no laudo, retorne EXATAMENTE: "Estudo por ressonância magnética sem alterações significativas."`;

        const userContent = `Gere a IMPRESSÃO para este laudo:\n\n${fullText}`;

        const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userContent }] }],
            generationConfig: { temperature: 0.1, topP: 0.9, maxOutputTokens: 2048 },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Erro Gemini Conclusion API");
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Estudo sem alterações significativas.";
        } catch (e) {
            console.error("Falha Crítica Backup Conclusion Gemini:", e);
            throw e;
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
        transcribeAudio,
        smartMerge,
        generateConclusion
    };

})();
