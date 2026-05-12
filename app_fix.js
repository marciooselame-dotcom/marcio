/**
 * App Orchestrator v2.1 — Renderização Baseada em Estado Unificado.
 * Elimina duplicidade e acúmulo caótico de textos.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DA DOM ---
    const textEditor = document.getElementById('finalEditor');
    const btnRecord = document.getElementById('toggle-record');
    const statusDot = document.getElementById('connection-status');
    const micLabel = document.getElementById('status-text');

    // --- ESTADO CENTRAL DO APLICATIVO ---
    let currentWorkflowState = 'IDLE'; 
    let isAutoTransitioning = false; // TRAVA DE SEGURANÇA 1: Evita disparos múltiplos de ativação.
    let isRefiningProcessActive = false; // TRAVA DE SEGURANÇA 2: Evita duplicidade na fusão e no salvamento.
    const docState = {
        patientName: "",
        currentDate: new Date().toLocaleDateString('pt-BR'),
        templateContent: "",
        originalTemplate: "", // MEMÓRIA IMUTÁVEL: Guarda o template virgem para re-geração em outras abas!
        rawDictationBuffer: "", // Acumulado final do Gemini
        currentClinic: "base" // Variável mestre: 'base', 'dasa' ou 'floripa'
    };

    // Função Unificada que "Pinta" a tela com base no estado atual
    function renderEditor() {
        let finalContent = "";

        // 1. O Cabeçalho (Se houver)
        if (docState.patientName) {
            finalContent += `PACIENTE: ${docState.patientName.toUpperCase()}\nDATA: ${docState.currentDate}\n\n`;
        }

        // 2. O Template (Se houver)
        if (docState.templateContent) {
            // Se já houver template, ele é a base.
            // Vamos injetar o texto ditado no buffer raw mais abaixo para o usuário ver 
            // ou fundir visualmente? Vamos apenas colar o template.
            finalContent += docState.templateContent + "\n";
        }

        // 3. A Transcrição Bruta (Exibida para conferência do médico)
        if (docState.rawDictationBuffer.trim()) {
            finalContent += "\n\n--- CONFERÊNCIA DA TRANSCRIÇÃO BRUTA ---\n" + docState.rawDictationBuffer.trim() + "\n";
        }

        textEditor.innerHTML = formatLaudoHTML(finalContent);
        textEditor.scrollTop = textEditor.scrollHeight;
    }

    function updateUIStatus(state, message) {
        if(micLabel) micLabel.innerText = message;
        if(statusDot) statusDot.className = 'status-dot ' + state;
        
        if(btnRecord) {
            if (state === 'listening') {
                btnRecord.classList.add('recording');
            } else {
                btnRecord.classList.remove('recording');
            }
        }
    }

    // --- ORQUESTRADOR DE FASES ---
    const AppStages = {
        
        // ETAPA 1: METADADOS DINÂMICOS
        handleMetadataCommand: (cmd) => {
            console.log("[AppStages] Recebido Comando de Metadados:", cmd);
            
            // ETAPA 1: BLOQUEIA ATÉ RECEBER PACIENTE
            if (cmd.action === 'setPatient' && !docState.patientName) {
                docState.patientName = cmd.value.trim();
                updateUIStatus('success', `✅ Paciente Definido: ${cmd.value}`);
                renderEditor();
                
                // Avisa para a próxima etapa
                setTimeout(() => {
                    if (!docState.templateContent) {
                        updateUIStatus('listening', '👉 ETAPA 2: Fale "Laudo [Parte e Lado]"');
                    }
                }, 1500);
                return;
            }

            // ETAPA 2: SÓ PERMITE SE JÁ TIVER PACIENTE, MAS AINDA NÃO TEM TEMPLATE
            if (cmd.action === 'loadTemplate' && docState.patientName && !docState.templateContent) {
                const lookup = cmd.value.toLowerCase();
                let found = null;
                if (typeof ReportTemplates !== 'undefined') {
                    found = ReportTemplates.getTemplate(lookup);
                }
                
                const finalFound = found || `[TEMPLATE NÃO ENCONTRADO PARA "${cmd.value}"]\nANÁLISE:\n[Aguardando]\nIMPRESSÃO:\nEstudo normal.`;
                docState.templateContent = finalFound;
                docState.originalTemplate = finalFound; // Salva a cópia de segurança para re-processar depois!
                updateUIStatus('success', `✅ Modelo Carregado: ${cmd.value}`);
                renderEditor();
                
                // ETAPA 3: GATILHO DE TRANSIÇÃO AUTOMÁTICA PARA DITADO
                if (!isAutoTransitioning) {
                    isAutoTransitioning = true;
                    updateUIStatus('loading', '🚀 ETAPA 3: Ativando Ditado Contínuo...');
                    setTimeout(() => {
                        if (VoiceEngine.getCurrentPhase() === 'CONFIG') {
                            VoiceEngine.switchToGemini(); // Vai para o motor ininterrupto agora!
                        }
                    }, 50); // Reduzido drasticamente de 1500 para 50ms para eliminar o "Ponto Cego" de áudio!
                }
            }
        },

        // ETAPA 2: DITADO GEMINI
        receiveRawTranscription: async (text, isOverwrite = false) => {
            if (!text || !text.trim()) return;
            
            // Remove gatilhos de finalização visual
            let safeChunk = text.replace(/finalizar exame/gi, "").replace(/concluir relatório/gi, "").trim();
            
            if (safeChunk) {
                if (isOverwrite) {
                    // O Gemini entregou o texto MESTRE definitivo! Substitui o preview rústico.
                    docState.rawDictationBuffer = safeChunk;
                } else {
                    docState.rawDictationBuffer += safeChunk + " ";
                }
                // Renderiza novamente a tela, agora com o texto atualizado
                renderEditor();
            }
        },

        // ETAPA 3 E 4: CASCATA DE INTELIGÊNCIA FINAL
        // Agora aceita um SNAPSHOT para rodar TOTALMENTE EM MEMÓRIA sem tocar na tela (Modo Background)
        executeFinalAiRefinement: async (snapshot = null) => {
            if (isRefiningProcessActive) return; 
            isRefiningProcessActive = true; 
            
            const isBackground = snapshot !== null;
            
            if (!isBackground && btnRecord) btnRecord.disabled = true;
            updateUIStatus('loading', '⚙️ Inteligência em Background Ativa...');

            try {
                // 1. DADOS DE ENTRADA (Pega da tela se manual, pega do snapshot se background)
                // CRÍTICO: Sempre tentamos usar o ORIGINAL BLANK TEMPLATE para re-processamento limpo!
                const fallbackText = docState.originalTemplate || docState.templateContent || textEditor.innerText;
                const baseText = isBackground ? snapshot.templateContent : fallbackText;
                const rawSpeech = isBackground ? snapshot.rawDictationBuffer.trim() : docState.rawDictationBuffer.trim();
                const patientName = isBackground ? snapshot.patientName : docState.patientName;
                const docDate = isBackground ? snapshot.currentDate : docState.currentDate;

                // 🛠️ TELEMETRIA FORENSE (Nível Máximo para diagnóstico de cortes)
                window.FORENSIC_RAW_SPEECH = rawSpeech;
                console.log("%c🔍 [AUDIT] TEXTO BRUTO RECEBIDO DO MICROFONE:", "color: cyan; font-weight: bold; font-size: 14px;");
                console.log(rawSpeech);
                console.log("%c-------------------------------------------", "color: cyan;");

                console.log(`[AI Cascade] Modo Background: ${isBackground}`);
                
                // 🛡️ DISJUNTOR DE SEGURANÇA (FIREWALL): Se a fala veio vazia ou é alucinação de chat, aborte!
                const isChatbotBlabber = rawSpeech.includes("Estou pronto") || rawSpeech.includes("Entendido.") || rawSpeech.includes("Envie o conteúdo");
                
                if (!rawSpeech || rawSpeech.length < 10 || isChatbotBlabber) {
                     console.error("[CRITICAL] Abortando IA: Fala vazia ou detectado papo de chatbot.", rawSpeech);
                     alert("⚠️ ATENÇÃO: O sistema não detectou o áudio do seu laudo ou a gravação falhou.\n\nIsso ocorre se o navegador perder a conexão com o microfone.\n\nPor favor, espere a mensagem verde '🎙️ GRAVANDO' e repita o ditado.");
                     updateUIStatus('error', '❌ Falha na Gravação. Repita.');
                     return; 
                }

                let finalAnalysisText = "";

                // ETAPA 3: DOUBLE-ENGINE REDUNDANT MERGE
                let merged = null;
                
                // TENTATIVA 1: GROQ (Ultra-rápido)
                if (typeof GroqService !== 'undefined' && rawSpeech.length > 3) {
                    merged = await GroqService.smartMerge(rawSpeech, baseText, docState.currentClinic);
                }

                // TENTATIVA 2: GEMINI (Backup de alta estabilidade, acionado se Groq falhar)
                if (!merged && typeof GeminiService !== 'undefined' && typeof GeminiService.smartMerge === 'function' && rawSpeech.length > 3) {
                    console.warn("[Merge Redundancy] Groq indisponível. Acionando motor Gemini Flash para fusão inteligente...");
                    updateUIStatus('processing', 'Otimizando redação via motor secundário (Gemini)...');
                    merged = await GeminiService.smartMerge(rawSpeech, baseText, docState.currentClinic);
                }

                if (merged) {
                    finalAnalysisText = merged;
                } else {
                    // --- ULTIMATE FALLBACK (Apenas se TUDO falhar) ---
                    const marker = "IMPRESSÃO:";
                    const upper = baseText.toUpperCase();
                    const idx = upper.lastIndexOf(marker);
                    
                    if (idx !== -1) {
                        console.warn("[Fallback Final] Ambas as IAs falharam. Preservando ditado no corpo da Análise.");
                        finalAnalysisText = baseText.substring(0, idx) + "\n" + rawSpeech + "\n\n" + baseText.substring(idx);
                    } else {
                        finalAnalysisText = baseText + "\n\n" + rawSpeech;
                    }
                }

                // Salva no estado ativo APENAS se for Modo VISUAL
                if (!isBackground) {
                    docState.templateContent = finalAnalysisText;
                    // NOTA: Deixamos o rawDictationBuffer intacto para que o usuário veja no final do laudo o que foi transcrito!
                    renderEditor();
                }

                // CONSTRUIR TEXTO BASE PARA OPENAI (Precisa ter o cabeçalho junto para dar contexto)
                let header = "";
                if (patientName) {
                    header = `PACIENTE: ${patientName.toUpperCase()}\nDATA: ${docDate}\n\n`;
                }
                
                // Este é o texto COMPLETO enviado para a IA processar a conclusão
                const inputForOpenAI = header + finalAnalysisText;
                
                // ETAPA 4: CONCLUSÃO (OPENAI / FALLBACKS)
                let conclusion = null;

                if (docState.currentClinic === 'dasa') {
                    console.log("[Conclusion Cascade] 🚫 CONTEXTO DASA: Pulando geração de conclusão.");
                    updateUIStatus('processing', '⚙️ Processando DASA (Sem Conclusão)...');
                    // No Dasa, limpamos o marcador de Impressão se a IA inseriu por engano
                    finalAnalysisText = finalAnalysisText.split("IMPRESSÃO:")[0].trim();
                } else {
                    updateUIStatus('loading', '🧠 Gerando Conclusão no fundo...');
                    // --- TIERED FALLBACK PARA CONCLUSÃO (ESTRUTURA TRIPLA DE REDUNDÂNCIA) ---
                    try {
                        if (typeof OpenAIService !== 'undefined') {
                            console.log("[Conclusion Cascade] Tentando OpenAI (Motor Primário)...");
                            conclusion = await OpenAIService.generateConclusion(inputForOpenAI, docState.currentClinic);
                        }
                    } catch (openaiErr) {
                    console.warn("[Conclusion Cascade] ⚠️ OpenAI falhou (Possível Cota Esgotada). Acionando Gemini como Backup A...");
                    try {
                        if (typeof GeminiService !== 'undefined' && typeof GeminiService.generateConclusion === 'function') {
                             conclusion = await GeminiService.generateConclusion(inputForOpenAI, docState.currentClinic);
                             console.log("[Conclusion Cascade] ✅ Gemini gerou a conclusão com sucesso!");
                        }
                    } catch (geminiErr) {
                         console.warn("[Conclusion Cascade] 🚨 Gemini Backup A também falhou! Acionando Groq como Backup B...");
                         try {
                             if (typeof GroqService !== 'undefined' && typeof GroqService.generateConclusionFallback === 'function') {
                                 conclusion = await GroqService.generateConclusionFallback(inputForOpenAI, docState.currentClinic);
                                 console.log("[Conclusion Cascade] ✅ Groq Backup B resgatou a conclusão!");
                             }
                         } catch (groqErr) {
                             console.error("[Conclusion Cascade] 💀 FALHA TOTAL: Todos os 3 motores de conclusão falharam.");
                         }
                    }
                    }
                }

                // MONTAGEM FINAL DO DOCUMENTO
                let finalTotalDocument = inputForOpenAI;
                if (conclusion) {
                    const marker = "IMPRESSÃO:";
                    const upper = inputForOpenAI.toUpperCase();
                    const idx = upper.lastIndexOf(marker);

                    if (idx !== -1) {
                        finalTotalDocument = inputForOpenAI.substring(0, idx + marker.length) + "\n" + conclusion;
                    } else {
                        finalTotalDocument = inputForOpenAI + "\n\nIMPRESSÃO:\n" + conclusion;
                    }
                }

                // APLICAÇÃO DO RESULTADO
                if (isBackground) {
                    // MODO BACKGROUND: Salva direto no Histórico sem mexer na tela!
                    console.log("[Background AI] Concluído com Sucesso! Enviando direto para Histórico...");
                    if (window.triggerSilentAutoSave) {
                        window.triggerSilentAutoSave(finalTotalDocument, patientName);
                    }
                    updateUIStatus('success', '✅ Laudo Concluído e Salvo em Histórico.');
                } else {
                    // MODO VISUAL: Escreve na tela para o usuário ver.
                    textEditor.innerHTML = formatLaudoHTML(finalTotalDocument);
                    updateUIStatus('success', '✅ EXAME CONCLUÍDO.');
                    confettiVisualEffect();
                    if (window.triggerSilentAutoSave) {
                        window.triggerSilentAutoSave(textEditor.innerText, patientName);
                    }
                }

                // 📧 DISPARO SILENCIOSO EM SEGUNDO PLANO (NOVO!)
                sendReportByEmail(true);

            } catch (err) {
                console.error("Falha na Cascata de IA:", err);
                updateUIStatus('error', 'Erro fatal no processamento.');
            } finally {
                isRefiningProcessActive = false; // LIBERAÇÃO CRÍTICA: Garante recuperação total após falha ou sucesso.
                if(btnRecord) btnRecord.disabled = false;
            }
        }
    };

    /**
     * SISTEMA DE TELEMETRIA E MONITORAMENTO DE APIS
     * Chamado pelos serviços para atualizar as barras visuais do sidebar em tempo real
     */
    window.updateApiHealth = function(service, percent, message) {
        const barId = `${service}-bar`;
        const textId = `${service}-stat-text`;
        
        const bar = document.getElementById(barId);
        const text = document.getElementById(textId);
        
        if (bar) {
            bar.style.width = `${percent}%`;
            // Troca cor baseado no percentual crítico
            if (percent < 20) {
                bar.style.background = 'linear-gradient(90deg, #ef4444, #b91c1c)'; 
            } else if (percent < 50) {
                bar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)'; 
            } else {
                if (service === 'gemini') bar.style.background = 'linear-gradient(90deg, #0ea5e9, #3b82f6)';
                if (service === 'groq') bar.style.background = 'linear-gradient(90deg, #f59e0b, #f97316)';
                if (service === 'openai') bar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
            }
        }
        if (text) {
            text.textContent = message;
            text.style.color = percent < 20 ? 'var(--accent-danger)' : (percent < 50 ? 'var(--accent-warning)' : 'var(--accent-success)');
        }
    };

    /**
     * EVENTO DE ENVIO POR E-MAIL (AGORA EM SEGUNDO PLANO VIA RELAY NODE!)
     */
    async function sendReportByEmail(silent = false) {
        const text = textEditor.innerText || "";
        if (!text || text.length < 10) return;

        const lines = text.split("\n");
        let paciente = "Laudo Radiológico";
        for (const line of lines) {
            if (line.toUpperCase().includes("PACIENTE:")) {
                paciente = line.split(":")[1]?.trim() || "Laudo";
                break;
            }
        }

        const dest = "marcio.oselame@gmail.com";
        const subject = `Laudo Digital | ${paciente}`;

        if (!silent) updateUIStatus('processing', 'Disparando e-mail silencioso...');

        try {
            // Chama o Micro-serviço local rodando na porta 3005
            const response = await fetch('http://localhost:3005/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: dest,
                    subject: subject,
                    text: text,
                    html: `<div style="font-family: 'Arial', sans-serif; font-size: 12pt; line-height: 1.5; text-align: left; color: #000000;">${formatLaudoHTML(textEditor.innerText || "")}</div>`
                })
            });

            const result = await response.json();
            if (result.success) {
                console.log("[Email Pipeline] ✅ E-mail enviado em segundo plano com sucesso!");
                if (!silent) updateUIStatus('success', '✅ E-mail enviado com sucesso!');
            } else {
                console.warn("[Email Pipeline] ⚠️ Falha no Relay:", result.error);
                // Se falhar em background, fallback para o mailto clássico somente se o usuário CLICOU manualmente!
                if (!silent) {
                     alert("Ainda não configurou sua Senha de App do Google no servidor local. Abrindo cliente de e-mail manual...");
                     window.open(`mailto:${dest}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, '_self');
                }
            }
        } catch (err) {
            console.error("[Email Pipeline] Micro-serviço offline ou não configurado:", err);
            if (!silent) {
                // Fallback seguro se o servidor node cair
                window.open(`mailto:${dest}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, '_self');
            }
        }
    }


    // --- BOOTSTRAP DO MOTOR ---
    VoiceEngine.init({
        onPhaseChange: (phase) => { currentWorkflowState = phase; },
        onStatusChange: (s, m) => { updateUIStatus(s, m); },
        onCommand: async (cmd) => {
            if (cmd.action === 'FORCE_FINISH') {
                console.log("[AutoWorkflow] Comando Final Detectado. Rodando IA Refinamento no modo Visual...");
                
                // 1. NÃO limpa a tela mais! Apenas atualiza o status visualmente.
                updateUIStatus('loading', '🚀 Processando IA (Por favor, aguarde)...');

                // 2. DISPARO DO MODO VISUAL (passando null forçamos rodar NA TELA)
                setTimeout(() => {
                    AppStages.executeFinalAiRefinement(null);
                }, 100);

            } else {
                AppStages.handleMetadataCommand(cmd);
            }
        },
        onRawTranscription: async (text, isFinalOverwrite) => {
            await AppStages.receiveRawTranscription(text, isFinalOverwrite);
        }
    });

    // --- CLIQUES DO USUÁRIO ---
    if (btnRecord) {
        btnRecord.addEventListener('click', () => {
            const phase = VoiceEngine.getCurrentPhase();
            if (phase === 'IDLE' || phase === 'OFF') {
                // Reset Total do Estado
                docState.patientName = "";
                docState.templateContent = "";
                docState.rawDictationBuffer = "";
                textEditor.innerHTML = "";
                isAutoTransitioning = false; 
                isRefiningProcessActive = false; // Libera para o próximo laudo
                VoiceEngine.startConfig();
            } else if (phase === 'CONFIG') {
                // Permite ao médico clicar no botão para FORÇAR a leitura do Gemini AGORA! (Segurança)
                updateUIStatus('loading', '⚡ Processando entrada manual...');
                VoiceEngine.commitCurrentConfig();
            } else if (phase === 'DICTATION') {
                (async () => {
                    await VoiceEngine.kill(); // Aguarda o flush final do áudio antes de rodar Groq!
                    await AppStages.executeFinalAiRefinement();
                })();
            }
        });
    }

    // --- HELPERS DE UI ---
    function formatLaudoHTML(text) {
        if (!text) return "";
        let html = text.replace(/\n/g, '<br>');
        const keywords = [
            "RESSONÂNCIA MAGNÉTICA DO JOELHO DIREITO",
            "RESSONÂNCIA MAGNÉTICA", 
            "TÉCNICA:", "ANÁLISE:", "IMPRESSÃO:", "RELATÓRIO:", "PACIENTE:", "DATA:",
            "TÉCNICA", "ANÁLISE", "IMPRESSÃO" // Sem dois pontos como fallback
        ];
        // Ordena por tamanho decrescente para que "ANÁLISE:" combine ANTES de "ANÁLISE", evitando duplicação de tags!
        const sortedKeywords = keywords.sort((a, b) => b.length - a.length);
        
        // Constrói UMA ÚNICA REGEX MONOLÍTICA combinando todas as possibilidades com OR (|)
        // Escapa caracteres especiais se houver, embora aqui sejam literais seguros.
        const pattern = "(" + sortedKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ")";
        const r = new RegExp(pattern, "gi");
        
        // Executa UMA ÚNICA PASSADA para garantir que não haverá colisão ou aninhamento de tags!
        // Usamos STRONG com FONT-WEIGHT explícito, que tem 100% de compatibilidade em E-mails (Outlook/Gmail)
        html = html.replace(r, '<strong style="font-weight: bold;">$1</strong>');
        
        return html;
    }

    function confettiVisualEffect() {
        document.body.style.transition = "background 0.5s";
        const old = document.body.style.backgroundColor;
        document.body.style.backgroundColor = "#0f2e1e";
        setTimeout(() => { document.body.style.backgroundColor = old; }, 1000);
    }

    // --- SISTEMA DE HISTÓRICO LOCAL PERSISTENTE ---
    const btnCopy = document.getElementById('btn-copy');
    const btnSave = document.getElementById('btn-save');
    const navNew = document.getElementById('nav-new');
    const navHistory = document.getElementById('nav-history');
    
    const historyOverlay = document.getElementById('history-overlay');
    const closeHistoryBtn = document.getElementById('close-history-btn');
    const historyList = document.getElementById('history-list-container');

    function getLocalHistory() {
        try {
            const raw = localStorage.getItem('radvoice_report_history');
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    }

    function executeCoreSave(isSilent = false, overrideText = null, overridePatient = null) {
        const contentText = overrideText !== null ? overrideText : (textEditor.innerText || "");
        const finalPatient = overridePatient !== null ? overridePatient : (docState.patientName || "PACIENTE NÃO IDENTIFICADO");
        
        // Validação básica anti-lixo
        if (contentText.length < 30 || contentText.includes("Clique ou dite para começar")) {
            if(!isSilent) alert("⚠️ O laudo parece estar vazio para salvar.");
            return;
        }

        try {
            const history = getLocalHistory();
            const entry = {
                id: Date.now(),
                timestamp: new Date().toLocaleString('pt-BR'),
                patient: finalPatient,
                fullText: contentText
            };

            history.unshift(entry);
            localStorage.setItem('radvoice_report_history', JSON.stringify(history.slice(0, 50)));

            // Feedback visual sem travar o fluxo do usuário
            btnSave.innerText = "✅ SALVO AUTOMATICAMENTE!";
            setTimeout(() => btnSave.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Salvar Laudo`, 3000);

            if (!isSilent) {
                if(confirm("Laudo salvo no Histórico com SUCESSO! Deseja limpar a tela para iniciar um NOVO Laudo?")) {
                    clearSystemState();
                }
            }
        } catch(err) {
            console.error("Falha crítica ao salvar no LocalStorage:", err);
        }
    }

    function saveReportToHistory() {
        executeCoreSave(false); // Modo Manual com confirmação
    }

    // Exporta para o AppStages conseguir chamar no fundo, permitindo passar texto desacoplado da tela
    window.triggerSilentAutoSave = (textOverride, patientOverride) => executeCoreSave(true, textOverride, patientOverride);


    function openHistoryModal() {
        const list = getLocalHistory();
        historyList.innerHTML = "";

        if (list.length === 0) {
            historyList.innerHTML = `<div style="text-align:center; color:var(--text-dim); margin-top:40px; font-style:italic;">Nenhum laudo salvo no histórico ainda.</div>`;
        } else {
            list.forEach(item => {
                const div = document.createElement('div');
                div.className = "history-card";
                div.innerHTML = `
                    <div class="h-patient">${item.patient.toUpperCase()}</div>
                    <div class="h-meta">${item.timestamp}</div>
                `;
                div.onclick = () => {
                    if(confirm(`Deseja carregar o laudo de ${item.patient} na tela? O laudo atual será sobrescrito.`)) {
                        textEditor.innerHTML = formatLaudoHTML(item.fullText);
                        // Reconstitui minimamente o estado
                        docState.patientName = item.patient;
                        closeHistoryModal();
                    }
                };
                historyList.appendChild(div);
            });
        }

        historyOverlay.style.display = "flex";
        setTimeout(() => historyOverlay.classList.add('visible'), 10);
    }

    function closeHistoryModal() {
        historyOverlay.classList.remove('visible');
        setTimeout(() => historyOverlay.style.display = "none", 300);
    }

    function clearSystemState() {
        docState.patientName = "";
        docState.templateContent = "";
        docState.rawDictationBuffer = "";
        isAutoTransitioning = false; 
        isRefiningProcessActive = false; // Destrava tudo.
        textEditor.innerHTML = "Clique ou dite para começar o laudo...";
        VoiceEngine.kill();
        updateUIStatus('idle', 'Aguardando...');
    }

    // --- BINDINGS DOS EVENTOS ---

    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            const plainText = textEditor.innerText || "";
            const htmlContent = `<div style="font-family: 'Arial', sans-serif; font-size: 12pt; text-align: left; line-height: 1.5; color: #000000;">${formatLaudoHTML(plainText)}</div>`;
            
            const typeHtml = "text/html";
            const typePlain = "text/plain";
            
            const blobHtml = new Blob([htmlContent], { type: typeHtml });
            const blobPlain = new Blob([plainText], { type: typePlain });
            
            const clipboardItem = new ClipboardItem({
                [typeHtml]: blobHtml,
                [typePlain]: blobPlain
            });

            navigator.clipboard.write([clipboardItem]).then(() => {
                const backup = btnCopy.innerText;
                btnCopy.innerText = "✅ Copiado com Formatação!";
                setTimeout(() => btnCopy.innerText = backup, 2000);
            }).catch(err => {
                console.warn("Erro ao copiar com formatação, tentando modo texto simples:", err);
                // Fallback para texto puro se o navegador reclamar
                navigator.clipboard.writeText(plainText).then(() => {
                    btnCopy.innerText = "Copiado (Apenas Texto)";
                    setTimeout(() => btnCopy.innerText = "Copiar Laudo", 2000);
                });
            });
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', saveReportToHistory);
    }

    const btnEmail = document.getElementById('btn-email');
    if (btnEmail) {
        btnEmail.addEventListener('click', sendReportByEmail);
    }

    if (navNew) {
        navNew.addEventListener('click', () => {
            if(confirm("Tem certeza que deseja começar do zero? O laudo atual será PERDIDO se não tiver sido salvo.")) {
                clearSystemState();
            }
        });
    }

    if (navHistory) {
        navHistory.addEventListener('click', openHistoryModal);
    }

    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', closeHistoryModal);
    }

    // --- SISTEMA DE SELEÇÃO DE CLÍNICA / WORKSPACE ---
    const clinicTabs = document.querySelectorAll('.clinic-tab');
    clinicTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 1. Remove active de todos
            clinicTabs.forEach(t => t.classList.remove('active'));
            
            // 2. Adiciona no clicado
            tab.classList.add('active');
            
            // 3. Sincroniza com o Estado Mestre
            const targetClinic = tab.getAttribute('data-clinic') || 'base';
            docState.currentClinic = targetClinic;
            
            console.log(`🚀 [Contexto] Workspace alterado para: ${targetClinic.toUpperCase()}`);
            
            // Feedback visual de transição
            const labels = { base: 'Padrão Base', dasa: 'Grupo DASA', floripa: 'Floripa' };
            updateUIStatus('success', `Contexto: ${labels[targetClinic]}`);

            // 🔥 INTELIGÊNCIA RETROATIVA: Se o usuário já ditou algo, RE-PROCESSA INSTANTANEAMENTE para o novo formato!
            if (docState.rawDictationBuffer && docState.rawDictationBuffer.trim().length > 10) {
                console.log("[Retroativo] Dictação ativa detectada. Disparando conversão automática de formato...");
                isRefiningProcessActive = false; // Desbloqueia trava de re-entrada
                updateUIStatus('loading', `Convertendo laudo para ${labels[targetClinic]}...`);
                
                // Dispara a cascata de IA com o novo contexto setado!
                setTimeout(() => {
                    AppStages.executeFinalAiRefinement();
                }, 100);
            }
        });
    });

    // Fecha se clicar fora da modal
    window.addEventListener('click', (e) => {
        if (e.target === historyOverlay) closeHistoryModal();
    });

});
