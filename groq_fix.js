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
                if (err.message.includes("429") || err.message.includes("rate") || err.message.includes("limit")) {
                    console.warn(`Groq Merge Chave #${currentKeyIndex + 1} limitada. Rotacionando...`);
                    currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                    attempts++;
                    continue;
                }
                console.error("Erro fatal Groq Merge:", err);
                return null;
            }
        }
        return null;
    }

    async function executeMergeRequest(dictation, fullText, API_KEY) {
        const url = "https://api.groq.com/openai/v1/chat/completions";
        
        // CORREÇÃO CRÍTICA: Removidas as reticências '...' dos exemplos que induziam a IA a apagar conteúdo!
        const systemPrompt = `Você é um especialista em fusão textual radiológica de ELITE.
Sua MISSÃO é aplicar RIGOROSAMENTE a lógica de substituição definida abaixo.

--- REGRA DE FORMATAÇÃO GERAL E OBRIGATÓRIA ---
Você DEVE obrigatoriamente separar cada patologia e cada frase residual com uma QUEBRA DE LINHA. 
NUNCA deixe duas frases na mesma linha. Cada ponto final "." deve gerar um pulo de linha.

--- MATRIZ DE REGRAS DE SUBSTITUIÇÃO CIRÚRGICA ---

1. MENISCOS (Alvo: "Meniscos de morfologia e sinal normais.")
*REGRA DE OURO OBRIGATÓRIA*: Se houver lesão em apenas UM dos meniscos, você DEVE escrever a lesão E LOGO ABAIXO a frase declarando o outro como normal. PROIBIDO apagar o menisco normal remanescente!

--- TABELA DE COMBINAÇÃO DOS MENISCOS (RESULTADO EXATO) ---
- Lesão APENAS no MEDIAL -> Substituir por EXACTAMENTE isto:
[Patologia Ditada].
Menisco lateral de morfologia e sinal normais.

- Lesão APENAS no LATERAL -> Substituir por EXACTAMENTE isto:
[Patologia Ditada].
Menisco medial de morfologia e sinal normais.

- Lesão em AMBOS os meniscos (Medial + Lateral): NÃO HAVERÁ FRASE RESIDUAL. Apague totalmente qualquer menção a meniscos normais e retorne APENAS as patologias ditadas.
*ATENÇÃO: PROIBIDO usar a palavra "Demais" nesta regra de meniscos.

2. LIGAMENTOS (Alvo: "Ligamentos cruzados e colaterais íntegros.")
*LÓGICA DE SUBTRAÇÃO MATEMÁTICA (VITAL)*: Você deve subtrair TODOS os ligamentos lesionados do grupo total e criar UMA ÚNICA linha residual saudável no final, agrupando o que sobrou. É proibido gerar frases redundantes.

--- TABELA DE COMBINAÇÕES (ESTILO DE RESULTADO FINAL) ---
- Lesão LCA + Colateral Medial -> Resultado Exato:
[Patologia LCA].
[Patologia Colateral Medial].
Ligamentos cruzado posterior e colateral lateral íntegros.

- Lesão LCA + Colateral Lateral -> Resultado Exato:
[Patologia LCA].
[Patologia Colateral Lateral].
Ligamentos cruzado posterior e colateral medial íntegros.

*REGRA DE OURO OBRIGATÓRIA*: Você DEVE obrigatoriamente colocar os TEXTOS DAS PATOLOGIAS DITADAS no documento, ANTES da frase residual saudável. NUNCA apague o ditado da lesão!
Exemplo Correto: "Ruptura do LCA... Ruptura do Colateral... Ligamentos cruzado posterior e colateral lateral íntegros."

3. MATRIZ CONDRAL COMPLEXA (Alvo: "Superfícies condrais femorotibiais e femoropatelares regulares, sem erosões profundas.")
*LÓGICA DE SUBTRAÇÃO ABSOLUTA*: Subtraia TODAS as patologias citadas e gere APENAS UMA linha consolidada final baseada no saldo restante dos compartimentos:

--- TABELA DE COMBINAÇÕES CONDRAL (ESTILO DE RESULTADO FINAL) ---
- Lesão Femorotibial Medial + Patelar -> Resultado: [Patologia Condral 1] [Patologia Condral 2] Demais superfícies condrais femorotibiais laterais regulares, sem erosões profundas.
- Lesão AMBOS Femorotibiais -> Resultado: [Patologia Condral 1] [Patologia Condral 2] Demais superfícies condrais femoropatelares regulares, sem erosões profundas.
- Lesão Única Medial ou Lateral -> Resultado: [Patologia Condral] Demais superfícies condrais femorotibiais e femoropatelares regulares, sem erosões profundas.

*REGRA DE OURO OBRIGATÓRIA*: Você DEVE obrigatoriamente inserir os textos das lesões ANTES da frase residual saudável no laudo. Proibido comer o texto do ditado!

--- REGRAS DE ELIMINAÇÃO TOTAL (APAGUE A LINHA ALVO SE HOUVER O ACHADO) ---

- APAGUE "Fossa poplítea livre" -> Se houver "Cisto de Baker" ou "lâmina líquida na bursa".
- APAGUE "Subcutâneo preservado" -> Se houver alteração descrita no subcutâneo.
- APAGUE "Ausência de lesões expansivas" -> Se houver lesão tumoral ou lesão óssea descrita.
- APAGUE "Feixes neurovasculares livres" -> Se houver descrição de trombose ou tromboflebite.
- APAGUE "Tendão quadríceps e ligamento patelar sem alterações" -> Se houver achado no tendão patelar ou quadríceps.
- APAGUE "Gordura de Hoffa preservada" -> Se houver "edema da gordura infrapatelar lateral", "suprapatelar" ou "pré-femoral".

--- REGRAS VITAIS DE INTEGRIDADE ---
- Mantenha 100% do ditado VERBATIM. Sem sinônimos. Sem "Condropatia" no lugar de "Irregularidades".
- O Laudo final deve ser devolvido na ÍNTEGRA, apenas com as linhas operadas cirurgicamente.`;

        const userContent = `--- DITADO DO MÉDICO ---\n"${dictation}"\n\n--- LAUDO ATUAL ---\n${fullText}`;

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
