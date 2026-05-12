/**
 * OpenAIService — Responsável pelo Estágio 3: Geração Automática da CONCLUSÃO/IMPRESSÃO.
 */
const OpenAIService = (() => {
    
    // Pool de Chaves OpenAI (ChatGPT) para Carga Balanceada
    // CARGA SEGURA DINÂMICA DE CHAVES (Proteção Contra Roubo no GitHub Público!)
    const KEYS_POOL = (window.MASTER_KEYS && window.MASTER_KEYS.openai) || ["CHAVE_OPENAI_FAKE"];

    let currentKeyIndex = 0;

    function setApiKey(key) {
        if (key && key.trim()) {
            const cleanKey = key.trim();
            if (!KEYS_POOL.includes(cleanKey)) {
                KEYS_POOL.unshift(cleanKey);
            }
            currentKeyIndex = 0;
        }
    }

    /**
     * Analisa o texto do laudo e gera a seção IMPRESSÃO automaticamente usando ChatGPT.
     */
    async function generateConclusion(fullText, clinicType = 'base') {
        if (!fullText || fullText.length < 10) return null;

        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            try {
                return await executeRequest(fullText, currentKey, clinicType);
            } catch (err) {
                if (err.message.includes("429") || err.message.includes("rate") || err.message.includes("quota")) {
                    console.warn(`OpenAI Chave #${currentKeyIndex + 1} limitada. Alternando...`);
                    currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                    attempts++;
                    continue;
                }
                console.error("Erro OpenAI, tentando fallback...", err);
                break; // Sai do loop para ir para o fallback do Groq
            }
        }
        
        // --- ÚLTIMA LINHA DE DEFESA: FALLBACK PARA GROQ ---
        console.warn("Todas as chaves OpenAI indisponíveis/sem saldo. Acionando Motor Groq de Emergência!");
        try {
            if (typeof GroqService !== 'undefined') {
                return await fallbackToGroq(fullText, clinicType);
            }
        } catch (e) {
            console.error("Falha no motor de emergência:", e);
        }
        
        throw new Error("Falha total na geração de conclusão (OpenAI fora de cota e sem backup).");
    }

    async function fallbackToGroq(fullText, clinicType) {
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const sysPrompt = `Você é um médico especialista. Sua tarefa é extrair APENAS as conclusões patológicas do laudo. 
REGRAS RÍGIDAS:
- NUNCA escreva frases introdutórias como "Estudo por..."
- APENAS EMPILHE OS DIAGNÓSTICOS UM EMBAIXO DO OUTRO EM TEXTO PURO.
- Converta termos quando aplicável (ex: Irregularidades para Condropatia).
- SEM ASTERISCOS, SEM NÚMEROS. APENAS O DIAGNÓSTICO DIRETO POR LINHA.`;
        
        // Pega qualquer chave da Groq (vamos tentar acessar via window ou pegar a da library global)
        // Para máxima segurança, vamos definir uma função dentro do GroqService mais tarde?
        // Melhor: Criamos GroqService.generateConclusionFallback no arquivo do GroqService!
        if (typeof GroqService.generateConclusionFallback === 'function') {
             return await GroqService.generateConclusionFallback(fullText, clinicType);
        }
        throw new Error("Groq Fallback não definido");
    }

    async function executeRequest(fullText, API_KEY, clinicType = 'base') {
        const url = "https://api.openai.com/v1/chat/completions";

        // --- REGRA CONTEXTUAL PARA FLORIPA (GRADAÇÃO DE CONDROPATIA) ---
        let floripaRules = "";
        if (clinicType === 'floripa') {
            floripaRules = `
=== 🏥 REGRA DE OURO: PADRÃO FLORIPA (CLASSIFICAÇÃO DE GRAUS) ===
Você DEVE obrigatoriamente traduzir achados de cartilagem para a ESCALA DE GRAUS na Impressão:
- GRAU I: Alteração de sinal condral (sem irregularidade).
- GRAU II: Irregularidades ou fissuras SUPERFICIAIS.
- GRAU III: Irregularidades profundas, fissuras PROFUNDAS ou afilamento profundo (SEM edema subcondral).
- GRAU IV: Irregularidades profundas, erosões ou afilamento profundo COM EDEMA ou EXPOSIÇÃO do osso subcondral.

EXEMPLOS REAIS OBRIGATÓRIOS:
- "Alteração de sinal e irregularidades condrais superficiais na faceta medial da patela" -> "Condropatia patelar grau II"
- "Irregularidades condrais do compartimento femorotibial medial com fissuras profundas, sem edema subcondral" -> "Condropatia femorotibial medial grau III"
- "Condropatia patelofemoral com erosões profundas e exposição óssea subcondral" -> "Condropatia patelofemoral grau IV"
`;
        }
        
        const systemPrompt = `Você é um radiologista sênior especialista em laudos médicos.
Sua missão é gerar a seção IMPRESSÃO extraindo TODOS os diagnósticos patológicos ou anormais citados no laudo.

REGRAS RÍGIDAS DE EXTRAÇÃO:
1. COMPLETA: Percorra TODO o documento. Se houver MÚLTIPLAS anormalidades, liste TODAS elas. É PROIBIDO esquecer ou omitir qualquer achado patológico.
2. LISTA LIMPA: Empilhe os diagnósticos UM EMBAIXO DO OUTRO, um por linha.
3. PONTUAÇÃO OBRIGATÓRIA: Você DEVE inserir obrigatoriamente um ponto final (.) ao término de CADA UMA das linhas da impressão diagnóstica. Nenhuma linha pode terminar aberta.
4. SEM FORMATAÇÃO: Proibido usar asteriscos (*), traços (-), números ou marcadores. Apenas texto corrido por linha.
5. SEM INTRODUÇÃO: Nunca escreva "Conclusão:", "Nota:" ou frases genéricas. Vá direto ao ponto.
6. LAUDO NORMAL: Se NÃO houver nenhuma patologia no documento todo, retorne EXATAMENTE: "Estudo por ressonância magnética sem alterações significativas."

${floripaRules}`;

        const payload = {
            model: "gpt-4o-mini", // Modelo rápido e inteligente para resumos médicos
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Gere a IMPRESSÃO para este laudo:\n\n${fullText}` }
            ],
            temperature: 0.1
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        // TELEMETRIA OPENAI (Quota Extraction)
        if (typeof window.updateApiHealth === 'function') {
            const remaining = parseInt(response.headers.get('x-ratelimit-remaining-requests') || "0");
            const limit = parseInt(response.headers.get('x-ratelimit-limit-requests') || "100");
            
            if (response.status === 429) {
                window.updateApiHealth('openai', 0, 'Cota Limite (429)');
            } else if (limit > 0) {
                const pct = Math.round((remaining / limit) * 100);
                window.updateApiHealth('openai', pct, `${pct}% Restantes`);
            } else if (response.ok) {
                window.updateApiHealth('openai', 100, 'Conectado');
            }
        }

        if (!response.ok) {
            throw new Error(`Erro API OpenAI: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) throw new Error("Resposta da OpenAI vazia.");
        
        return content.trim();
    }

    return {
        setApiKey,
        generateConclusion
    };
})();
