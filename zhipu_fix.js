/**
 * ZhipuService — Inteligência especializada em Interpretação e Extração de Comandos de Fluxo.
 * Utiliza os modelos GLM para converter a fala bruta do usuário em JSON estruturado de comandos.
 */
const ZhipuService = (() => {
    
    // Pool de Chaves ZhipuAI fornecidas pelo usuário
    const KEYS_POOL = [
        "a175d41f4a8a4ef6847642fc26d1df1f.oyX-YqD1abOrMjydSwGC3O5R",
        "3a69652a6e23439d9f95867a53c122d5.Hv-I2n1GpMQ8ihVtUvd0IG0n"
    ];

    let currentKeyIndex = 0;

    /**
     * Recebe o áudio transcrito bruto do Gemini e utiliza IA para separar comandos e texto limpo.
     * Retorna: { commands: [], dictation: "" }
     */
    async function extractCommands(rawText) {
        if (!rawText || !rawText.trim()) return { commands: [], dictation: "" };

        let attempts = 0;
        while (attempts < KEYS_POOL.length) {
            const currentKey = KEYS_POOL[currentKeyIndex];
            try {
                return await executeExtraction(rawText, currentKey);
            } catch (err) {
                console.warn("ZhipuAI Falhou, rotacionando...", err);
                currentKeyIndex = (currentKeyIndex + 1) % KEYS_POOL.length;
                attempts++;
            }
        }
        
        // Fallback de segurança silencioso para não quebrar a aplicação
        return { commands: [], dictation: rawText };
    }

    async function executeExtraction(text, API_KEY) {
        // A API do Zhipu segue o padrão OpenAI na URL v4
        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        
        const systemPrompt = `Você é um extrator de intenções de voz para radiologia.
Sua tarefa é analisar o texto falado pelo usuário e extrair comandos estruturados em formato JSON estrito.

Comandos suportados:
- action: 'setPatient', value: 'Nome do Paciente' (Trigger: "Paciente X")
- action: 'loadTemplate', value: 'Região e Lado' (Trigger: "Laudo X")
- action: 'finishReport' (Trigger: "Finalizar Exame")

Você deve separar os comandos do texto que sobrar (ditado clínico real).
Retorne APENAS um objeto JSON válido com a seguinte estrutura, sem blocos de código markdown, apenas o json puro:
{"commands": [{"action": "...", "value": "..."}], "dictation": "Texto que sobrou"}

Exemplo de Entrada: "Paciente Carlos Laudo Joelho Direito Ruptura de menisco Finalizar Exame"
Exemplo de Saída: {"commands": [{"action": "setPatient", "value": "Carlos"}, {"action": "loadTemplate", "value": "Joelho Direito"}, {"action": "finishReport", "value": ""}], "dictation": "Ruptura de menisco"}
`;

        const payload = {
            model: "glm-4-flash", // Modelo rápido e econômico para extração estruturada
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Erro API Zhipu: ${response.status}`);
        }

        const data = await response.json();
        const rawJson = data.choices?.[0]?.message?.content;
        
        if (!rawJson) throw new Error("Resposta Vazia");

        // Garante o parse seguro
        try {
            return JSON.parse(rawJson);
        } catch(e) {
            // Tenta limpar se vier com tags ```json
            const cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleaned);
        }
    }

    return {
        extractCommands
    };
})();
