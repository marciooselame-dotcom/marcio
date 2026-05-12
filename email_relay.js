/**
 * EMAIL RELAY SERVICE - SERVIÇO SILENCIOSO DE SEGUNDO PLANO
 * Este micro-serviço roda em seu computador e recebe os pedidos de email do RadVoice
 * e os envia de forma 100% transparente sem abrir janelas.
 */
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const PORT = 3005;

// TENTA CARREGAR CREDENCIAIS DO credentials_local.js
app.post('/send-email', async (req, res) => {
    const { to, subject, text, user, pass } = req.body;
    
    // 🔄 HOT-LOADING: Lê credenciais atualizadas do arquivo a cada requisição!
    let liveSmtpUser = "";
    let liveSmtpPass = "";
    try {
        const credsPath = path.join(__dirname, 'credentials_local.js');
        if (fs.existsSync(credsPath)) {
            const content = fs.readFileSync(credsPath, 'utf8');
            const userMatch = content.match(/SMTP_USER:\s*["'](.*?)["']/);
            const passMatch = content.match(/SMTP_PASS:\s*["'](.*?)["']/);
            if (userMatch) liveSmtpUser = userMatch[1];
            if (passMatch) liveSmtpPass = passMatch[1];
        }
    } catch (e) { console.log("Erro hot-loading."); }

    const finalUser = user || liveSmtpUser || "marcio.oselame@gmail.com";
    const finalPass = pass || liveSmtpPass;

    console.log(`📧 [Email Relay] Recebida solicitação para: ${to}`);

    if (!finalPass) {
        console.error("❌ ERRO: Nenhuma senha de SMTP encontrada.");
        return res.status(400).json({ error: "Senha de email não configurada. Edite credentials_local.js e adicione SMTP_PASS." });
    }

    try {
        // Configura transportador padrão do Gmail
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: finalUser,
                pass: finalPass // Deve ser a Senha de App do Google (16 digitos)
            }
        });

        const mailOptions = {
            from: `"RadVoice AI" <${finalUser}>`,
            to: to || "marcio.oselame@gmail.com",
            subject: subject || "Novo Laudo Radiológico",
            text: text,
            html: req.body.html, // Corpo do email rico
            attachments: req.body.html ? [
                {
                    filename: `Laudo_${(subject || 'Radiologico').replace(/[^a-zA-Z0-9]/g, '_')}.doc`,
                    content: req.body.html, // O Word reconhece HTML dentro de .doc nativamente com perfeição!
                    contentType: 'application/msword'
                }
            ] : []
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email Enviado com Sucesso:", info.messageId);
        res.json({ success: true, messageId: info.messageId });
        
    } catch (error) {
        console.error("❌ Falha ao enviar email:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({ status: "online", mode: "hot-loading" });
});

app.listen(PORT, () => {
    console.log(`\n🚀 ==========================================`);
    console.log(`📡 RELAY DE E-MAIL RADVOICE OPERANTE`);
    console.log(`🌐 Escutando em: http://localhost:${PORT}`);
    console.log(`🔒 Status: AGUARDANDO CONEXÃO DINÂMICA 🔄`);
    console.log(`===========================================\n`);
});
