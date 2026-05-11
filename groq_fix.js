/**
 * GroqService — Inteligência Artificial Ultrarrápida para Refinamento, Fusão e Extração de Comandos.
 */
const GroqService = (() => {
    
    // Pool de Chaves Groq para Alta Disponibilidade
    // CARGA SEGURA DINÂMICA DE CHAVES (Proteção Contra Roubo no GitHub Público!)
    const KEYS_POOL = (window.MASTER_KEYS && window.MASTER_KEYS.groq) || ["CHAVE_GROQ_FAKE"];

    let currentKeyIndex = 0;
    let isEnabled = true;

    function setEnabled(status) {
        isEnabled = status;
    }

    function setApiKey(key) {
        if (key && key.trim()) {
            const cleanKey = key.trim();
            if (!KEYS_POOL.includes(cleanKey)) {
                KEYS_POOL.unshift(cleanKey);
            }
            currentKeyIndex = 0;
            localStorage.setItem('groq_api_key', cleanKey);
        }
    }

    /**
     * Realiza a EXTRAÇÃO DE COMANDOS via IA.
     */
    async function extractWorkflow(rawText) {
        if (!rawText || !rawText.trim()) return { commands: [], dictation: "" };
        
        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            try {
                return await executeExtractRequest(rawText, currentKey);
            } catch (err) {
                console.warn("Groq Extract Falhou, rotacionando...", err);
                currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                attempts++;
            }
        }
        return { commands: [], dictation: rawText }; // Fallback de segurança
    }

    async function executeExtractRequest(text, API_KEY) {
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const systemPrompt = `Você é um extrator de intenções de voz para radiologia. Analise a fala e retorne JSON estrito.\nComandos:\n- "Paciente [Nome]" -> action: "setPatient", value: "[Nome]"\n- "Laudo [Parte e Lado]" -> action: "loadTemplate", value: "[Parte e Lado]"\n- "Finalizar Exame" -> action: "finishReport", value: ""\n\nRetorne JSON:\n{"commands": [{"action": "...", "value": "..."}], "dictation": "Texto restante"}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", 
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
                temperature: 0.1,
                response_format: { type: "json_object" }
            })
        });
        if (!response.ok) throw new Error(`Erro API Groq: ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.choices?.[0]?.message?.content);
    }

    /**
     * MÓDULO SMART MERGE: Realiza a SUBSTITUIÇÃO INTELIGENTE DE FRASES NORMAIS.
     */
    async function smartMerge(dictation, currentReportText) {
        if (!isEnabled) return null; 
        if (!dictation || !dictation.trim()) return null;
        if (!currentReportText || currentReportText.length < 30) return null;

        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            try {
                const result = await executeMergeRequest(dictation, currentReportText, currentKey);
                return result;
            } catch (err) {
                // CRÍTICO: Roda a roleta de chaves para QUALQUER ERRO (401, 429, 500, etc.)
                console.warn(`⚠️ Falha na Chave Groq #${currentKeyIndex + 1}. Erro: ${err.message}. Rotacionando para reserva...`);
                currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                attempts++;
                continue; // Pula para a próxima chave do pool!
            }
        }
        return null;
    }

    async function executeMergeRequest(dictation, fullText, API_KEY) {
        const url = "https://api.groq.com/openai/v1/chat/completions";
        
        // =====================================================================
        // MICRO-RAG DINÂMICO: Busca exemplos reais na bíblia do médico (1.400 frases)
        // =====================================================================
        let relevantStyles = [];
        if (typeof DOCTOR_KNOWLEDGE_BASE !== 'undefined' && Array.isArray(DOCTOR_KNOWLEDGE_BASE)) {
            // Extrai palavras-chave clínicas do ditado
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
                if (matches.size >= 8) break; // Limita a 8 exemplos reais para não estourar token
            }
            relevantStyles = Array.from(matches);
        }

        // Formata a string de conhecimento dinâmico
        let dynamicStyleGuide = relevantStyles.length > 0 
            ? relevantStyles.map(s => `- "${s}"`).join("\n")
            : `- "Edema da gordura infrapatelar lateral, inferindo impacto local."\n- "Pequeno derrame articular com espessamento sinovial."`;

        // CRÍTICO: Esteriliza a string para não quebrar o template literal do Javascript!
        dynamicStyleGuide = dynamicStyleGuide.replace(/`/g, "'").replace(/\$/g, "S");

        const systemPrompt = `Você é um sistema de processamento determinístico de strings médicas.
Sua função é realizar a substituição mecânica de parágrafos baseada nas instruções abaixo.

=== GUIA DE ESTILO DINÂMICO (FRASES REAIS DO SEU HISTÓRICO) ===
O médico historicamente escreve assim (utilize esta exata estrutura e vocabulário se compatível):
${dynamicStyleGuide}

=== DIRETRIZES DE PROCESSAMENTO LITERAL (OBRIGATÓRIO) ===
1. PRESERVAÇÃO TEXTUAL: É terminantemente proibido alterar o vocabulário, corrigir gramática ou aplicar sinonímia. Copie o bloco ditado caractere por caractere.
2. ZERO ACRÉSCIMO: Não insira textos explicativos, prólogos ou epílogos. Insira apenas os achados brutos do ditado.
3. PRECISÃO: Mantenha fidelidade total à terminologia usada pelo especialista.
4. INTEGRIDADE ABSOLUTA E PROIBIÇÃO DE TRUNCAMENTO (CRÍTICO): É TERMINANTEMENTE PROIBIDO cortar, abreviar ou omitir qualquer parte do laudo. A saída DEVE conter rigorosamente TODAS as seções e parágrafos originais. Você deve obrigatoriamente reescrever TODAS as linhas remanescentes até o final do documento, preservando-as caractere por caractere. NUNCA termine a saída antes da última linha do laudo.

=== ESTRUTURAÇÃO E FORMATAÇÃO ===
1. LEI DA DUPLA ATUALIZAÇÃO: Toda patologia ditada DEVE aparecer em DOIS LUGARES: primeiro na seção ANÁLISE (substituindo a frase normal) e depois na seção IMPRESSÃO (como item da lista).
2. REGRA DO COMPARTIMENTO OPOSTO (CRÍTICO): Se houver lesão em APENAS UM menisco, você OBRIGATORIAMENTE deve escrever a frase "[Menisco Oposto] de morfologia e sinal normais" logo abaixo dele na ANÁLISE.
3. REGRA DE SUBTRAÇÃO DE CARTILAGEM: Se o ditado possuir lesão PATELAR ou TROCLEAR, você DEVE remover a palavra "femoropatelares" da frase residual de cartilagem. Se a lesão for FEMOROTIBIAL, remova a palavra "femorotibiais".
4. REGRA DOS LIGAMENTOS SAUDÁVEIS: Ao reportar lesão ligamentar, você DEVE SEMPRE acrescentar uma frase única listando os ligamentos que restaram saudáveis (ex: "Ligamento cruzado posterior e colaterais íntegros.").
5. REGRA DO MANGUITO RESTANTE (CRÍTICO): Se houver lesão em APENAS UM tendão do manguito (ex: supraespinhal), você DEVE obrigatoriamente acrescentar logo abaixo: "Demais tendões do manguito rotador (infraespinhal, subescapular e redondo menor) de espessura e sinal normais.".
6. QUEBRA DE LINHA: Cada período diagnóstico deve ocupar sua própria linha isolada (\n).
7. SAÍDA DIRETA: Emita o laudo COMPLETO atualizado, do cabeçalho ao fim. Não omita nenhuma seção original.

=== ALGORITMO DE SUBSTITUIÇÃO POR EXEMPLOS ===

EXEMPLO 1A: MENISCO MEDIAL LESADO (Mantendo o oposto saudável)
Ditado: "Ruptura do menisco medial."
Laudo:
RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO
ANÁLISE:
Meniscos de morfologia e sinal normais.
Ligamentos íntegros.
IMPRESSÃO:
Estudo normal.

Saída Correta:
RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO
ANÁLISE:
Ruptura do menisco medial.
Menisco lateral de morfologia e sinal normais.
Ligamentos íntegros.
IMPRESSÃO:
- Ruptura do menisco medial.

EXEMPLO 2: LIGAMENTOS COM LESÃO (Mantendo patologias já existentes)
Ditado: "Ruptura do LCA."
Laudo:
RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO
ANÁLISE:
Ruptura do menisco medial.
Menisco lateral de morfologia e sinal normais.
Ligamentos cruzados e colaterais íntegros.
Superfícies preservadas.
IMPRESSÃO:
- Ruptura do menisco medial.

Saída Correta:
RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO
ANÁLISE:
Ruptura do menisco medial.
Menisco lateral de morfologia e sinal normais.
Ruptura do LCA.
Ligamento cruzado posterior e colaterais íntegros.
Superfícies preservadas.
IMPRESSÃO:
- Ruptura do menisco medial.
- Ruptura do LCA.

EXEMPLO 3: CARTILAGEM COM LESÃO PATELAR (Demonstração de preservação até o fim absoluto)
Ditado: "Condropatia patelar."
Laudo:
RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO
ANÁLISE:
Superfícies condrais femorotibiais e femoropatelares regulares.
Não há derrame articular significativo.
Fossa poplítea livre.
Demais estruturas ósseas e planos miotendíneos preservados.
IMPRESSÃO:
Estudo normal.

Saída Correta:
RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO
ANÁLISE:
Condropatia patelar.
Demais superfícies condrais femorotibiais regulares, sem erosões profundas.
Não há derrame articular significativo.
Fossa poplítea livre.
Demais estruturas ósseas e planos miotendíneos preservados.
IMPRESSÃO:
- Condropatia patelar.

EXEMPLO 4: MANGUITO ROTADOR COM LESÃO
Ditado: "Rotura transfixante do supraespinhal."
Laudo:
RESSONÂNCIA MAGNÉTICA DO OMBRO DIREITO
ANÁLISE:
Tendões do manguito rotador de espessura e sinal normais.
Lábio íntegro.
IMPRESSÃO:
Estudo normal.

Saída Correta:
RESSONÂNCIA MAGNÉTICA DO OMBRO DIREITO
ANÁLISE:
Rotura transfixante do supraespinhal.
Demais tendões do manguito rotador (infraespinhal, subescapular e redondo menor) de espessura e sinal normais.
Lábio íntegro.
IMPRESSÃO:
- Rotura transfixante do supraespinhal.

EXEMPLO 5: SUBSTITUIÇÃO NA PENÚLTIMA LINHA (Evitando corte do rodapé)
Ditado: "Bursite trocantérica."
Laudo:
RESSONÂNCIA MAGNÉTICA DO QUADRIL
ANÁLISE:
Lábio íntegro.
Superfícies regulares.
Bursa sem coleções.
Estruturas ósseas de aspecto habitual.
IMPRESSÃO:
Estudo normal.

Saída Correta:
RESSONÂNCIA MAGNÉTICA DO QUADRIL
ANÁLISE:
Lábio íntegro.
Superfícies regulares.
Bursite trocantérica.
Estruturas ósseas de aspecto habitual.
IMPRESSÃO:
- Bursite trocantérica.

Lembre-se: Siga RIGOROSAMENTE o padrão de Saída Correta dos exemplos SEM USAR "..." PARA RESUMIR. Emita O LAUDO COMPLETO DO INÍCIO AO FIM SEMPRE. PROIBIDO qualquer comentário.`;

        const userContent = `--- DITADO DO MÉDICO ---\n"${dictation}"\n\n--- LAUDO ATUAL ---\n${fullText}\n\nIMPORTANTE: Transcreva O LAUDO INTEIRO até o fim absoluto, incluindo todas as linhas que NÃO foram alteradas. Proibido omitir ou resumir o final do texto.`;

        const payload = {
            model: "llama-3.3-70b-versatile", 
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.0, 
            top_p: 0.01,
            max_tokens: 4096
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Erro API Merge: ${response.status}`);

        const data = await response.json();
        const mergedContent = data.choices?.[0]?.message?.content;
        if (!mergedContent) throw new Error("Resposta da IA retornou vazia");

        return mergedContent.trim();
    }

    async function generateConclusionFallback(fullText) {
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const systemPrompt = `Você é um médico especialista. Extraia apenas as anormalidades patológicas. Sem marcadores, uma por linha.`;
        
        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const key = KEYS_POOL[currentKeyIndex];
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: fullText }],
                        temperature: 0.1
                    })
                });
                const data = await response.json();
                return data.choices?.[0]?.message?.content || null;
            } catch(e) {
                currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                attempts++;
            }
        }
        return null;
    }

    return {
        setApiKey,
        setEnabled,
        extractWorkflow, 
        smartMerge,
        generateConclusionFallback
    };
})();
