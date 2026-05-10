const text = "Paciente Márcio Custódio Zelame, laudo joelho direito. Ruptura horizontal da margem inferior.";
const payload = { model: "glm-4-flash", messages: [{ role: "user", content: text }] };

async function run() {
    try {
        const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 3a69652a6e23439d9f95867a53c122d5.Hv-I2n1GpMQ8ihVtUvd0IG0n'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log("TEST KEY 2 RESPONSE:", JSON.stringify(data, null, 2));
    } catch(e) { console.log(e); }
}
run();
