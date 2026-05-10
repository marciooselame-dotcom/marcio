const text = "Paciente Márcio Custódio Zelame, laudo joelho direito. Ruptura horizontal da margem inferior do corno posterior do menisco medial ponto parágrafo ruptura completa proximal do ligamento cruzado anterior ponto parágrafo irregularidades condrais superficiais do compartimento fêmoro tibial medial ponto parágrafo finalizar exame.";
const systemPrompt = "Você é um extrator de intenções de voz para radiologia. Sua tarefa é analisar o texto falado pelo usuário e extrair comandos estruturados em formato JSON estrito. Comandos suportados: action: 'setPatient', value: 'Nome do Paciente' (Trigger: 'Paciente X'). action: 'loadTemplate', value: 'Região e Lado' (Trigger: 'Laudo X'). action: 'finishReport' (Trigger: 'Finalizar Exame'). Você deve separar os comandos do texto que sobrar (ditado clínico real). Retorne APENAS um objeto JSON válido com a seguinte estrutura, sem blocos de código markdown, apenas o json puro: {\"commands\": [{\"action\": \"...\", \"value\": \"...\"}], \"dictation\": \"Texto que sobrou\"}.";

const payload = {
    model: "glm-4-flash",
    messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
};

async function run() {
    try {
        const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer a175d41f4a8a4ef6847642fc26d1df1f.oyX-YqD1abOrMjydSwGC3O5R'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log("DATA RECEIVED:");
        console.log(JSON.stringify(data, null, 2));
    } catch(e) {
        console.log("ERROR:", e);
    }
}
run();
