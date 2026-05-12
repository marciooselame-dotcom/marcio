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
        const systemPrompt = `Você é um extrator de intenções de voz ultrarrígido para radiologia. Analise a fala e retorne JSON estrito.
        
REGRAS DE EXTRAÇÃO CRÍTICAS:
1. O NOME DO PACIENTE (setPatient) DEVE conter APENAS o nome real. É TERMINANTEMENTE PROIBIDO que a palavra "LAUDO", "EXAME" ou qualquer outra instrução seguinte vaze para dentro do valor do paciente. Corte IMEDIATAMENTE ao encontrar um gatilho de próximo comando.
2. SEPARAÇÃO TOTAL: Se falado "Paciente Fulano Laudo Joelho", o valor do paciente deve ser rigorosamente "Fulano".

Comandos Suportados:
- "Paciente [Nome]" -> action: "setPatient", value: "[Nome Limpo]"
- "Laudo [Parte e Lado]" -> action: "loadTemplate", value: "[Parte e Lado]"
- "Finalizar Exame" -> action: "finishReport", value: ""

Retorne APENAS o JSON:
{"commands": [{"action": "...", "value": "..."}], "dictation": "Texto restante sem comandos"}`;
        
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
    async function smartMerge(dictation, currentReportText, clinicType = 'base') {
        if (!isEnabled) return null; 
        if (!dictation || !dictation.trim()) return null;
        if (!currentReportText || currentReportText.length < 30) return null;

        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            try {
                const result = await executeMergeRequest(dictation, currentReportText, clinicType, currentKey);
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

    async function executeMergeRequest(dictation, fullText, clinicType, API_KEY) {
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

        // --- BLOCO DE REGRAS CONTEXTUAIS DINÂMICAS (DASA / FLORIPA) ---
        let contextualOverrides = "";
        
        if (clinicType === 'dasa') {
            contextualOverrides = `
=== 🚨 REGRA DE NEGÓCIO EXCLUSIVA E PRIORITÁRIA: GRUPO DASA 🚨 ===
1. ORDENAÇÃO NO TOPO DA ANÁLISE: É MANDATÓRIO que todas as novas frases de lesão, ruptura, edema ou cisto sejam escritas OBRIGATORIAMENTE NO INÍCIO da seção "ANÁLISE:", logo abaixo do cabeçalho.
2. SEQUÊNCIA: Primeiro todas as alterações juntas, depois todas as frases de normalidade preservadas.
3. PROIBIÇÃO ABSOLUTA DE CONCLUSÃO: Ignore completamente a 'LEI DA DUPLA ATUALIZAÇÃO'. NÃO escreva nada após as frases finais da análise. A seção "IMPRESSÃO" é terminantemente proibida no contexto DASA.
`;
        }

        const systemPrompt = `${contextualOverrides}
Você é um sistema de processamento determinístico de strings médicas.
Sua função é realizar a substituição mecânica de parágrafos baseada nas instruções abaixo.

=== GUIA DE ESTILO DINÂMICO (FRASES REAIS DO SEU HISTÓRICO) ===
O médico historicamente escreve assim (utilize esta exata estrutura e vocabulário se compatível):
${dynamicStyleGuide}

=== DIRETRIZES DE PROCESSAMENTO E REFINAMENTO MÉDICO (OBRIGATÓRIO) ===
1. ADAPTAÇÃO AO ESTILO GOLD STANDARD: Priorize RIGOROSAMENTE converter o ditado bruto para as frases consagradas do "GUIA DE ESTILO DINÂMICO".
   - PROIBIÇÃO DE PREÂMBULOS: Nunca use a fórmula "Estrutura X com Achado Y". Use a forma nominal direta: "Achado Y da Estrutura X" (Ex: "Entesófito insercional do quadríceps", e NUNCA "Tendão quadríceps com entesófito").
   - CONCISÃO: Remova negações redundantes anexadas (Ex: "mas sem rupturas") caso a intenção do ditado foque na degeneração. 
2. FRAGMENTAÇÃO RÍGIDA DE COMPARTIMENTOS: É TERMINANTEMENTE PROIBIDO unir lesões de compartimentos diferentes na mesma linha usando conectivos como "além de" ou "associado a". Cada diagnóstico individual DEVE ter sua própria linha isolada. (EXCEÇÃO ÚNICA: Se o ditado usar o termo consolidado "Artropatia degenerativa femorotibial bicompartimental" ou similar contido no guia de estilo, MANTENHA em uma única linha complexa unificada, conforme Exemplo 3).
3. LOCALIZAÇÃO ANATÔMICA PURA E EXCLUSÃO DE HOFFA: Se citar QUALQUER edema (infrapatelar ou suprapatelar), essa frase nova deve SUBSTITUIR COMPLETAMENTE a frase da Gordura de Hoffa. É expressamente PROIBIDO adicionar "Gordura de Hoffa sem outras alterações" em seguida.
4. ORDENAÇÃO DE LIGAMENTOS: Todas as RUPTURAS e patologias ligamentares DEVEM vir PRIMEIRO. A frase de integridade residual (ex: "Ligamentos íntegros") deve obrigatoriamente vir DEPOIS das lesões relatadas.
5. INTEGRIDADE ABSOLUTA E FIM DO TEXTO (CRÍTICO): Você deve obrigatoriamente reescrever TODAS as linhas remanescentes até o final do documento, preservando-as caractere por caractere (Feixes neurovasculares, Subcutâneo, Ausência de lesões, etc.). NUNCA termine a saída antes da última palavra.

=== ESTRUTURAÇÃO E FORMATAÇÃO ===
1. LEI DA DUPLA ATUALIZAÇÃO: Toda patologia ditada DEVE aparecer em DOIS LUGARES: primeiro na seção ANÁLISE (substituindo a frase normal) e depois na seção IMPRESSÃO.
2. REGRA DO COMPARTIMENTO OPOSTO: Se houver lesão em APENAS UM menisco, você OBRIGATORIAMENTE deve escrever a frase "[Menisco Oposto] de morfologia e sinal normais" logo abaixo dele na ANÁLISE, exceto se o ditado citar ambos.
3. REGRA DE SUBTRAÇÃO DE CARTILAGEM: Se o ditado possuir lesão PATELAR ou TROCLEAR, você DEVE remover a palavra "femoropatelares" da frase residual de cartilagem. Se a lesão for FEMOROTIBIAL, remova a palavra "femorotibiais".
4. REGRA DOS LIGAMENTOS SAUDÁVEIS: Ao reportar lesão ligamentar, a frase residual de ligamentos saudáveis deve vir LOGO APÓS a última lenão ligamentar citada.
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

        const userContent = `TAREFA FINAL: Mescle as alterações do Ditado Médico abaixo dentro do Laudo Atual, obedecendo RIGOROSAMENTE as regras instruídas.\n\n--- DITADO DO MÉDICO ---\n"${dictation}"\n\n--- LAUDO ATUAL ---\n${fullText}\n\nIMPORTANTE: Emita O LAUDO COMPLETO E MODIFICADO. Proibido omitir ou resumir o final do texto.`;

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

        // EXTRAÇÃO INTELIGENTE DE COTA (REALTIME DAS HEADERS!)
        if (typeof window.updateApiHealth === 'function') {
            const remaining = parseInt(response.headers.get('x-ratelimit-remaining-requests') || "0");
            const limit = parseInt(response.headers.get('x-ratelimit-limit-requests') || "100");
            
            if (response.status === 429) {
                window.updateApiHealth('groq', 0, 'Esgotado (429)');
            } else if (limit > 0) {
                const pct = Math.round((remaining / limit) * 100);
                window.updateApiHealth('groq', pct, `${pct}% Restantes`);
            } else if (response.ok) {
                window.updateApiHealth('groq', 100, 'Conectado');
            }
        }

        if (!response.ok) throw new Error(`Erro API Merge: ${response.status}`);

        const data = await response.json();
        const mergedContent = data.choices?.[0]?.message?.content;
        if (!mergedContent) throw new Error("Resposta da IA retornou vazia");

        return mergedContent.trim();
    }

    async function generateConclusionFallback(fullText, clinicType = 'base') {
        const url = "https://api.groq.com/openai/v1/chat/completions";

        let floripaRules = "";
        if (clinicType === 'floripa') {
            floripaRules = `=== 🏥 REGRA FLORIPA (CLASSIFICAÇÃO) ===
Converta achados de cartilagem para Graus: GRAU I (alteração sinal), GRAU II (irreg. superficiais), GRAU III (erosão/afilamento profundo), GRAU IV (com EDEMA ou EXPOSIÇÃO óssea). `;
        }

        const systemPrompt = `${floripaRules}Você é um médico especialista. Extraia apenas as anormalidades patológicas. Sem marcadores, uma por linha. OBRIGATÓRIO: Insira um ponto final "." ao término de cada uma das frases.`;
        
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
